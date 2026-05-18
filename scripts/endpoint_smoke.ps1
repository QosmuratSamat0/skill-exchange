param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$ApiPrefix = "/api/v1"
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  try {
    $params = @{
      Method  = $Method
      Uri     = $Url
      Headers = $Headers
      TimeoutSec = 15
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $params["ContentType"] = "application/json"
      $params["Body"] = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    $resp = Invoke-WebRequest @params
    $json = $null
    try { $json = $resp.Content | ConvertFrom-Json } catch {}
    return [pscustomobject]@{
      ok = $true
      status = [int]$resp.StatusCode
      body = $json
      raw = $resp.Content
      error = $null
    }
  } catch {
    $statusCode = 0
    $raw = ""
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode.value__
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
      } catch {}
    }
    $json = $null
    try { $json = $raw | ConvertFrom-Json } catch {}
    return [pscustomobject]@{
      ok = $false
      status = $statusCode
      body = $json
      raw = $raw
      error = $_.Exception.Message
    }
  }
}

function Decode-JwtSub {
  param([string]$Token)
  $parts = $Token.Split(".")
  if ($parts.Length -lt 2) { return "" }
  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($payload.Length % 4) {
    2 { $payload += "==" }
    3 { $payload += "=" }
  }
  try {
    $bytes = [Convert]::FromBase64String($payload)
    $obj = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
    return [string]$obj.sub
  } catch {
    return ""
  }
}

$api = "$BaseUrl$ApiPrefix"
$script:results = @()

function Add-Result {
  param([string]$Name, [int[]]$Expected, [object]$Resp)
  $pass = $Expected -contains $Resp.status
  $script:results += [pscustomobject]@{
    name = $Name
    status = $Resp.status
    expected = ($Expected -join ",")
    pass = $pass
    note = if ($pass) { "" } else { $Resp.error }
  }
}

function New-AnonymousUser {
  param([string]$Tag)
  $device = "$Tag-" + [Guid]::NewGuid().ToString("N")
  $resp = Invoke-Api -Method "POST" -Url "$api/users/anonymous" -Body @{ device_id = $device }
  if (-not $resp.body.access_token) {
    throw "Anonymous token not returned for $Tag"
  }
  return [pscustomobject]@{
    token = [string]$resp.body.access_token
    userId = Decode-JwtSub -Token ([string]$resp.body.access_token)
    auth = @{ Authorization = "Bearer $($resp.body.access_token)" }
  }
}

function Get-MatchStatus {
  param([hashtable]$Headers)
  return Invoke-Api -Method "GET" -Url "$api/match/status" -Headers $Headers
}

