const PROXY_URL = "https://beleuchtung-secure-worker.remo-bossart.workers.dev"
const DEVICES_CONFIG_URL = new URL("./devices.json", import.meta.url)
const POLL_MS = 3000
const REQUEST_TIMEOUT_MS = 7000
const CLICK_DEBOUNCE_MS = 600
const STATE_EVENT_KEY = "sigerhof:beleuchtung:state"
const STATE_CACHE_KEY = "sigerhof:beleuchtung:state-cache"
const CHANNEL_NAME = "sigerhof-beleuchtung-sync"
const INSTANCE_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`

const deviceElements = new Map()
const deviceState = new Map()
const debounceUntil = new Map()
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null

let inFlight = false
let isSwitching = false
let pollingTimer = null

function normalizeDevicesConfig(payload) {
  const list = Array.isArray(payload?.devices) ? payload.devices : []
  return list
    .map((device) => ({
      key: String(device?.key || "").trim(),
      name: String(device?.name || "").trim(),
      enabled: device?.enabled !== false,
      controllable: device?.controllable !== false,
      graphic: {
        ariaLabel: String(device?.graphic?.ariaLabel || "").trim(),
        style: String(device?.graphic?.style || "").trim()
      }
    }))
    .filter((device) => device.key && device.name && device.enabled)
}

async function loadDevicesConfig() {
  const res = await fetchWithTimeout(DEVICES_CONFIG_URL, REQUEST_TIMEOUT_MS, { method: "GET" })
  if (!res.ok) {
    throw new Error(`config_http_${res.status}`)
  }

  return normalizeDevicesConfig(await res.json())
}

function renderDeviceList(devices) {
  const container = document.getElementById("deviceList")
  if (!container) return

  container.innerHTML = ""

  for (const device of devices) {
    const button = document.createElement("button")
    button.className = "switchBtn switchOff"
    button.dataset.deviceKey = device.key
    button.type = "button"
    button.textContent = device.name
    button.setAttribute("aria-label", device.name)
    if (!device.controllable) {
      button.disabled = true
      button.title = "Noch nicht mit dem Worker verbunden."
      button.setAttribute("aria-description", "Noch nicht mit dem Worker verbunden.")
    }
    container.appendChild(button)
  }
}

function renderPlanRegions(devices) {
  const container = document.getElementById("planRegions")
  if (!container) return

  container.innerHTML = ""

  for (const device of devices) {
    if (!device.graphic.style) continue

    const button = document.createElement("button")
    button.className = "regionBtn"
    button.dataset.deviceKey = device.key
    button.type = "button"
    button.style.cssText = device.graphic.style
    button.setAttribute("aria-label", device.graphic.ariaLabel || device.name)
    if (!device.controllable) {
      button.disabled = true
      button.title = "Noch nicht mit dem Worker verbunden."
      button.setAttribute("aria-description", "Noch nicht mit dem Worker verbunden.")
    }
    container.appendChild(button)
  }
}

function showConfigError(message) {
  const list = document.getElementById("deviceList")
  if (list) {
    list.innerHTML = `<div class="sub">${message}</div>`
  }

  const regions = document.getElementById("planRegions")
  if (regions) {
    regions.innerHTML = ""
  }
}

function registerControls() {
  const elements = document.querySelectorAll("[data-device-key]")
  for (const element of elements) {
    const key = String(element.dataset.deviceKey || "").trim()
    if (!key) continue

    const list = deviceElements.get(key) || []
    list.push(element)
    deviceElements.set(key, list)

    element.addEventListener("click", () => {
      switchDevice(key)
    })
  }
}

function getElements(key) {
  return deviceElements.get(key) || []
}

function getKnownState(key) {
  return deviceState.get(key) || { on: false }
}

function hasBoolean(value) {
  return typeof value === "boolean"
}

function resolveEffectiveOn(prevState, nextState) {
  const hasOn = hasBoolean(nextState.on)
  const hasInput = hasBoolean(nextState.inputOn)

  if (hasOn && hasInput) {
    const prevOn = Boolean(prevState.on)
    const prevInput = hasBoolean(prevState.inputOn) ? prevState.inputOn : null
    const relayChanged = nextState.on !== prevOn
    const inputChanged = prevInput === null ? false : nextState.inputOn !== prevInput

    if (relayChanged) return nextState.on
    if (inputChanged) return nextState.inputOn
    return nextState.on
  }

  if (hasOn) return nextState.on
  if (hasInput) return nextState.inputOn
  return Boolean(prevState.on)
}

function setButtonState(element, isOn) {
  if (element.classList.contains("switchBtn")) {
    element.classList.toggle("switchOn", isOn)
    element.classList.toggle("switchOff", !isOn)
  }

  if (element.classList.contains("regionBtn")) {
    element.classList.toggle("active", isOn)
  }
}

function applyDeviceState(key, nextState) {
  const prevState = getKnownState(key)
  const merged = {
    ...prevState,
    ...nextState,
    on: resolveEffectiveOn(prevState, nextState)
  }
  deviceState.set(key, merged)
  persistStateCache()

  for (const element of getElements(key)) {
    setButtonState(element, merged.on)
    const title = buildTitle(element, merged)
    if (title) {
      element.title = title
      element.setAttribute("aria-description", title)
    }
  }
}

function buildTitle(element, state) {
  const label = element.getAttribute("aria-label") || element.textContent || state.key || ""
  const parts = [`${label.trim()}: ${state.on ? "Ein" : "Aus"}`]

  if (typeof state.inputOn === "boolean") {
    parts.push(`SW: ${state.inputOn ? "Aktiv" : "Inaktiv"}`)
  }

  if (state.source) {
    parts.push(`Quelle: ${state.source}`)
  }

  return parts.join(" | ")
}

function persistStateCache() {
  const payload = {}
  for (const [key, state] of deviceState.entries()) {
    payload[key] = {
      on: Boolean(state.on),
      inputOn: typeof state.inputOn === "boolean" ? state.inputOn : null,
      online: typeof state.online === "boolean" ? state.online : null,
      source: state.source || "",
      updated: state.updated || null
    }
  }

  try {
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore cache persistence issues.
  }
}

function hydrateStateCache() {
  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY)
    if (!raw) return

    const payload = JSON.parse(raw)
    if (!payload || typeof payload !== "object") return

    for (const key of deviceElements.keys()) {
      if (!payload[key]) continue
      applyDeviceState(key, { key, ...payload[key] })
    }
  } catch {
    // Ignore malformed cached state.
  }
}

function hydrateLastEvent() {
  try {
    const raw = localStorage.getItem(STATE_EVENT_KEY)
    if (!raw) return

    const payload = JSON.parse(raw)
    if (!payload || !payload.key) return
    if (!deviceElements.has(payload.key)) return

    applyDeviceState(payload.key, payload)
  } catch {
    // Ignore malformed sync state.
  }
}

function publishState(key, state, origin) {
  const payload = {
    key,
    on: Boolean(state.on),
    inputOn: typeof state.inputOn === "boolean" ? state.inputOn : null,
    online: typeof state.online === "boolean" ? state.online : null,
    source: state.source || "",
    updated: state.updated || null,
    origin,
    sender: INSTANCE_ID,
    at: Date.now()
  }

  try {
    localStorage.setItem(STATE_EVENT_KEY, JSON.stringify(payload))
  } catch {
    // Ignore local storage sync issues.
  }

  if (channel) {
    channel.postMessage(payload)
  }
}

function consumePublishedState(payload) {
  if (!payload || !payload.key) return
  applyDeviceState(payload.key, payload)
}

function updateButtonsEnabled() {
  const now = Date.now()
  for (const [key, elements] of deviceElements.entries()) {
    const blockedUntil = debounceUntil.get(key) || 0
    const disabled = isSwitching || now < blockedUntil
    for (const element of elements) {
      element.disabled = disabled
    }
  }
}

async function fetchWithTimeout(url, ms, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

async function runRequest(path) {
  if (inFlight) return null
  inFlight = true
  try {
    const res = await fetchWithTimeout(PROXY_URL + path, REQUEST_TIMEOUT_MS, { method: "GET" })
    if (!res.ok) throw new Error("HTTP " + res.status)
    return res
  } finally {
    inFlight = false
  }
}

async function getStatus(key) {
  if (isSwitching) return null
  const res = await runRequest(`/api/${encodeURIComponent(key)}/status`)
  if (!res) return null

  const data = await res.json()
  const nextState = {
    key,
    on: Boolean(data && data.on),
    inputOn: typeof data?.inputOn === "boolean" ? data.inputOn : null,
    online: Boolean(data && data.online),
    source: data?.source || "poll",
    updated: data?.updated || null
  }

  applyDeviceState(key, nextState)
  publishState(key, nextState, "poll")
  return nextState
}

async function getAllStatus() {
  if (isSwitching) return null
  const res = await runRequest("/api/status-all")
  if (!res) return null

  const data = await res.json()
  if (!data || typeof data !== "object") return null

  for (const key of deviceElements.keys()) {
    const state = data[key]
    if (!state || typeof state !== "object") continue

    const nextState = {
      key,
      on: Boolean(state.on),
      inputOn: typeof state.inputOn === "boolean" ? state.inputOn : null,
      online: Boolean(state.online),
      source: state.source || "poll",
      updated: state.updated || null
    }

    applyDeviceState(key, nextState)
    publishState(key, nextState, "poll")
  }

  return data
}

async function confirmStatus(key) {
  inFlight = true
  try {
    const res = await fetchWithTimeout(
      PROXY_URL + `/api/${encodeURIComponent(key)}/status`,
      REQUEST_TIMEOUT_MS,
      { method: "GET", cache: "no-store" }
    )

    if (!res.ok) return null
    const data = await res.json()
    const nextState = {
      key,
      on: Boolean(data && data.on),
      inputOn: typeof data?.inputOn === "boolean" ? data.inputOn : null,
      online: Boolean(data && data.online),
      source: data?.source || "confirm",
      updated: data?.updated || null
    }

    applyDeviceState(key, nextState)
    publishState(key, nextState, "confirm")
    return nextState
  } catch {
    return null
  } finally {
    inFlight = false
  }
}

async function switchDevice(key) {
  const now = Date.now()
  const blockedUntil = debounceUntil.get(key) || 0
  if (isSwitching || inFlight || now < blockedUntil) return

  isSwitching = true
  stopPolling()

  debounceUntil.set(key, now + CLICK_DEBOUNCE_MS)
  updateButtonsEnabled()

  const current = getKnownState(key)
  const shouldTurnOn = !current.on
  const route = shouldTurnOn ? "on" : "off"

  try {
    const optimisticState = {
      key,
      ...current,
      on: shouldTurnOn,
      source: "ui"
    }
    applyDeviceState(key, optimisticState)
    publishState(key, optimisticState, "ui")

    const cmdRes = await runRequest(`/api/${encodeURIComponent(key)}/${route}`)
    if (!cmdRes) return

    await confirmStatus(key)
  } catch {
    const rollbackState = {
      key,
      ...current,
      on: current.on,
      source: "rollback"
    }
    applyDeviceState(key, rollbackState)
    publishState(key, rollbackState, "rollback")
  } finally {
    const waitMs = Math.max(0, (debounceUntil.get(key) || 0) - Date.now())
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    isSwitching = false
    updateButtonsEnabled()
    startPolling()
  }
}

async function pollOnce() {
  if (isSwitching || inFlight) return
  try {
    await getAllStatus()
  } catch {
    // Keep last known state on polling error.
  }
}

function startPolling() {
  if (pollingTimer) return
  pollingTimer = setInterval(() => {
    pollOnce()
  }, POLL_MS)
}

function stopPolling() {
  if (!pollingTimer) return
  clearInterval(pollingTimer)
  pollingTimer = null
}

window.addEventListener("storage", (event) => {
  if (event.key !== STATE_EVENT_KEY || !event.newValue) return

  try {
    const payload = JSON.parse(event.newValue)
    if (payload.sender === INSTANCE_ID) return
    consumePublishedState(payload)
  } catch {
    // Ignore malformed sync events.
  }
})

if (channel) {
  channel.addEventListener("message", (event) => {
    const payload = event.data
    if (!payload || payload.sender === INSTANCE_ID) return
    consumePublishedState(payload)
  })
}

async function init() {
  try {
    const devices = await loadDevicesConfig()
    renderDeviceList(devices)
    renderPlanRegions(devices)
  } catch {
    showConfigError("Geraeteliste konnte nicht geladen werden.")
    return
  }

  registerControls()
  hydrateStateCache()
  hydrateLastEvent()
  updateButtonsEnabled()
  pollOnce()
  startPolling()

  window.addEventListener("pageshow", () => {
    updateButtonsEnabled()
    pollOnce()
  })

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return
    updateButtonsEnabled()
    pollOnce()
  })
}

init()
