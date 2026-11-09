# Gets llama.cpp at the exact commit in llama.cpp.pin, into android\third_party\llama.cpp (Windows).
# Run once before opening the android folder in Android Studio. Needs Git for Windows.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$pin = (Get-Content llama.cpp.pin -Raw).Trim()
$dir = 'third_party\llama.cpp'
New-Item -ItemType Directory -Force $dir | Out-Null
Push-Location $dir
if (-not (Test-Path .git)) { git init -q }
git remote remove origin 2>$null
git remote add origin https://github.com/ggml-org/llama.cpp
git fetch -q --depth 1 origin $pin
git checkout -q --force FETCH_HEAD
$head = (git rev-parse HEAD).Trim()
Pop-Location
if ($head -ne $pin) { throw "Got the wrong commit ($head)" }
Write-Host "llama.cpp at $head"
