$ErrorActionPreference = 'Stop'
$vendorDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'wwwroot/vendor'
New-Item -ItemType Directory -Force -Path $vendorDirectory | Out-Null
$version = '10.0.0'
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@microsoft/signalr@$version/dist/browser/signalr.min.js" -OutFile (Join-Path $vendorDirectory 'signalr.min.js')
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/dotnet/aspnetcore/v$version/LICENSE.txt" -OutFile (Join-Path $vendorDirectory 'SIGNALR-LICENSE.txt')
Write-Output "Prepared Microsoft SignalR JavaScript client $version"
