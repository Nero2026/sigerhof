# Beleuchtung Proxy Worker

Dieser Worker haelt den echten Upstream-Token serverseitig und exposed nur:
- `GET /status`
- `GET /on`
- `GET /off`

## Setup

1. Dateien vorbereiten:
```powershell
cd cloudflare\beleuchtung-proxy
Copy-Item wrangler.toml.example wrangler.toml
```

2. `wrangler.toml` anpassen:
- `name`
- optional `ALLOWED_ORIGIN`
- `UPSTREAM_BASE_URL` als `vars` setzen

3. Secret setzen:
```powershell
npx wrangler secret put UPSTREAM_TOKEN
```

4. Deploy:
```powershell
npx wrangler deploy
```

5. Frontend konfigurieren:
- In `Beleuchtung` die neue Proxy-URL eintragen

## Token Rotation

1. Neuen Token im Upstream setzen.
2. Dann im Proxy-Worker aktualisieren:
```powershell
npx wrangler secret put UPSTREAM_TOKEN
npx wrangler deploy
```
3. Alten Token im Upstream entfernen/ungueltig machen.
