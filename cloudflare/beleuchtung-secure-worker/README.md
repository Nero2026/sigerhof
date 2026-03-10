# Beleuchtung Secure Worker (Multi-Shelly)

Skalierbarer Worker fuer mehrere Shelly-Geraete ohne Secrets im Frontend.

## API

- `GET /api/<key>/status`
- `GET /api/<key>/on`
- `GET /api/<key>/off`

`<key>` kommt aus `DEVICES_JSON` (z. B. `test-shelly`).

## Sicherheitsmodell

- Shelly-Keys nur als Worker-Secrets.
- CORS per `ALLOWED_ORIGIN`.
- Optional IP-Allowlist per `ALLOWED_IPS`.

## Geraetetabelle pflegen

1. Datei bearbeiten: `devices.csv`
2. JSON erzeugen:
```powershell
cd cloudflare\beleuchtung-secure-worker\scripts
.\build-devices-json.ps1
```
3. Worker-JSON: Inhalt von `..\devices.generated.json` in `wrangler.toml` unter `DEVICES_JSON` eintragen.
4. Frontend-JSON: `..\..\beleuchtung\devices.generated.json` nach `..\..\beleuchtung\devices.json` uebernehmen.

CSV-Spalten:
- `key`: API key, eindeutig, URL-sicher (z. B. `stall-licht`)
- `name`: nur fuer Doku/Frontend
- `id`: Shelly device id
- `channel`: meistens `0`
- `host`: optional, sonst global `SHELLY_HOST`
- `auth_ref`: optional, fuer mehrere Auth-Keys
- `enabled`: `true` oder `false`

## Secrets setzen

Mindestens einen Default-Key:
```powershell
npx wrangler secret put SHELLY_AUTH_KEY
```

Optional fuer mehrere Shelly-Accounts/Keys:
```powershell
npx wrangler secret put AUTH_KEYS_JSON
```

Beispielwert fuer `AUTH_KEYS_JSON`:
```json
{
  "main": "KEY_FOR_MAIN_ACCOUNT",
  "stall": "KEY_FOR_STALL_ACCOUNT"
}
```

Dann in `DEVICES_JSON` je Geraet `auth_ref` setzen.

## Deploy

```powershell
cd cloudflare\beleuchtung-secure-worker
npx wrangler deploy
```

## Frontend

`beleuchtung/devices.json` steuert die sichtbaren Karten im UI.
Der `key` dort muss zum Worker-`DEVICES_JSON` passen.
