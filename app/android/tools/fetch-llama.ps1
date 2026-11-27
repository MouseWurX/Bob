# Gets llama.cpp at the exact commit in llama.cpp.pin, into android\third_party\llama.cpp (Windows), then applies
# android\patches\*.patch in order (new brain types the pinned llama.cpp lacks).
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
if ($head -ne $pin) { Pop-Location; throw "Got the wrong commit ($head)" }
git clean -fdq -- src common   # files an earlier run's patches added
foreach ($p in (Get-ChildItem ..\..\patches\*.patch -ErrorAction SilentlyContinue | Sort-Object Name)) {
  git apply $p.FullName
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Patch $($p.Name) did not apply" }
  Write-Host "applied $($p.Name)"
}
Pop-Location
Write-Host "llama.cpp at $head"
