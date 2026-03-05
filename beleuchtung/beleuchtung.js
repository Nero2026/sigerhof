const PROXY_URL = "https://beleuchtung-secure-worker.remo-bossart.workers.dev"

const controls = [
  { key: "test-shelly", label: "Test-Shelly", btn: document.getElementById("btnTestShelly") },
  { key: "platzlampe", label: "Platzlampe", btn: document.getElementById("btnPlatzlampe") },
  { key: "scheune-vorne", label: "Licht Scheune vorne", btn: document.getElementById("btnScheuneVorne") }
]

function setButtonState(button, isOn) {
  if (isOn) {
    button.classList.remove("switchOff")
    button.classList.add("switchOn")
  } else {
    button.classList.remove("switchOn")
    button.classList.add("switchOff")
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

async function apiGet(path) {
  const res = await fetchWithTimeout(PROXY_URL + path, 5000, { method: "GET" })
  if (!res.ok) throw new Error("HTTP " + res.status)
  return res
}

async function refreshStatus(control) {
  try {
    const res = await apiGet(`/api/${encodeURIComponent(control.key)}/status`)
    const data = await res.json()
    setButtonState(control.btn, Boolean(data && data.on))
  } catch {
    // Keep last known state when polling fails.
  }
}

async function switchLight(control, turnOn) {
  const route = turnOn ? "on" : "off"
  await apiGet(`/api/${encodeURIComponent(control.key)}/${route}`)
  setButtonState(control.btn, turnOn)
}

async function refreshAll() {
  for (const c of controls) {
    await refreshStatus(c)
  }
}

function bindClicks() {
  for (const c of controls) {
    c.btn.addEventListener("click", async () => {
      c.btn.disabled = true
      const isOn = c.btn.classList.contains("switchOn")
      try {
        await switchLight(c, !isOn)
      } catch {
        alert(`Fehler beim Schalten: ${c.label}`)
      }
      c.btn.disabled = false
    })
  }
}

bindClicks()
refreshAll()
setInterval(refreshAll, 5000)
