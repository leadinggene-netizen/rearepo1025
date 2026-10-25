param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$dotnetCommand = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
if (-not (Test-Path -LiteralPath 'wwwroot/vendor/signalr.min.js')) { & "$PSScriptRoot/prepare-client.ps1" }
if (-not $NoBuild) {
    & $dotnetCommand restore --configfile NuGet.Config --locked-mode
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $dotnetCommand build --no-restore
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $dotnetCommand run --no-build --no-launch-profile
exit $LASTEXITCODE
