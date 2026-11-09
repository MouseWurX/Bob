# Gets Electron's official Windows runtime and gets it ready to be Bob's program, without changing it:
# electron.exe is only renamed to Bob.exe, so it keeps Electron's own signature and hash (Smart App
# Control trusts it; a rebuilt exe gets a new hash every time and can be blocked).
#
#   -Version  Electron version (from package.json devDependencies.electron)
#   -Target   folder to unpack into (Bob app\runtime.new); emptied first
#   -Cache    where the zip and SHASUMS256.txt are kept, so a new Bob build doesn't download them again
#   -Sha256   optional pinned checksum of the zip (package.json bob.electronSha256); wins over SHASUMS256.txt
#   -Zip      optional zip already on this PC (otherwise it is downloaded from Electron's GitHub releases)
#
# Writes progress lines to the console (the install window shows the last one). Exit code 0 = ready.
# Windows PowerShell 5.1 compatible.
param(
  [Parameter(Mandatory = $true)] [string] $Version,
  [Parameter(Mandatory = $true)] [string] $Target,
  [Parameter(Mandatory = $true)] [string] $Cache,
  [string] $Sha256 = '',
  [string] $Zip = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Not an Electron version: $Version" }
  $name = "electron-v$Version-win32-x64.zip"
  $base = "https://github.com/electron/electron/releases/download/v$Version"
  New-Item -ItemType Directory -Force -Path $Cache | Out-Null
  if (-not $Zip) { $Zip = Join-Path $Cache $name }

  if (-not $Sha256) {
    $sums = Join-Path $Cache "SHASUMS256-$Version.txt"
    if (-not (Test-Path -LiteralPath $sums)) {
      Write-Output "Getting Electron's checksums ($base/SHASUMS256.txt)"
      Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -OutFile "$sums.part"
      Move-Item -LiteralPath "$sums.part" -Destination $sums -Force
    }
    $line = Get-Content -LiteralPath $sums | Where-Object { $_ -match ('^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($name) + '$') } | Select-Object -First 1
    if (-not $line) { throw "SHASUMS256.txt has no line for $name." }
    $Sha256 = ($line -split '\s+')[0]
  }

  if (-not (Test-Path -LiteralPath $Zip)) {
    Write-Output "Downloading Electron $Version (about 110 MB) from $base/$name"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile "$Zip.part"
    Move-Item -LiteralPath "$Zip.part" -Destination $Zip -Force
  }
  Write-Output 'Checking the download against Electron''s checksum'
  $got = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
  if ($got -ne $Sha256.ToUpper()) {
    Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
    throw "The Electron download doesn't match its checksum (got $got, expected $($Sha256.ToUpper())). It was deleted; press Try again."
  }

  Write-Output "Unpacking Electron $Version"
  if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Target)
  $exe = Join-Path $Target 'electron.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'The Electron zip has no electron.exe.' }
  Rename-Item -LiteralPath $exe -NewName 'Bob.exe'
  # Electron opens resources\app (Bob) only when there's no default app in the way.
  Remove-Item -LiteralPath (Join-Path $Target 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue
  $sig = Get-AuthenticodeSignature -LiteralPath (Join-Path $Target 'Bob.exe')
  # For information only: the official electron.exe isn't Authenticode-signed, and Windows trusts it by its
  # (unchanged) hash. The checksum match above is the real check.
  Write-Output "Signature status of electron.exe: $($sig.Status) (for information; the checksum is what counts)"
  Write-Output "Bob.exe hash: $((Get-FileHash -LiteralPath (Join-Path $Target 'Bob.exe') -Algorithm SHA256).Hash)"
  [System.IO.File]::WriteAllText((Join-Path $Target 'electron-version.txt'), $Version)
  Write-Output "Electron $Version is ready (checksum $got)."
  exit 0
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  exit 1
}
