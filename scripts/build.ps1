$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

$gocache = Join-Path $repoRoot '.gocache'
New-Item -ItemType Directory -Force -Path $gocache | Out-Null
$env:GOCACHE = $gocache

$gopath = Join-Path $repoRoot '.gopath'
New-Item -ItemType Directory -Force -Path $gopath | Out-Null
$env:GOPATH = $gopath

$gomodcache = Join-Path $repoRoot '.gomodcache'
New-Item -ItemType Directory -Force -Path $gomodcache | Out-Null
$env:GOMODCACHE = $gomodcache

Set-Location $repoRoot

go build ./api-gateway/... ./user-service/... ./matchmaking-service/... ./chat-service/... ./moderation-service/... ./notification-service/...
