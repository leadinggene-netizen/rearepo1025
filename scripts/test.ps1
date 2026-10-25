$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$env:DOTNET_EXE = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { (Get-Command dotnet).Source }
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:BRIDGE_DLL = Join-Path $projectDirectory 'artifacts/test-bin/BridgeDemo.dll'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& $env:DOTNET_EXE restore --configfile NuGet.Config --locked-mode
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $env:DOTNET_EXE build --no-restore --warnaserror --output artifacts/test-bin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --check wwwroot/app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test --test-reporter=spec --test-reporter=junit --test-reporter-destination=stdout --test-reporter-destination=artifacts/protocol-tests.xml tests/integration.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/validation-manifest.mjs
exit $LASTEXITCODE
