# Shelly Access Matrix (Template)

Diese Datei ist fuer organisatorische Uebersicht gedacht.
Keine echten Secrets eintragen.

| key | zone | device_id | host | auth_ref | owner | notes |
|---|---|---|---|---|---|---|
| test-shelly | Hof | d0cf13cb8708 | shelly-239-eu.shelly.cloud | main | Remo | aktiv |
| stall-licht | Stall | REPLACE_DEVICE_ID | shelly-239-eu.shelly.cloud | stall | Remo | geplant |

Regel:
- `auth_ref` verweist auf einen Eintrag in `AUTH_KEYS_JSON` Secret.
- Der echte Key bleibt ausschliesslich im Worker Secret.
