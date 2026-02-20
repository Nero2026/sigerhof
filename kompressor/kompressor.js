const defaultUrl = "http://192.168.1.50"
const keyUrl = "kompressor_esp_url"
const keyCsv = "kompressor_csv_rows"

const mainView = document.getElementById("mainView")
const detailView = document.getElementById("detailView")

const statusBox = document.getElementById("statusBox")
const btnOn = document.getElementById("btnOn")
const btnOff = document.getElementById("btnOff")

const btnDetails = document.getElementById("btnDetails")
const btnBack = document.getElementById("btnBack")

const espUrl = document.getElementById("espUrl")
const btnSave = document.getElementById("btnSave")
const btnRefresh = document.getElementById("btnRefresh")

const logEl = document.getElementById("log")
const btnExportCsv = document.getElementById("btnExportCsv")
const btnClearLog = document.getElementById("btnClearLog")

let currentState = "off"
let csvRows = []

function clampUrl(url, fallback){
  const v = (url || "").trim()
  return (v ? v : fallback).replace(/\/+$/,"")
}

function nowIso(){
  return new Date().toISOString()
}

function baseUrl(){
  return clampUrl(espUrl.value, defaultUrl)
}

function show(el){ el.classList.remove("hidden") }
function hide(el){ el.classList.add("hidden") }

function setStatus(state){
  currentState = state

  statusBox.classList.remove("statusOn","statusOff","pulse")
  if(state === "on"){
    statusBox.classList.add("statusOn")
    statusBox.textContent = "Eingeschaltet"
    btnOn.classList.add("inactive")
    btnOff.classList.remove("inactive")
  } else {
    statusBox.classList.add("statusOff")
    statusBox.textContent = "Ausgeschaltet"
    btnOff.classList.add("inactive")
    btnOn.classList.remove("inactive")
  }

  requestAnimationFrame(() => {
    statusBox.classList.add("pulse")
    setTimeout(() => statusBox.classList.remove("pulse"), 140)
  })
}

function log(msg){
  const t = new Date().toLocaleTimeString()
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent
}

function addCsvRow(action, result, state, url){
  const row = { time: nowIso(), action, result, state, url }
  csvRows.unshift(row)
  localStorage.setItem(keyCsv, JSON.stringify(csvRows))
}

async function fetchWithTimeout(url, ms){
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try{
    return await fetch(url, { method:"GET", signal: controller.signal, cache:"no-store" })
  } finally {
    clearTimeout(timer)
  }
}

async function sendCmd(state){
  const url = baseUrl() + (state === "on" ? "/on" : "/off")
  log(`Sende ${state.toUpperCase()} an ${url}`)
  addCsvRow(state, "send", currentState, url)

  try{
    const res = await fetchWithTimeout(url, 3500)
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    setStatus(state)
    log("Antwort ok")
    addCsvRow(state, "ok", state, url)
    pollStatus(true)
  } catch(err){
    log(`Fehler: ${err && err.message ? err.message : err}`)
    addCsvRow(state, "fehler", currentState, url)
    alert("Fehler beim Senden")
  }
}

async function pollStatus(silent){
  const url = baseUrl() + "/status"
  if(!silent) log(`Status abfragen: ${url}`)

  try{
    const res = await fetchWithTimeout(url, 2500)
    if(!res.ok){
      if(!silent){
        log(`Status HTTP ${res.status}`)
        addCsvRow("status", `http_${res.status}`, currentState, url)
      }
      return
    }

    const txt = await res.text()
    let data = null
    try{ data = JSON.parse(txt) } catch { return }

    const s = data && data.state ? String(data.state).toLowerCase() : ""
    if(s === "on" || s === "off"){
      setStatus(s)
      if(!silent) addCsvRow("status", "ok", s, url)
    }
  } catch(err){
    if(!silent){
      log(`Status Fehler: ${err && err.message ? err.message : err}`)
      addCsvRow("status", "fehler", currentState, url)
    }
  }
}

function saveUrl(){
  const u = baseUrl()
  localStorage.setItem(keyUrl, u)
  log(`URL gespeichert: ${u}`)
  addCsvRow("save_url", "ok", currentState, u)
}

function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

function exportCsv(){
  const header = ["time","action","result","state","url"]
  const lines = [header.join(",")]

  for(const r of csvRows){
    const line = [r.time,r.action,r.result,r.state,r.url].map(v => {
      const s = String(v ?? "")
      const escaped = s.replaceAll('"','""')
      return `"${escaped}"`
    }).join(",")
    lines.push(line)
  }

  downloadText("kompressor_log.csv", lines.join("\n"), "text/csv;charset=utf-8")
  log("CSV export erstellt")
  addCsvRow("csv_export","ok",currentState,"")
}

function clearMonitor(){
  logEl.textContent = ""
  log("Monitor geleert")
  addCsvRow("monitor_clear","ok",currentState,"")
}

function showDetails(){
  hide(mainView)
  show(detailView)
}

function showMain(){
  hide(detailView)
  show(mainView)
}

function load(){
  const savedUrl = localStorage.getItem(keyUrl)
  espUrl.value = savedUrl ? savedUrl : defaultUrl

  const savedCsv = localStorage.getItem(keyCsv)
  if(savedCsv){
    try{ csvRows = JSON.parse(savedCsv) || [] } catch { csvRows = [] }
  }

  setStatus("off")
  log("Bereit")
  pollStatus(true)
}

btnOn.addEventListener("click", () => sendCmd("on"))
btnOff.addEventListener("click", () => sendCmd("off"))

btnDetails.addEventListener("click", showDetails)
btnBack.addEventListener("click", showMain)

btnSave.addEventListener("click", saveUrl)
btnRefresh.addEventListener("click", () => pollStatus(false))

btnExportCsv.addEventListener("click", exportCsv)
btnClearLog.addEventListener("click", clearMonitor)

load()
