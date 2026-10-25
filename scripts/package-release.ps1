param([string]$ReleaseId = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
$ErrorActionPreference = 'Stop'
if ($ReleaseId -notmatch '\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\z') { throw 'Invalid release ID' }
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$localSdk = Join-Path (Get-Location) '.tools/dotnet/dotnet.exe'
$sdk = if (Test-Path -LiteralPath $localSdk) { $localSdk } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_CLI_HOME = Join-Path (Get-Location) '.tools/home'
$env:APPDATA = Join-Path (Get-Location) '.tools/appdata'
$env:NUGET_PACKAGES = Join-Path (Get-Location) '.tools/nuget'
$directory = Join-Path (Get-Location) "artifacts/releases/$ReleaseId"
if (Test-Path -LiteralPath $directory) { throw 'Release directory already exists' }
$app = Join-Path $directory 'app'
New-Item -ItemType Directory -Path $app -Force | Out-Null
& $sdk restore --configfile NuGet.Config
if ($LASTEXITCODE -ne 0) { throw 'Restore failed' }
& $sdk publish --configuration Release --no-restore --output $app
if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
node scripts/check-publish.mjs $app
if ($LASTEXITCODE -ne 0) { throw 'Publish boundary check failed' }
Copy-Item -LiteralPath deploy -Destination $app -Recurse
$metadata = @{ releaseId=$ReleaseId; sourceRevision=(git rev-parse HEAD); workingTreeDirty=[bool](git status --porcelain); createdAtUtc=(Get-Date).ToUniversalTime().ToString('o') }
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $app 'release.json') -Encoding utf8NoBOM
$archive = Join-Path $directory "relay-$ReleaseId.tar.gz"
tar -czf $archive -C $app .
if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
$sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$sha  relay-$ReleaseId.tar.gz" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
Write-Output "Release: $ReleaseId"
Write-Output "Archive: $archive"
Write-Output "SHA256: $sha"
