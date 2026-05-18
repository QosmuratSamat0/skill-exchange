param(
	[ValidateSet('all','user','chat','moderation')]
	[string]$Service = 'all',
	[string]$User = 'QosmuratSamat0'
)

$ErrorActionPreference = 'Stop'

function Invoke-Migrations([string]$serviceName, [string]$dbName, [string]$migrationsDir) {
	if (-not (Test-Path $migrationsDir)) {
		Write-Error "Migrations dir not found: $migrationsDir"
	}

	$files = Get-ChildItem -Path $migrationsDir -Filter '*.up.sql' | Sort-Object Name
	if ($files.Count -eq 0) {
		Write-Host "No migrations for $serviceName"
		return
	}

	foreach ($f in $files) {
		Write-Host "Applying $serviceName migration: $($f.Name) to $dbName"
		$sql = Get-Content -Raw -Path $f.FullName
		$sql | docker compose -f docker-compose.infra.yml exec -T postgres psql -U $User -d $dbName -v ON_ERROR_STOP=1
		if ($LASTEXITCODE -ne 0) {
			Write-Error "Migration failed for $serviceName on $dbName"
		}
	}
}

switch ($Service) {
	'all' {
		Invoke-Migrations 'user-service' 'users_db' (Join-Path $PSScriptRoot '..\user-service\migrations')
		Invoke-Migrations 'chat-service' 'chat_db' (Join-Path $PSScriptRoot '..\chat-service\migrations')
		Invoke-Migrations 'moderation-service' 'moderation_db' (Join-Path $PSScriptRoot '..\moderation-service\migrations')
	}
	'user' { Invoke-Migrations 'user-service' 'users_db' (Join-Path $PSScriptRoot '..\user-service\migrations') }
	'chat' { Invoke-Migrations 'chat-service' 'chat_db' (Join-Path $PSScriptRoot '..\chat-service\migrations') }
	'moderation' { Invoke-Migrations 'moderation-service' 'moderation_db' (Join-Path $PSScriptRoot '..\moderation-service\migrations') }
}


