export default {
  async fetch(request, env) {

    const ORIGIN = "https://nero2026.github.io"

    const corsHeaders = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Headers": "x-token, content-type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400"
    }

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const url = new URL(request.url)
    const path = url.pathname

    // Token prüfen
    const token = request.headers.get("x-token")
    if (token !== env.WEB_TOKEN) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders })
    }

    const host = env.HOST.startsWith("http") ? env.HOST : `https://${env.HOST}`

    // =========================
    // STATUS ABFRAGE
    // =========================
if (path === "/status") {
  const shellyUrl = `${host}/v2/devices/api/get?auth_key=${encodeURIComponent(env.AUTH_KEY)}`

  const r = await fetch(shellyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids: [env.DEVICE_ID],
      select: ["status"]
    })
  })

  const raw = await r.text()

  if (!r.ok) {
    return new Response(raw, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  let on = null
  let online = null
  let updated = null

  try {
    const data = JSON.parse(raw)

    // Erwartet: Array mit einem Device-Objekt
    const dev = Array.isArray(data) ? data[0] : data

    online = !!dev?.online
    updated = dev?.status?._updated ?? null

    const sw0 = dev?.status?.["switch:0"]
    if (sw0 && typeof sw0.output === "boolean") {
      on = sw0.output
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "parse_failed", raw }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  return new Response(JSON.stringify({ on, online, updated }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

    // =========================
    // SCHALTEN
    // =========================

    let turnOn

    if (path === "/on") {
      turnOn = true
    } else if (path === "/off") {
      turnOn = false
    } else {
      return new Response("Not found", { status: 404, headers: corsHeaders })
    }

    const shellyUrl =
      `${host}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(env.AUTH_KEY)}`

    const r = await fetch(shellyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: env.DEVICE_ID,
        channel: 0,
        on: turnOn
      })
    })

    const text = await r.text()

    return new Response(text, {
      status: r.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    })
  }
}