export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, env)
    }

    if (!["/status", "/on", "/off"].includes(url.pathname)) {
      return json({ error: "Not found" }, 404, env)
    }

    if (!env.UPSTREAM_BASE_URL || !env.UPSTREAM_TOKEN) {
      return json({ error: "Worker not configured" }, 500, env)
    }

    const upstreamBase = env.UPSTREAM_BASE_URL.replace(/\/+$/, "")
    const upstreamUrl = upstreamBase + url.pathname

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method: "GET",
        headers: { "x-token": env.UPSTREAM_TOKEN },
        cf: { cacheTtl: 0, cacheEverything: false }
      })

      const body = await upstreamRes.text()
      const headers = corsHeaders(env)
      headers["content-type"] = upstreamRes.headers.get("content-type") || "application/json; charset=utf-8"

      return new Response(body, {
        status: upstreamRes.status,
        headers
      })
    } catch (err) {
      return json(
        { error: "Upstream request failed", detail: err && err.message ? err.message : "Unknown" },
        502,
        env
      )
    }
  }
}

function corsHeaders(env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "*"
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  }
}

function json(data, status, env) {
  const headers = corsHeaders(env)
  headers["content-type"] = "application/json; charset=utf-8"
  return new Response(JSON.stringify(data), { status, headers })
}