function Wait-Matched {
  param(
    [hashtable]$Headers,
    [int]$TimeoutSec = 12
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $s = Get-MatchStatus -Headers $Headers
    if ($s.status -eq 200 -and $s.body -and $s.body.status -eq "matched" -and $s.body.room_id) {
      return $s
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

# Public endpoints
$r = Invoke-Api -Method "GET" -Url "$api/health"
Add-Result -Name "GET /health" -Expected @(200) -Resp $r

$r = Invoke-Api -Method "GET" -Url "$api/docs/swagger.yaml"
Add-Result -Name "GET /docs/swagger.yaml" -Expected @(200) -Resp $r

$device = "smoke-" + [Guid]::NewGuid().ToString("N")
$r = Invoke-Api -Method "POST" -Url "$api/users/anonymous" -Body @{ device_id = $device }
Add-Result -Name "POST /users/anonymous" -Expected @(200,201) -Resp $r
if (-not $r.body.access_token) {
  throw "Cannot continue: anonymous token was not returned."
}

$token = [string]$r.body.access_token
$auth = @{ Authorization = "Bearer $token" }
$userId = Decode-JwtSub -Token $token

# Auth-only endpoints
$r = Invoke-Api -Method "GET" -Url "$api/users/me" -Headers $auth
Add-Result -Name "GET /users/me" -Expected @(200) -Resp $r

$r = Invoke-Api -Method "PUT" -Url "$api/users/me" -Headers $auth -Body @{ gender = "male"; interests = @("music", "books") }
Add-Result -Name "PUT /users/me" -Expected @(200) -Resp $r

if ($userId) {
  $r = Invoke-Api -Method "GET" -Url "$api/users/$userId" -Headers $auth
  Add-Result -Name "GET /users/{id}" -Expected @(200) -Resp $r
}

$r = Invoke-Api -Method "GET" -Url "$api/bff/me" -Headers $auth
Add-Result -Name "GET /bff/me" -Expected @(200) -Resp $r

$r = Invoke-Api -Method "GET" -Url "$api/match/status" -Headers $auth
Add-Result -Name "GET /match/status" -Expected @(200) -Resp $r

$r = Invoke-Api -Method "POST" -Url "$api/match/search" -Headers $auth -Body @{
  filter = @{
    my_gender = "male"
    gender = "any"
    mode = "voice"
  }
}
Add-Result -Name "POST /match/search" -Expected @(200,202) -Resp $r

$r = Invoke-Api -Method "DELETE" -Url "$api/match/search" -Headers $auth
Add-Result -Name "DELETE /match/search" -Expected @(200) -Resp $r

$r = Invoke-Api -Method "POST" -Url "$api/match/next" -Headers $auth
Add-Result -Name "POST /match/next" -Expected @(200,202,404) -Resp $r

# report endpoint: for now we only validate route/validation behavior
$r = Invoke-Api -Method "POST" -Url "$api/report/report" -Headers $auth -Body @{
  room_id = ""
  reported_user_id = ""
  reason = "smoke-test"
}
Add-Result -Name "POST /report/report (validation)" -Expected @(400) -Resp $r

# E2E flow: solo search should stay searching, pair search should match in same room
$u1 = New-AnonymousUser -Tag "e2e-u1"
$u2 = New-AnonymousUser -Tag "e2e-u2"

$r = Invoke-Api -Method "POST" -Url "$api/match/search" -Headers $u1.auth -Body @{
  filter = @{
    my_gender = "male"
    gender = "any"
    mode = "voice"
  }
}
Add-Result -Name "E2E U1 start search" -Expected @(200,202) -Resp $r

Start-Sleep -Seconds 3
$u1Solo = Get-MatchStatus -Headers $u1.auth
$soloPass = ($u1Solo.status -eq 200 -and $u1Solo.body -and $u1Solo.body.status -eq "searching")
$script:results += [pscustomobject]@{
  name = "E2E solo remains searching"
  status = $u1Solo.status
  expected = "200(searching)"
  pass = $soloPass
  note = if ($soloPass) { "" } else { "Unexpected status: $($u1Solo.raw)" }
}

$r = Invoke-Api -Method "POST" -Url "$api/match/search" -Headers $u2.auth -Body @{
  filter = @{
    my_gender = "female"
    gender = "any"
    mode = "voice"
  }
}
Add-Result -Name "E2E U2 start search" -Expected @(200,202) -Resp $r

$u1Matched = Wait-Matched -Headers $u1.auth -TimeoutSec 12
$u2Matched = Wait-Matched -Headers $u2.auth -TimeoutSec 12
$room1 = if ($u1Matched) { [string]$u1Matched.body.room_id } else { "" }
$room2 = if ($u2Matched) { [string]$u2Matched.body.room_id } else { "" }
$pairPass = ($room1 -ne "" -and $room1 -eq $room2)
$script:results += [pscustomobject]@{
  name = "E2E pair matched same room"
  status = if ($pairPass) { 200 } else { 0 }
  expected = "matched same room"
  pass = $pairPass
  note = if ($pairPass) { "" } else { "u1=$room1 u2=$room2" }
}

# cleanup queues
$null = Invoke-Api -Method "DELETE" -Url "$api/match/search" -Headers $u1.auth
$null = Invoke-Api -Method "DELETE" -Url "$api/match/search" -Headers $u2.auth

Write-Host ""
Write-Host "Endpoint smoke results:" -ForegroundColor Cyan
$script:results | Format-Table -AutoSize

$failed = @($script:results | Where-Object { -not $_.pass })
if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Failed endpoints: $($failed.Count)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "All endpoint checks passed." -ForegroundColor Green
