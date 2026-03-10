export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get("origin") || ""
    const cors = buildCorsHeaders(env, origin)

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, cors)
    }

    if (!isOriginAllowed(env, origin)) {
      return json({ error: "origin_forbidden" }, 403, cors)
    }

    if (!isIpAllowed(env, request)) {
      return json({ error: "ip_forbidden" }, 403, cors)
    }

    const route = parseRoute(url.pathname)
    if (!route) {
      return json({ error: "not_found" }, 404, cors)
    }

    try {
      const devices = parseDevicesConfig(env)
      const authMap = parseAuthMap(env.AUTH_KEYS_JSON)
      const defaultAuth = getDefaultAuthKey(env)
      const defaultHost = normalizeHost(env.SHELLY_HOST || "")

      const device = devices.find((d) => d.key === route.key && d.enabled)
      if (!device) {
        return json({ error: "unknown_device" }, 404, cors)
      }

      const host = normalizeHost(device.host || defaultHost)
      const authKey = resolveAuthKey(device, authMap, defaultAuth)
      if (!host || !authKey || !device.id) {
        return json({ error: "device_not_configured", key: route.key }, 500, cors)
      }

      if (route.action === "status") {
        const status = await fetchShellyStatus(host, authKey, device.id, device.channel)
        return json(status, 200, cors)
      }

      const turnOn = route.action === "on"
      const out = await setShellySwitch(host, authKey, device.id, device.channel, turnOn)
      return json(out, 200, cors)
    } catch (err) {
      return json(
        { error: "upstream_failed", detail: err && err.message ? err.message : "unknown" },
        502,
        cors
      )
    }
  }
}

function parseRoute(pathname) {
  const m = pathname.match(/^\/api\/([^/]+)\/(status|on|off)$/)
  if (!m) return null
  return { key: decodeURIComponent(m[1]), action: m[2] }
}

function parseDevicesConfig(env) {
  const legacyId = String(env.SHELLY_DEVICE_ID || "").trim()
  const fallback = legacyId ? [{ key: "test-shelly", id: legacyId, channel: 0, enabled: true }] : []
  const raw = env.DEVICES_JSON
  const txt = String(raw || "").trim()
  if (!txt) return fallback

  let data
  try {
    data = JSON.parse(txt)
  } catch {
    throw new Error("invalid_DEVICES_JSON")
  }

  if (!Array.isArray(data)) {
    throw new Error("DEVICES_JSON_must_be_array")
  }

  return data
    .map((d) => ({
      key: String(d.key || "").trim(),
      id: String(d.id || "").trim(),
      channel: Number.isInteger(d.channel) ? d.channel : 0,
      host: String(d.host || "").trim(),
      auth_ref: String(d.auth_ref || "").trim(),
      enabled: d.enabled !== false
    }))
    .filter((d) => d.key)
}

function parseAuthMap(raw) {
  const txt = String(raw || "").trim()
  if (!txt) return {}
  try {
    const obj = JSON.parse(txt)
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {}
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      out[String(k).trim()] = String(v || "").trim()
    }
    return out
  } catch {
    throw new Error("invalid_AUTH_KEYS_JSON")
  }
}

function resolveAuthKey(device, authMap, defaultAuth) {
  if (device.auth_ref) {
    return String(authMap[device.auth_ref] || "").trim()
  }
  return defaultAuth
}

function getDefaultAuthKey(env) {
  return String(env.SHELLY_AUTH_KEY || env.AUTH_KEY || "").trim()
}

function normalizeHost(host) {
  const v = String(host || "").trim()
  if (!v) return ""
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`
  return withProto.replace(/\/+$/, "")
}

function buildCorsHeaders(env, origin) {
  const allowedOrigin = isOriginAllowed(env, origin) ? (origin || "*") : "null"
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  }
}

function isOriginAllowed(env, origin) {
  const allowed = String(env.ALLOWED_ORIGIN || "").trim()
  if (!allowed) return true
  if (!origin) return true
  return origin === allowed
}

function isIpAllowed(env, request) {
  const raw = String(env.ALLOWED_IPS || "").trim()
  if (!raw) return true

  const clientIp = String(request.headers.get("cf-connecting-ip") || "").trim()
  if (!clientIp) return false

  const allowSet = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return allowSet.has(clientIp)
}

async function fetchShellyStatus(host, authKey, deviceId, channel) {
  const shellyUrl = `${host}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`
  const res = await fetchWithTimeout(shellyUrl, 7000, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: [deviceId], select: ["status"] })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`status_http_${res.status}: ${body.slice(0, 240)}`)
  }

  const data = await res.json()
  const dev = Array.isArray(data) ? data[0] : data
  const sw = dev && dev.status ? dev.status[`switch:${channel}`] : null
  const input = dev && dev.status ? dev.status[`input:${channel}`] : null

  return {
    on: Boolean(sw && sw.output === true),
    inputOn:
      input && typeof input.state === "boolean"
        ? input.state
        : input && typeof input.percent === "number"
          ? input.percent > 0
          : null,
    online: Boolean(dev && dev.online),
    source:
      sw && typeof sw.source === "string"
        ? sw.source
        : input && typeof input.state === "boolean"
          ? "input"
          : "status",
    updated: dev && dev.status ? dev.status._updated || null : null
  }
}

async function setShellySwitch(host, authKey, deviceId, channel, turnOn) {
  const shellyUrl = `${host}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(authKey)}`
  const res = await fetchWithTimeout(shellyUrl, 7000, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: deviceId, channel, on: turnOn })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`switch_http_${res.status}: ${body.slice(0, 240)}`)
  }

  return { ok: true, on: Boolean(turnOn) }
}

async function fetchWithTimeout(url, ms, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function json(payload, status, cors) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" }
  })
}
