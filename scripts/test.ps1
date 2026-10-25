$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$env:DOTNET_EXE = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { (Get-Command dotnet).Source }
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& $env:DOTNET_EXE restore --configfile NuGet.Config
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $env:DOTNET_EXE build --no-restore --warnaserror
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --check wwwroot/app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test tests/integration.mjs
exit $LASTEXITCODE
