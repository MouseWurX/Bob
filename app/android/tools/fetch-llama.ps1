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
if ($LASTEXITCODE -ne 0) {
  # Nov 26: ggml-org didn't answer; our saved copy (MouseWurX/Bob pre-release llama.cpp-b12359) holds the whole
  # history up to b12359, this commit included (app/docs/llama-cpp-map.md)
  Write-Host "ggml-org didn't answer; using our saved copy of llama.cpp"
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/MouseWurX/Bob/releases/download/llama.cpp-b12359/llama.cpp-b12359.bundle' -OutFile ..\llama.bundle
  git fetch -q ..\llama.bundle refs/tags/b12359
  Remove-Item ..\llama.bundle
}
git checkout -q --force $pin
$head = (git rev-parse HEAD).Trim()
Pop-Location
if ($head -ne $pin) { throw "Got the wrong commit ($head)" }
Write-Host "llama.cpp at $head"
