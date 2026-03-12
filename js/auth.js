const AUTH_SESSION_KEY = "sigerhof:auth:v1"
const AUTH_PERSIST_KEY = "sigerhof:auth:persist:v1"
const AUTH_HASH = "0c86f2dfd04b5d52de85408b658cd99e053d9010b38c56da20673c9a891e9746"
const AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const AUTH_PROMPT = "Passwort fuer Sigerhof eingeben"

document.documentElement.style.visibility = "hidden"

initAuth()

async function initAuth() {
  if (hasValidSessionAuth() || hasValidPersistedAuth()) {
    allowPage()
    return
  }

  const password = window.prompt(AUTH_PROMPT, "")
  if (password === null) {
    denyPage()
    return
  }

  const hash = await sha256Hex(password)
  if (hash !== AUTH_HASH) {
    window.alert("Falsches Passwort.")
    denyPage()
    return
  }

  persistAuth()
  allowPage()
}

function hasValidSessionAuth() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === AUTH_HASH
}

function hasValidPersistedAuth() {
  try {
    const raw = localStorage.getItem(AUTH_PERSIST_KEY)
    if (!raw) return false

    const payload = JSON.parse(raw)
    if (!payload || payload.hash !== AUTH_HASH) return false

    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
      localStorage.removeItem(AUTH_PERSIST_KEY)
      return false
    }

    sessionStorage.setItem(AUTH_SESSION_KEY, AUTH_HASH)
    return true
  } catch {
    localStorage.removeItem(AUTH_PERSIST_KEY)
    return false
  }
}

function persistAuth() {
  sessionStorage.setItem(AUTH_SESSION_KEY, AUTH_HASH)
  try {
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({
        hash: AUTH_HASH,
        expiresAt: Date.now() + AUTH_TTL_MS
      })
    )
  } catch {
    // Ignore persistence issues.
  }
}

function allowPage() {
  document.documentElement.style.visibility = ""
}

function denyPage() {
  const message = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0b1220;color:#e9eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
      <div style="max-width:420px;width:100%;background:#111b31;border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:24px;box-shadow:0 18px 55px rgba(0,0,0,0.45);text-align:center;">
        <div style="font-size:22px;font-weight:900;">Zugriff gesperrt</div>
        <div style="margin-top:10px;color:#a9b6da;">Diese Seite ist passwortgeschuetzt.</div>
        <button id="retryAuth" type="button" style="margin-top:18px;padding:12px 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:#1f2a4a;color:#e9eefc;font-weight:900;cursor:pointer;">Erneut versuchen</button>
      </div>
    </div>
  `

  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = message
    document.documentElement.style.visibility = ""
    const button = document.getElementById("retryAuth")
    if (button) {
      button.addEventListener("click", () => {
        window.location.reload()
      })
    }
  })
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", input)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
