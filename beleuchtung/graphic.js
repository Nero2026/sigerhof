const PROXY_URL = "https://beleuchtung-secure-worker.remo-bossart.workers.dev"
const POLL_MS = 5000
const REQUEST_TIMEOUT_MS = 7000
const CLICK_DEBOUNCE_MS = 600

const controls = [
  {
    key: "test-shelly",
    button: document.getElementById("regionTestShelly")
  },
  {
    key: "platzlampe",
    button: document.getElementById("regionPlatzlampe")
  },
  {
    key: "scheune-vorne",
    button: document.getElementById("regionScheuneVorne")
  }
]

let inFlight = false
let isSwitching = false
let pollingTimer = null
const debounceUntil = new Map()

function setRegionState(button, isOn) {
  if (!button) return
  button.classList.toggle("active", isOn)
}

function updateButtonsEnabled() {
  const now = Date.now()
  for (const control of controls) {
    const blockedUntil = debounceUntil.get(control.key) || 0
    control.button.disabled = isSwitching || now < blockedUntil
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
  setRegionState(control.button, Boolean(data && data.on))
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

  const shouldTurnOn = !control.button.classList.contains("active")
  const route = shouldTurnOn ? "on" : "off"

  try {
    setRegionState(control.button, shouldTurnOn)

    const cmdRes = await runRequest(`/api/${encodeURIComponent(control.key)}/${route}`)
    if (!cmdRes) return

    try {
      inFlight = true
      const statusRes = await fetchWithTimeout(
        PROXY_URL + `/api/${encodeURIComponent(control.key)}/status`,
        REQUEST_TIMEOUT_MS,
        { method: "GET", cache: "no-store" }
      )
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setRegionState(control.button, Boolean(statusData && statusData.on))
      }
    } finally {
      inFlight = false
    }
  } catch {
    setRegionState(control.button, !shouldTurnOn)
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

for (const control of controls) {
  control.button.addEventListener("click", () => {
    switchDevice(control)
  })
}

updateButtonsEnabled()
pollOnce()
startPolling()
