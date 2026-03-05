const KEY_PROXY_URL = "beleuchtung_proxy_url"
const DEFAULT_PROXY_URL = "https://licht-proxy.example.workers.dev"

const btn = document.getElementById("testLightBtn")
const statusText = document.getElementById("statusText")
const proxyUrlInput = document.getElementById("proxyUrl")
const saveConfigBtn = document.getElementById("saveConfigBtn")
const configHint = document.getElementById("configHint")

let isOn = false

function normalizeBaseUrl(url) {
  return (url || "").trim().replace(/\/+$/, "")
}

function getConfig() {
  const proxyUrl = normalizeBaseUrl(localStorage.getItem(KEY_PROXY_URL) || DEFAULT_PROXY_URL)
  return { proxyUrl }
}

function updateUI() {
  if (isOn) {
    btn.classList.remove("switchOff")
    btn.classList.add("switchOn")
    btn.textContent = "Licht EIN"
    statusText.textContent = "Status: EIN"
  } else {
    btn.classList.remove("switchOn")
    btn.classList.add("switchOff")
    btn.textContent = "Licht AUS"
    statusText.textContent = "Status: AUS"
  }
}

function showConfigStatus(msg) {
  configHint.textContent = msg
}

function loadConfigUi() {
  proxyUrlInput.value = getConfig().proxyUrl
}

function saveConfig() {
  const proxyUrl = normalizeBaseUrl(proxyUrlInput.value)
  if (!proxyUrl) {
    showConfigStatus("Bitte Proxy URL eintragen")
    return false
  }
  localStorage.setItem(KEY_PROXY_URL, proxyUrl)
  showConfigStatus("Konfiguration gespeichert")
  return true
}

async function fetchWithTimeout(url, ms, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function apiGet(route) {
  const cfg = getConfig()
  if (!cfg.proxyUrl) {
    throw new Error("Keine Proxy URL konfiguriert")
  }

  const res = await fetchWithTimeout(cfg.proxyUrl + route, 4000, {
    method: "GET",
    cache: "no-store"
  })

  if (!res.ok) {
    throw new Error("HTTP " + res.status)
  }

  return res
}

async function getStatus() {
  try {
    const res = await apiGet("/status")
    const data = await res.json()
    isOn = Boolean(data && data.on)
    updateUI()
    showConfigStatus("Verbunden")
  } catch (err) {
    showConfigStatus("Statusfehler: " + (err && err.message ? err.message : "Unbekannt"))
  }
}

async function switchLight(turnOn) {
  const route = turnOn ? "/on" : "/off"
  await apiGet(route)
  isOn = turnOn
  updateUI()
}

btn.addEventListener("click", async () => {
  btn.disabled = true
  try {
    await switchLight(!isOn)
  } catch {
    alert("Fehler beim Schalten")
  }
  btn.disabled = false
})

saveConfigBtn.addEventListener("click", async () => {
  if (!saveConfig()) return
  await getStatus()
})

loadConfigUi()
saveConfig()
getStatus()
setInterval(getStatus, 5000)
