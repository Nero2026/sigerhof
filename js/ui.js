export function qs(sel, root=document){ return root.querySelector(sel) }

export function show(el){ el.classList.remove("hidden") }
export function hide(el){ el.classList.add("hidden") }

export function clampUrl(url, fallback){
  const v = (url || "").trim()
  return (v ? v : fallback).replace(/\/+$/,"")
}

export function nowIso(){
  return new Date().toISOString()
}

export function downloadText(filename, text, mime="text/plain;charset=utf-8"){
  const blob = new Blob([text], { type: mime })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

export async function fetchWithTimeout(url, ms){
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try{
    return await fetch(url, { method:"GET", signal: controller.signal, cache:"no-store" })
  } finally {
    clearTimeout(timer)
  }
}
