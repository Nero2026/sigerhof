param(
  [string]$CsvPath = "..\devices.csv",
  [string]$WorkerOutPath = "..\devices.generated.json",
  [string]$FrontendOutPath = "..\..\..\beleuchtung\devices.generated.json"
)

$ErrorActionPreference = "Stop"

$csvAbs = Join-Path $PSScriptRoot $CsvPath
$workerAbs = Join-Path $PSScriptRoot $WorkerOutPath
$frontendAbs = Join-Path $PSScriptRoot $FrontendOutPath

$rows = Import-Csv -Path $csvAbs

$devices = @()
foreach ($r in $rows) {
  $key = ($r.key | ForEach-Object { "$_".Trim() })
  if (-not $key) { continue }

  $id = "$($r.id)".Trim()
  if (-not $id) { continue }

  $enabledRaw = "$($r.enabled)".Trim().ToLowerInvariant()
  $enabled = $true
  if ($enabledRaw -in @("false", "0", "no")) { $enabled = $false }

  $channel = 0
  if ($r.channel -match '^\d+$') {
    $channel = [int]$r.channel
  }

  $device = [ordered]@{
    key = $key
    id = $id
    channel = $channel
    enabled = $enabled
  }

  $deviceHost = "$($r.host)".Trim()
  if ($deviceHost) { $device.host = $deviceHost }

  $authRef = "$($r.auth_ref)".Trim()
  if ($authRef) { $device.auth_ref = $authRef }

  $devices += [pscustomobject]$device
}

$json = $devices | ConvertTo-Json -Depth 6
$json | Set-Content -Path $workerAbs -Encoding UTF8

$publicDevices = [ordered]@{ devices = @() }
foreach ($d in $devices) {
  $publicDevices.devices += [pscustomobject]@{
    key = $d.key
    name = ( ($rows | Where-Object { $_.key -eq $d.key } | Select-Object -First 1).name )
    enabled = $d.enabled
  }
}

($publicDevices | ConvertTo-Json -Depth 6) | Set-Content -Path $frontendAbs -Encoding UTF8

Write-Output "Wrote $workerAbs"
Write-Output "Wrote $frontendAbs"
Write-Output "Use Worker JSON in wrangler.toml as DEVICES_JSON content."
Write-Output "Copy frontend generated JSON to beleuchtung/devices.json."
