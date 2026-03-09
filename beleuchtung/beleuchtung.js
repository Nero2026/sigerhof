const PROXY_URL = "https://beleuchtung-secure-worker.remo-bossart.workers.dev"
const POLL_MS = 5000
const REQUEST_TIMEOUT_MS = 7000
const CLICK_DEBOUNCE_MS = 600
const STATE_EVENT_KEY = "sigerhof:beleuchtung:state"

const controls = [
  {
    key: "test-shelly",
    label: "Test-Shelly",
    btn: document.getElementById("btnTestShelly"),
    regionBtn: null
  },
  {
    key: "platzlampe",
    label: "Platzlampe",
    btn: document.getElementById("btnPlatzlampe"),
    regionBtn: document.getElementById("regionPlatzlampe")
  },
  {
    key: "scheune-vorne",
    label: "Licht Scheune vorne",
    btn: document.getElementById("btnScheuneVorne"),
    regionBtn: document.getElementById("regionScheuneVorne")
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

function applyControlState(control, isOn) {
  setButtonState(control.btn, isOn)
  setRegionState(control.regionBtn, isOn)
}

function publishControlState(control, isOn) {
  try {
    localStorage.setItem(
      STATE_EVENT_KEY,
      JSON.stringify({
        key: control.key,
        on: Boolean(isOn),
        at: Date.now()
      })
    )
  } catch {
    // Ignore sync issues.
  }
}

function setButtonState(button, isOn) {
  if (!button) return
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
    const disabled = isSwitching || now < blockedUntil
    if (control.btn) {
      control.btn.disabled = disabled
    }
    if (control.regionBtn) {
      control.regionBtn.disabled = disabled
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

async function getStatus(control) {
  if (isSwitching) return null
  const res = await runRequest(`/api/${encodeURIComponent(control.key)}/status`)
  if (!res) return null

  const data = await res.json()
  const isOn = Boolean(data && data.on)
  applyControlState(control, isOn)
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
    // Optimistic UI: immediate feedback on click.
    applyControlState(control, shouldTurnOn)
    publishControlState(control, shouldTurnOn)

    const cmdRes = await runRequest(`/api/${encodeURIComponent(control.key)}/${route}`)
    if (!cmdRes) return

    // Silent confirmation from backend. If it fails, keep optimistic state.
    try {
      inFlight = true
      const statusRes = await fetchWithTimeout(
        PROXY_URL + `/api/${encodeURIComponent(control.key)}/status`,
        REQUEST_TIMEOUT_MS,
        { method: "GET", cache: "no-store" }
      )
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        const isOn = Boolean(statusData && statusData.on)
        applyControlState(control, isOn)
        publishControlState(control, isOn)
      }
    } catch {
      // No popup noise; next poll will reconcile.
    } finally {
      inFlight = false
    }
  } catch {
    // Revert on hard command failure, no alert popup.
    applyControlState(control, !shouldTurnOn)
    publishControlState(control, !shouldTurnOn)
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
    if (control.btn) {
      control.btn.addEventListener("click", () => {
        switchDevice(control)
      })
    }
    if (control.regionBtn) {
      control.regionBtn.addEventListener("click", () => {
        switchDevice(control)
      })
    }
  }
}

window.addEventListener("storage", (event) => {
  if (event.key !== STATE_EVENT_KEY || !event.newValue) return

  try {
    const payload = JSON.parse(event.newValue)
    const control = controls.find((item) => item.key === payload.key)
    if (!control) return
    applyControlState(control, Boolean(payload.on))
  } catch {
    // Ignore malformed sync events.
  }
})

bindClicks()
updateButtonsEnabled()
pollOnce()
startPolling()
