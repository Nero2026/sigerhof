const PROXY_URL = "https://beleuchtung-secure-worker.remo-bossart.workers.dev"
const POLL_MS = 5000
const REQUEST_TIMEOUT_MS = 7000
const CLICK_DEBOUNCE_MS = 600

const controls = [
  { key: "test-shelly", label: "Test-Shelly", btn: document.getElementById("btnTestShelly") },
  { key: "platzlampe", label: "Platzlampe", btn: document.getElementById("btnPlatzlampe") },
  { key: "scheune-vorne", label: "Licht Scheune vorne", btn: document.getElementById("btnScheuneVorne") }
]

let inFlight = false
let isSwitching = false
let pollingTimer = null
const debounceUntil = new Map()

function setButtonState(button, isOn) {
  if (isOn) {
    button.classList.remove("switchOff")
    button.classList.add("switchOn")
  } else {
    button.classList.remove("switchOn")
    button.classList.add("switchOff")
  }
}

function updateButtonsEnabled() {
  const now = Date.now()
  for (const control of controls) {
    const blockedUntil = debounceUntil.get(control.key) || 0
    control.btn.disabled = isSwitching || now < blockedUntil
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

async function getStatus(control) {
  if (isSwitching) return null
  const res = await runRequest(`/api/${encodeURIComponent(control.key)}/status`)
  if (!res) return null

  const data = await res.json()
  setButtonState(control.btn, Boolean(data && data.on))
  return data
}

async function switchDevice(control) {
  const now = Date.now()
  const blockedUntil = debounceUntil.get(control.key) || 0
  if (isSwitching || inFlight || now < blockedUntil) return

  isSwitching = true
  stopPolling()

  debounceUntil.set(control.key, now + CLICK_DEBOUNCE_MS)
  updateButtonsEnabled()

  const shouldTurnOn = !control.btn.classList.contains("switchOn")
  const route = shouldTurnOn ? "on" : "off"

  try {
    const cmdRes = await runRequest(`/api/${encodeURIComponent(control.key)}/${route}`)
    if (!cmdRes) return

    // Update only after real status confirmation from backend.
    inFlight = true
    try {
      const statusRes = await fetchWithTimeout(
        PROXY_URL + `/api/${encodeURIComponent(control.key)}/status`,
        REQUEST_TIMEOUT_MS,
        { method: "GET", cache: "no-store" }
      )
      if (!statusRes.ok) throw new Error("HTTP " + statusRes.status)
      const statusData = await statusRes.json()
      setButtonState(control.btn, Boolean(statusData && statusData.on))
    } finally {
      inFlight = false
    }
  } catch {
    alert(`Fehler beim Schalten: ${control.label}`)
  } finally {
    const waitMs = Math.max(0, (debounceUntil.get(control.key) || 0) - Date.now())
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
  for (const control of controls) {
    if (isSwitching || inFlight) return
    try {
      await getStatus(control)
    } catch {
      // Keep last known state on polling error.
    }
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

function bindClicks() {
  for (const control of controls) {
    control.btn.addEventListener("click", () => {
      switchDevice(control)
    })
  }
}

bindClicks()
updateButtonsEnabled()
pollOnce()
startPolling()
