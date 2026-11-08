# Makes the release download: dist\Bob-<version>-win-x64.zip, the same layout Install Bob.cmd makes:
#   Bob\Bob.exe                 Electron's official electron.exe, unchanged, only renamed
#   Bob\(Electron's files)      the rest of the official runtime, with its licence files
#   Bob\resources\app\          Bob's own files
# Used by .github/workflows/build.yml (and works on any Windows PC). Unzip anywhere and run Bob.exe; he
# keeps his things in %LOCALAPPDATA%\Bob. Windows PowerShell 5.1 and PowerShell 7 compatible.
param(
  [string] $Out = '',
  [string] $Cache = ''
)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $Source 'dist' }
if (-not $Cache) { $Cache = Join-Path $Out 'electron-cache' }
$pk = Get-Content -Raw -LiteralPath (Join-Path $Source 'package.json') | ConvertFrom-Json
$version = "$($pk.version)"
$electron = "$($pk.devDependencies.electron)" -replace '^[\^~=v]+', ''
$sha = "$($pk.bob.electronSha256)"

# Bob's own files: the same list the install window copies (a test keeps the two lists equal).
$AppFiles = @('electron', 'src', 'public', 'audio', 'installer', 'catalog.json', 'config.example.json', 'package.json', 'LICENSE', 'docs/legal', 'README.md')

$stage = Join-Path $Out 'Bob'
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$rtArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'bob-runtime.ps1'), '-Version', $electron, '-Target', $stage, '-Cache', $Cache)
if ($sha) { $rtArgs += @('-Sha256', $sha) }
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $ps @rtArgs
if ($LASTEXITCODE -ne 0) { throw "Getting Electron $electron failed." }

$app = Join-Path $stage 'resources\app'
New-Item -ItemType Directory -Force -Path $app | Out-Null
foreach ($f in $AppFiles) {
  $from = Join-Path $Source $f
  if (-not (Test-Path -LiteralPath $from)) { throw "Missing $f" }
  Copy-Item -LiteralPath $from -Destination $app -Recurse -Force
}
# 1.5.76: the basic llama.cpp comes inside the download (installer\bundle-engine.mjs; checked against GitHub's sha256).
& node (Join-Path $PSScriptRoot 'bundle-engine.mjs') $app
if ($LASTEXITCODE -ne 0) { throw 'Bundling llama.cpp failed.' }
Copy-Item -LiteralPath (Join-Path $Source 'public\icons\bob.ico') -Destination (Join-Path $stage 'bob.ico') -Force

$zip = Join-Path $Out "Bob-$version-win-x64.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path $stage -DestinationPath $zip
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
Set-Content -LiteralPath "$zip.sha256" -Value "$hash  $(Split-Path -Leaf $zip)" -Encoding ascii
Write-Output "Made $zip ($hash)"
