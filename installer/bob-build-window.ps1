# Bob's install / update window. Puts Bob in place from this source folder, showing every step: a list
# with ticks, a progress bar, the live log line, the time taken, and what each step is for.
#
# The layout (from 0.9.32), so Windows Smart App Control never meets a new, unknown exe:
#   <home>\Bob app\Bob.exe             Electron's official electron.exe, unchanged, only renamed
#   <home>\Bob app\(Electron's files)  the rest of the official runtime (installer\bob-runtime.ps1)
#   <home>\Bob app\resources\app\      Bob himself: a plain folder of his files, which Electron opens
#   <home>\Bob app\resources\app-previous\  the Bob before the last update, for rolling back by hand
#   <home>\Bob app\bob.ico             the icon on the Start menu shortcut
# Nothing is built: an update copies Bob's files in and keeps the exe as it is.
#
#   -Mode install  First-time install (Install Bob.cmd): get Electron, test, put Bob in place, add the
#                  Start menu shortcut, open Bob.
#   -Mode update   From Bob's "Update Bob" button: test, put the new Bob next to the old one
#                  (resources\app.new), then "Restart Bob now" closes Bob, swaps and opens him again. If the
#                  window is closed instead, the new Bob waits and takes over the next time Bob starts.
#   -Prebuilt      With -Mode update: -Source is a Bob downloaded from GitHub (the release zip's resources\app),
#                  already tested by GitHub and checked against its .sha256 by Bob. No Node.js, no tests: it only
#                  goes next to the old one. home.json keeps pointing at the source folder it had.
#   -Mode swap     Started by Bob himself when he finds a waiting update (renamed to *.pending): wait for
#                  Bob to close, swap, reopen.
#
# Progress is also written to a status file ({ step, of, id, text, done, error, steps, log, ready }), which
# Bob's own window reads to show the same steps.
#
# Nothing outside the source folder, "<home>\Bob app" and the Start menu shortcut is changed.
# Windows PowerShell 5.1 compatible (no null-coalescing or ternary operators).

param(
  [ValidateSet('install', 'update', 'swap')] [string] $Mode = 'install',
  [string] $Source = '',
  [string] $BobHome = '',
  [string] $StatusFile = '',
  [int] $Port = 0,
  [string] $AppDir = '',      # where Bob.exe goes (default: "<home>\Bob app", or %LOCALAPPDATA%\Programs\Bob)
  [switch] $NoShortcut,        # don't add or change the Start menu shortcut (for trying the installer in a sandbox)
  [switch] $Prebuilt           # -Mode update with a release downloaded from GitHub (no Node.js, no tests)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

if (-not $Source) { $Source = Split-Path -Parent $PSScriptRoot }
$Source = (Resolve-Path -LiteralPath $Source).Path

# Where Bob lives: the folder above the source if it is a Bob home (it has an "inn" folder, like Bob home),
# otherwise the folder the install window asks for (1.5.125; the program goes in <home>\Bob app).
if (-not $BobHome) {
  $up = Split-Path -Parent $Source
  if (Test-Path -LiteralPath (Join-Path $up 'inn') -PathType Container) { $BobHome = $up }
}

# 1.5.125: a fresh install asks where Bob keeps his things (models, programs, notes, settings) before anything
# else happens, instead of someone editing home.json later. Suggested: a Bob folder in the user's own folder.
# Never AppData, Temp or the Windows folder: clean-up tools empty those, and the models in them take hours to get again.
# Not asked when a Bob home was found beside the source, when -AppDir was given (tests, sandboxes), or when an old
# Bob already keeps his things at %LOCALAPPDATA%\Bob (that Bob moves them from Settings, Bob's home folder).
function Test-BobHomeBad([string] $dir) {
  if (-not $dir) { return 'Pick a folder.' }
  $d = $dir.TrimEnd('\')
  if ($d -match '^[A-Za-z]:$') { return 'Pick a folder, not a whole drive. A "Bob" folder on that drive is fine.' }
  if (-not ($d -match '^[A-Za-z]:\\')) { return 'Give the whole path, like D:\Bob.' }
  foreach ($bad in @($env:LOCALAPPDATA, $env:APPDATA, $env:TEMP, $env:TMP, $env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if ($bad -and ($d.ToLower() -eq $bad.ToLower() -or $d.ToLower().StartsWith($bad.TrimEnd('\').ToLower() + '\'))) { return "That's inside $bad, which clean-up tools empty (or Windows protects). Bob's models would be lost. Pick a folder of your own, like $env:USERPROFILE\Bob." }
  }
  if ($d -match '\\AppData\\') { return "That's inside AppData, which clean-up tools empty. Pick a folder of your own, like $env:USERPROFILE\Bob." }
  if (Test-Path -LiteralPath $d -PathType Leaf) { return "That's a file, not a folder." }
  if (Test-Path -LiteralPath $d -PathType Container) {
    $names = @(Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    if ($names.Count -gt 0 -and -not ($names -contains 'inn')) { return 'That folder already has other things in it. Pick an empty folder, or a new "Bob" folder inside it, so Bob''s things stay separate from yours.' }
  }
  return ''
}
function Test-BobHomeCloud([string] $dir) {
  foreach ($c in @(@('onedrive', 'OneDrive'), @('dropbox', 'Dropbox'), @('google ?drive|googledrive|my drive', 'Google Drive'), @('icloud', 'iCloud'), @('pcloud', 'pCloud'), @('nextcloud|owncloud', 'Nextcloud'), @('proton ?drive', 'Proton Drive'), @('\bmega(sync)?\b', 'MEGA'), @('\bbox(sync)?\b', 'Box'), @('\bidrive\b', 'IDrive'))) {
    if ($dir -match ('(?i)' + $c[0])) { return $c[1] }
  }
  return ''
}
function Ask-BobHome {
  $suggest = Join-Path $env:USERPROFILE 'Bob'
  $f = New-Object System.Windows.Forms.Form -Property @{ Text = 'Where should Bob keep his things?'; Width = 560; Height = 290; FormBorderStyle = 'FixedDialog'; StartPosition = 'CenterScreen'; MaximizeBox = $false; MinimizeBox = $false; TopMost = $true }
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)
  $words = New-Object System.Windows.Forms.Label -Property @{ Left = 16; Top = 12; Width = 515; Height = 96; Text = "Bob's models, programs, notes and settings live in one folder, apart from the program, so updating him never touches them. Models are big (10 to 60 GB) and slow to download again, so pick a real folder of your own: not AppData or another temporary place, and not a cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud): Bob always recommends against those, because every model would be uploaded and a sync can break one while he uses it.`r`n`r`nYou can move it later in Settings, Bob's home folder." }
  $box = New-Object System.Windows.Forms.TextBox -Property @{ Left = 16; Top = 116; Width = 420; Text = $suggest }
  $browse = New-Object System.Windows.Forms.Button -Property @{ Left = 444; Top = 114; Width = 88; Height = 28; Text = 'Browse...' }
  $free = New-Object System.Windows.Forms.Label -Property @{ Left = 16; Top = 148; Width = 515; Height = 20; ForeColor = [System.Drawing.Color]::Gray }
  $err = New-Object System.Windows.Forms.Label -Property @{ Left = 16; Top = 170; Width = 515; Height = 40; ForeColor = [System.Drawing.Color]::Firebrick }
  $ok = New-Object System.Windows.Forms.Button -Property @{ Left = 330; Top = 212; Width = 202; Height = 32; Text = 'Keep Bob''s things here' }
  $f.Controls.AddRange(@($words, $box, $browse, $free, $err, $ok)); $f.AcceptButton = $ok
  $showFree = { try { $root = [System.IO.Path]::GetPathRoot($box.Text); if ($root) { $dr = New-Object System.IO.DriveInfo($root); $free.Text = ('Free on {0} {1} GB' -f $root, [Math]::Round($dr.AvailableFreeSpace / 1e9)) } } catch { $free.Text = '' } }
  $box.Add_TextChanged($showFree); & $showFree
  $browse.Add_Click({ $d = New-Object System.Windows.Forms.FolderBrowserDialog -Property @{ Description = 'Pick the folder Bob keeps his things in (an empty folder, or a new one)'; ShowNewFolderButton = $true }
    if ($d.ShowDialog($f) -eq 'OK') { $pick = $d.SelectedPath; $why = Test-BobHomeBad $pick; if ($why -match 'other things in it') { $pick = Join-Path $pick 'Bob' }; $box.Text = $pick } })
  # A cloud-synced folder is allowed, but the first press warns (orange) and the button becomes "Use it anyway".
  $script:cloudWarned = ''
  $box.Add_TextChanged({ if ($script:cloudWarned -and $box.Text -ne $script:cloudWarned) { $script:cloudWarned = ''; $ok.Text = 'Keep Bob''s things here'; $err.Text = ''; $err.ForeColor = [System.Drawing.Color]::Firebrick } })
  $ok.Add_Click({ $why = Test-BobHomeBad $box.Text
    if ($why) { $err.ForeColor = [System.Drawing.Color]::Firebrick; $err.Text = $why; return }
    $cloud = Test-BobHomeCloud $box.Text
    if ($cloud -and $script:cloudWarned -ne $box.Text) { $script:cloudWarned = $box.Text; $err.ForeColor = [System.Drawing.Color]::DarkOrange; $err.Text = "That's a $cloud folder, synced to the cloud. Bob recommends against it: every model (tens of GB) would be uploaded, and a sync can break a model while he uses it. Press again to use it anyway, or pick a plain folder like $env:USERPROFILE\Bob."; $ok.Text = 'Use it anyway'; return }
    $f.Tag = $box.Text.TrimEnd('\'); $f.DialogResult = 'OK'; $f.Close() })
  $f.Add_FormClosing({ param($s, $e) if ($f.DialogResult -ne 'OK') { $f.Tag = $null } })
  [void]$f.ShowDialog()
  return $f.Tag
}
if ($Mode -eq 'install' -and -not $BobHome -and -not $AppDir -and -not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Bob\inn') -PathType Container)) {
  $picked = Ask-BobHome
  if (-not $picked) { exit 0 }   # the window was closed: nothing installed, nothing changed
  $BobHome = $picked
}
if (-not $AppDir) { if ($BobHome) { $AppDir = Join-Path $BobHome 'Bob app' } else { $AppDir = Join-Path $env:LOCALAPPDATA 'Programs\Bob' } }
$Exe = Join-Path $AppDir 'Bob.exe'
if (-not $StatusFile) {
  if ($BobHome) { $StatusFile = Join-Path $BobHome 'inn\bob\update-status.json' } else { $StatusFile = Join-Path $env:LOCALAPPDATA 'Bob\inn\bob\update-status.json' }
}
$LogDir = Split-Path -Parent $StatusFile
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir 'update-log.txt'
$RestartFlag = Join-Path $LogDir 'update-restart.flag'  # Bob's own "Restart now" button drops this
Remove-Item -LiteralPath $RestartFlag -Force -ErrorAction SilentlyContinue

if (-not $Port) {
  $Port = 7777
  if ($BobHome) {
    foreach ($c in @((Join-Path $BobHome 'bob\config.json'), (Join-Path $BobHome 'config.json'))) {
      if (Test-Path -LiteralPath $c) { try { $p = (Get-Content -Raw -LiteralPath $c | ConvertFrom-Json).port; if ($p) { $Port = [int]$p } } catch {} ; break }
    }
  }
}

$version = ''; $ElectronVersion = ''; $ElectronSha = ''
try {
  $pk = Get-Content -Raw -LiteralPath (Join-Path $Source 'package.json') | ConvertFrom-Json; $version = "$($pk.version)"
  $ElectronVersion = "$($pk.devDependencies.electron)" -replace '^[\^~=v]+', ''
  if ($pk.bob.electronSha256) { $ElectronSha = "$($pk.bob.electronSha256)" }
} catch {}
$Res = Join-Path $AppDir 'resources'
$ElectronCache = Join-Path $LogDir 'electron'
. (Join-Path $PSScriptRoot 'bob-shortcut.ps1')

# ---- the steps ----
$Steps = @(
  @{ id = 'verify';  label = 'Checking Node.js and the new version'; hint = 'Bob''s checks run with Node.js. This makes sure it is installed and that the source folder is complete.' },
  @{ id = 'runtime'; label = "Getting Electron $ElectronVersion"; hint = 'Electron''s official program, unchanged (so Windows trusts it). Downloaded once, about 110 MB, and checked.' },
  @{ id = 'tests';   label = 'Testing Bob'; hint = 'Runs Bob''s own checks. If one fails, nothing is changed and you keep the Bob you have.' },
  @{ id = 'app';     label = $(if ($Mode -eq 'install') { 'Putting Bob in place' } else { 'Getting the new Bob ready' }); hint = $(if ($Mode -eq 'install') { 'Copies Bob''s files next to Bob.exe and adds Bob to the Start menu.' } else { 'Puts the new Bob next to the old one. He takes over when Bob restarts.' }) },
  @{ id = 'done';    label = 'Ready'; hint = '' }
)
if ($Prebuilt -and $Mode -eq 'update') {
  $Steps = @(
    @{ id = 'verify';  label = 'Checking the Bob from GitHub'; hint = 'Downloaded from GitHub and checked against its .sha256. GitHub ran all of Bob''s checks before publishing it.' },
    $Steps[1], $Steps[3], $Steps[4]
  )
}
if ($Mode -eq 'swap') {
  $Steps = @(
    @{ id = 'swap'; label = 'Swapping in the new Bob'; hint = 'Waits for Bob to close, then swaps in the new Bob (the old one is kept as app-previous).' },
    @{ id = 'done'; label = 'Ready'; hint = '' }
  )
}

# ---- window ----
$dark = [System.Drawing.Color]::FromArgb(29, 21, 16); $panel = [System.Drawing.Color]::FromArgb(43, 29, 20)
$text = [System.Drawing.Color]::FromArgb(243, 231, 211); $muted = [System.Drawing.Color]::FromArgb(199, 178, 150)
$accent = [System.Drawing.Color]::FromArgb(231, 166, 74); $good = [System.Drawing.Color]::FromArgb(127, 191, 122); $bad = [System.Drawing.Color]::FromArgb(224, 122, 106)
$font = New-Object System.Drawing.Font('Segoe UI', 10)
$bold = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)

$form = New-Object System.Windows.Forms.Form
$form.Text = $(if ($Mode -eq 'install') { 'Installing Bob' } elseif ($Mode -eq 'update') { 'Updating Bob' } else { 'Updating Bob' })
$form.ClientSize = New-Object System.Drawing.Size(600, (190 + 46 * $Steps.Count))
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.BackColor = $dark; $form.ForeColor = $text; $form.Font = $font; $form.TopMost = $true
$ico = Join-Path $Source 'public\icons\bob.ico'
if (Test-Path -LiteralPath $ico) { try { $form.Icon = New-Object System.Drawing.Icon($ico) } catch {} }

$title = New-Object System.Windows.Forms.Label
$title.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$title.Text = $(if ($Mode -eq 'install') { "Installing Bob $version" } elseif ($Prebuilt) { "Updating Bob to $version from GitHub" } else { "Updating Bob to $version" })
$title.SetBounds(20, 14, 560, 28); $form.Controls.Add($title)

$rows = @()
for ($k = 0; $k -lt $Steps.Count; $k++) {
  $y = 52 + 46 * $k
  $l = New-Object System.Windows.Forms.Label; $l.SetBounds(20, $y, 560, 22); $l.Font = $bold; $l.ForeColor = $muted
  $l.Text = [char]0x25CB + '  ' + $Steps[$k].label
  $h = New-Object System.Windows.Forms.Label; $h.SetBounds(44, ($y + 21), 540, 20); $h.ForeColor = $muted; $h.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $h.Text = $Steps[$k].hint
  $form.Controls.Add($l); $form.Controls.Add($h)
  $rows += ,@($l, $h)
}
$base = 52 + 46 * $Steps.Count + 6
$bar = New-Object System.Windows.Forms.ProgressBar; $bar.SetBounds(20, $base, 560, 16); $bar.Style = 'Marquee'; $bar.MarqueeAnimationSpeed = 30
$form.Controls.Add($bar)
$logLine = New-Object System.Windows.Forms.Label; $logLine.SetBounds(20, ($base + 22), 560, 20); $logLine.ForeColor = $muted
$logLine.Font = New-Object System.Drawing.Font('Consolas', 8.5); $logLine.AutoEllipsis = $true; $form.Controls.Add($logLine)
$clock = New-Object System.Windows.Forms.Label; $clock.SetBounds(20, ($base + 46), 300, 20); $clock.ForeColor = $muted; $form.Controls.Add($clock)
$msg = New-Object System.Windows.Forms.Label; $msg.SetBounds(20, ($base + 68), 560, 40); $msg.ForeColor = $text; $form.Controls.Add($msg)

function New-Button($label, $x, $w) {
  $b = New-Object System.Windows.Forms.Button; $b.Text = $label; $b.SetBounds($x, ($base + 108), $w, 32)
  $b.FlatStyle = 'Flat'; $b.BackColor = $panel; $b.ForeColor = $text; $b.Visible = $false
  $form.Controls.Add($b); return $b
}
$btnMain = New-Button 'Open Bob' 20 170
$btnMain.BackColor = $accent; $btnMain.ForeColor = $dark
$btnAlt = New-Button 'Close Bob for me' 200 170
$btnLog = New-Button 'Show the full log' 380 140
$btnLog.Visible = $true
$btnLog.Add_Click({ if (Test-Path -LiteralPath $LogFile) { Start-Process notepad.exe -ArgumentList "`"$LogFile`"" } })
$form.ClientSize = New-Object System.Drawing.Size(600, ($base + 156))

# ---- state ----
$script:i = 0
$script:proc = $null
$script:started = Get-Date
$script:stepStarted = Get-Date
$script:finished = $false
$script:failed = $false
$script:waitingForBob = $false
$script:warn = ''
$script:waitDone = $false
$script:lastBusyCheck = Get-Date
Set-Content -LiteralPath $LogFile -Value "Bob $Mode $version, $(Get-Date -Format s)" -Encoding UTF8

function Write-Status([string]$t, [bool]$done = $false, [string]$err = '', [bool]$ready = $false) {
  $o = [ordered]@{
    mode = $Mode; version = $version; step = [Math]::Min($script:i + 1, $Steps.Count); of = $Steps.Count; id = $Steps[[Math]::Min($script:i, $Steps.Count - 1)].id
    text = $t; done = $done; error = $err; ready = $ready; log = $logLine.Text; warn = $script:warn
    steps = @($Steps | ForEach-Object { $_.label }); startedAt = $script:started.ToString('o'); updatedAt = (Get-Date).ToString('o')
  }
  try { [System.IO.File]::WriteAllText($StatusFile, ($o | ConvertTo-Json -Depth 3), (New-Object System.Text.UTF8Encoding($false))) } catch {}
}

function Mark($k, $state) {
  $l = $rows[$k][0]
  switch ($state) {
    'now'  { $l.Text = [char]0x25CF + '  ' + $Steps[$k].label; $l.ForeColor = $accent }
    'done' { $l.Text = [char]0x2713 + '  ' + $Steps[$k].label; $l.ForeColor = $good }
    'fail' { $l.Text = [char]0x2717 + '  ' + $Steps[$k].label; $l.ForeColor = $bad }
  }
}

function Log([string]$line) { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8; $logLine.Text = $line }

function Fail([string]$why) {
  $script:failed = $true
  Mark $script:i 'fail'
  $bar.Style = 'Continuous'; $bar.Value = 0
  $keep = $(if ($Mode -eq 'install') { 'Nothing outside the source folder was changed.' } else { 'Bob is still on his previous version.' })
  $msg.ForeColor = $bad; $msg.Text = "$why $keep"
  Log "FAILED: $why"
  Write-Status $why $false $why
  $btnMain.Text = 'Try again'; $btnMain.Visible = $true; $btnAlt.Visible = $false
}

# Runs a command in the source folder; output goes to the log, the last line shows under the bar.
function Start-Command([string]$cmd) {
  $script:partLog = Join-Path $LogDir ('update-step-' + $Steps[$script:i].id + '.txt')
  Remove-Item -LiteralPath $script:partLog -ErrorAction SilentlyContinue
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = "/d /s /c `"$cmd > `"$($script:partLog)`" 2>&1`""
  $psi.WorkingDirectory = $Source
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $script:proc = [System.Diagnostics.Process]::Start($psi)
}

function Tail-Line {
  if (-not (Test-Path -LiteralPath $script:partLog)) { return '' }
  try {
    $fs = New-Object System.IO.FileStream($script:partLog, 'Open', 'Read', 'ReadWrite')
    $len = $fs.Length; $n = [Math]::Min(4096, $len); $fs.Seek($len - $n, 'Begin') | Out-Null
    $buf = New-Object byte[] $n; $fs.Read($buf, 0, $n) | Out-Null; $fs.Close()
    $lines = [System.Text.Encoding]::UTF8.GetString($buf) -split "`r?`n" | Where-Object { $_.Trim() }
    if ($lines) { return ($lines | Select-Object -Last 1).Trim() }
  } catch {}
  return ''
}

function Bob-Running { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); return $true } catch { return $false } }
function Ask-Bob-To-Close {
  try { Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/quit" -Headers @{ 'x-bob' = '1' } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null } catch {}
}

function Write-HomeJson {
  # Only a real source folder goes in home.json, never the copy of this window a GitHub update runs from.
  if ($Prebuilt -or -not (Test-Path -LiteralPath (Join-Path $Source 'src\server.js'))) { return }
  New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
  $h = [ordered]@{ source = $Source }
  if ($BobHome) { $h.agentDir = $BobHome; $cfg = Join-Path $BobHome 'bob\config.json'; if (Test-Path -LiteralPath $cfg) { $h.config = $cfg } }
  [System.IO.File]::WriteAllText((Join-Path $AppDir 'home.json'), ($h | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
}

# The Start menu shortcut: Bob's icon and the same AppUserModel id as the app (ca.mousewurx.bob), so
# the taskbar and pins show Bob, not Electron.
function Add-StartMenu {
  $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Bob.lnk'
  Write-BobShortcut -Lnk $lnk -Target $Exe -WorkDir $AppDir -Icon (Join-Path $AppDir 'bob.ico')
  $back = Read-BobShortcut $lnk
  Log "Start menu shortcut: $($back.Target), icon $($back.Icon), id $($back.Aumid)"
}

# Bob's own files, the same list the PC tested. Never config.json (that's in Bob's home, not here).
$AppFiles = @('electron', 'src', 'public', 'audio', 'installer', 'catalog.json', 'config.example.json', 'package.json', 'LICENSE', 'LICENSE-ART', 'ASSETS-LICENSE.md', 'TRADEMARKS.md', 'THIRD-PARTY.md', 'README.md')

# Copies Bob's files into resources\app.new (made fresh each time).
function Stage-App {
  $to = Join-Path $Res 'app.new'
  if (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  foreach ($f in $AppFiles) {
    $from = Join-Path $Source $f
    if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination $to -Recurse -Force }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $to 'electron\main.cjs'))) { throw 'Copying Bob''s files failed (no electron\main.cjs in app.new).' }
  Log "Bob $version is staged in $to"
}

# Swaps a waiting update in (Bob must be closed). $tag is 'new' (straight from this window) or 'pending'
# (handed over by Bob at start-up). Returns $true when done; $false when a file is still in use.
#   runtime.<tag>        a new Electron: Bob.exe is kept as Bob-previous.exe, the new files go over the top
#   resources\app.<tag>  a new Bob: app becomes app-previous, app.<tag> becomes app
function Apply-Update([string]$tag) {
  try {
    $rt = Join-Path $AppDir "runtime.$tag"
    if (Test-Path -LiteralPath $rt) {
      if (Test-Path -LiteralPath $Exe) {
        $prev = Join-Path $AppDir 'Bob-previous.exe'
        Remove-Item -LiteralPath $prev -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $Exe -Destination $prev -Force
      }
      Copy-Item -Path (Join-Path $rt '*') -Destination $AppDir -Recurse -Force
      Remove-Item -LiteralPath $rt -Recurse -Force
      Log "Electron $((Get-Content -Raw -LiteralPath (Join-Path $AppDir 'electron-version.txt' ) -ErrorAction SilentlyContinue)) is in place."
    }
    $an = Join-Path $Res "app.$tag"
    if (Test-Path -LiteralPath $an) {
      $cur = Join-Path $Res 'app'; $prev = Join-Path $Res 'app-previous'
      if (Test-Path -LiteralPath $prev) { Remove-Item -LiteralPath $prev -Recurse -Force }
      if (Test-Path -LiteralPath $cur) { Rename-Item -LiteralPath $cur -NewName 'app-previous' }
      Rename-Item -LiteralPath $an -NewName 'app'
      Log 'The new Bob is in place (the one before is kept as resources\app-previous).'
    }
    Remove-Item -LiteralPath (Join-Path $Res 'default_app.asar') -Force -ErrorAction SilentlyContinue
    $ico = Join-Path $Res 'app\public\icons\bob.ico'
    if (Test-Path -LiteralPath $ico) { Copy-Item -LiteralPath $ico -Destination (Join-Path $AppDir 'bob.ico') -Force }
    # Left over from the Bob.exe builds before 0.9.32.
    foreach ($old in @('Bob.exe.new', 'Bob.exe.pending', 'Bob.exe.failed')) { Remove-Item -LiteralPath (Join-Path $AppDir $old) -Force -ErrorAction SilentlyContinue }
    return $true
  } catch { Log "Not yet: $($_.Exception.Message)"; return $false }
}

# Is the right Electron already in place (or waiting from an update that hasn't been switched to)?
function Runtime-Ready {
  foreach ($d in @($AppDir, (Join-Path $AppDir 'runtime.new'))) {
    $v = Join-Path $d 'electron-version.txt'
    if ((Test-Path -LiteralPath (Join-Path $d 'Bob.exe')) -and (Test-Path -LiteralPath $v) -and ((Get-Content -Raw -LiteralPath $v).Trim() -eq $ElectronVersion)) { return $true }
  }
  return $false
}

function Runtime-Command {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $cmd = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'bob-runtime.ps1')`" -Version $ElectronVersion -Target `"$(Join-Path $AppDir 'runtime.new')`" -Cache `"$ElectronCache`""
  if ($ElectronSha) { $cmd += " -Sha256 $ElectronSha" }
  return $cmd
}

# ---- quick steps (run straight away) ----
function Run-Quick($id) {
  switch ($id) {
    'verify' {
      $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
      if ($Prebuilt) { $npm = $true }
      if (-not $npm) { throw 'Node.js isn''t installed. Get the LTS version from https://nodejs.org, then press Try again.' }
      foreach ($f in @('package.json', 'src\server.js', 'electron\main.cjs', 'installer\bob-runtime.ps1')) { if (-not (Test-Path -LiteralPath (Join-Path $Source $f))) { throw "The source folder is missing $f." } }
      if ($ElectronVersion -notmatch '^\d+\.\d+\.\d+$') { throw "package.json doesn't name an exact Electron version (found '$ElectronVersion')." }
      if ($Prebuilt) { Log "Bob $version from GitHub, in $Source, Electron $ElectronVersion" } else { Log "Node.js $(& node -v), source $Source, Electron $ElectronVersion" }
    }
    'app' {
      New-Item -ItemType Directory -Force -Path $Res | Out-Null
      if ($Mode -eq 'install') {
        # Bob may be open (an older Bob.exe from this folder): his files are in use until he closes.
        if (Bob-Running) { return 'wait' }
        Stage-App
        if (-not (Apply-Update 'new')) { return 'wait' }
        Write-HomeJson
        if ($NoShortcut) { Log "Bob is in $AppDir (no Start menu shortcut: -NoShortcut)." }
        else { Add-StartMenu; Log "Bob is in $AppDir, with a Start menu shortcut." }
      } else {
        Stage-App
        # A GitHub download lives in a scratch folder: home.json keeps the source folder it had.
        if (-not $Prebuilt) { Write-HomeJson }
        Log 'The new Bob is ready next to the old one.'
      }
    }
  }
  return 'ok'
}

$Commands = @{ tests = 'npm test' }

function Next-Step {
  Mark $script:i 'done'
  $script:i++
  $script:stepStarted = Get-Date
}

function Finish {
  $script:finished = $true
  Mark ($Steps.Count - 1) 'done'
  $bar.Style = 'Continuous'; $bar.Value = 100
  $msg.ForeColor = $good
  if ($Mode -eq 'install') {
    $msg.Text = "Bob is installed. Press Open Bob to finish: he shows what he would get for this computer, already ticked, and one button gets it all.$(if ($script:warn) { ' ' + $script:warn })"
    $btnMain.Text = 'Open Bob'; $btnMain.Visible = $true
    Write-Status 'Bob is installed.' $true '' $false
  } elseif ($Mode -eq 'update') {
    $msg.Text = "The new Bob is ready. Restart Bob now to switch over (your chats, notes and models stay as they are). Bob's window asks too.$(if ($script:warn) { ' ' + $script:warn })"
    $btnMain.Text = 'Restart Bob now'; $btnMain.Visible = $true
    # Pop up so it can't be missed, then stop being always-on-top.
    if ($form.WindowState -eq 'Minimized') { $form.WindowState = 'Normal' }
    $form.TopMost = $true; $form.Activate(); $form.TopMost = $false
    [System.Media.SystemSounds]::Asterisk.Play()
    $btnAlt.Text = 'Later'; $btnAlt.Visible = $true
    Write-Status 'Ready. Restart Bob to switch over.' $true '' $true
  } else {
    $msg.Text = 'Done. Bob is opening.'
    Write-Status 'Swapped in the new Bob.' $true '' $false
    Start-Process -FilePath $Exe -WorkingDirectory $AppDir
    $script:closeAt = (Get-Date).AddSeconds(3)
  }
}

# What Bob is in the middle of, in words ('' when nothing). Unreachable but running counts as busy.
function Bob-BusyWith {
  if (-not (Bob-Running)) { return '' }
  try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/idle" -TimeoutSec 5 } catch { return 'something (he is slow to answer)' }
  $what = @()
  if ($r.busy) { $what += 'a task' }
  if ($r.waiting) { $what += "$($r.waiting) more waiting in his list" }
  if ($r.downloading) { $what += 'a download' }
  return ($what -join ', ')
}

# "Restart Bob now": ask, close Bob, swap in the new Bob.exe, reopen. Asks first only if Bob is in the
# middle of something; no waiting for quiet time. $asked = the question was already answered
# in Bob's own window.
function Restart-Bob([bool]$asked) {
  $busy = Bob-BusyWith
  if ($busy -and -not $asked) {
    $a = [System.Windows.Forms.MessageBox]::Show($form, "Bob is working on $busy.`n`nYes: restart him now anyway. He picks up where he left off: the task is offered again (Try again), waiting tasks carry on, and a download resumes from where it stopped.`nNo: wait until he's done, then restart by himself.`nCancel: not now.", 'Restart Bob?', 'YesNoCancel', 'Question')
    if ($a -eq 'No') { $script:waitDone = $true; $msg.ForeColor = $text; $msg.Text = 'Bob restarts as soon as he has finished (no task, nothing waiting, no download).'; return }
    if ($a -ne 'Yes') { $msg.ForeColor = $text; $msg.Text = 'OK, not yet. Press "Restart Bob now" when you are ready.'; return }
  }
  $script:waitDone = $false
  $btnMain.Enabled = $false; $btnAlt.Visible = $false
  $msg.ForeColor = $text; $msg.Text = 'Closing Bob for a moment...'
  Write-Status 'Restarting Bob' $true '' $true
  Ask-Bob-To-Close
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    [System.Windows.Forms.Application]::DoEvents()
    if (-not (Bob-Running) -and (Apply-Update 'new')) {
      if (-not $NoShortcut) { try { Add-StartMenu } catch { Log "Shortcut not updated: $($_.Exception.Message)" } }
      Write-Status 'Swapped in the new Bob.' $true '' $false
      Start-Process -FilePath $Exe -WorkingDirectory $AppDir
      $form.Close(); return
    }
    Start-Sleep -Milliseconds 300
  }
  $msg.ForeColor = $bad; $msg.Text = 'Bob didn''t close within a minute. The new Bob waits and takes over the next time Bob starts.'
  $btnMain.Enabled = $true; $btnMain.Text = 'Close'; $script:finished = $false; $script:failed = $true
}

# The heart of it: a timer on the window's own thread moves through the steps, so the window never freezes.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
  $clock.Text = 'Time: ' + ((Get-Date) - $script:started).ToString('mm\:ss')
  if ($script:closeAt -and (Get-Date) -gt $script:closeAt) { $form.Close(); return }
  if ($script:finished -and $script:waitDone -and $Mode -eq 'update') {
    # "Wait until he's done": only no job, nothing waiting, no download. No quiet time needed.
    if (((Get-Date) - $script:lastBusyCheck).TotalSeconds -ge 3) { $script:lastBusyCheck = Get-Date; if (-not (Bob-BusyWith)) { Restart-Bob $true } }
    return
  }
  if ($script:finished -and $Mode -eq 'update' -and (Test-Path -LiteralPath $RestartFlag)) {
    $how = ''; try { $how = (Get-Content -Raw -LiteralPath $RestartFlag).Trim() } catch {}
    Remove-Item -LiteralPath $RestartFlag -Force -ErrorAction SilentlyContinue
    if ($how -eq 'done') { $script:waitDone = $true; $msg.ForeColor = $text; $msg.Text = 'Bob restarts as soon as he has finished (no task, nothing waiting, no download).'; return }
    Restart-Bob $true; return
  }
  if ($script:finished -or $script:failed) { return }
  $step = $Steps[$script:i]
  if ($step.id -eq 'done') { Finish; return }
  Mark $script:i 'now'

  if ($script:proc) {
    $t = Tail-Line; if ($t) { $logLine.Text = $t }
    if (-not $script:proc.HasExited) { if (((Get-Date) - $script:lastWrite).TotalSeconds -ge 1) { $script:lastWrite = Get-Date; Write-Status $step.label } ; return }
    $code = $script:proc.ExitCode; $script:proc = $null
    if (Test-Path -LiteralPath $script:partLog) { Get-Content -LiteralPath $script:partLog | Add-Content -LiteralPath $LogFile -Encoding UTF8 }
    if ($code -ne 0) {
      if ($step.id -eq 'runtime') { Fail "Couldn't get Electron: $((Tail-Line) -replace '^ERROR: ', '') Check the internet connection, then press Try again."; return }
      elseif ($step.id -eq 'tests') { Fail 'One of Bob''s checks failed, so nothing was changed. "Show the full log" says which.'; return }
      else { Fail 'That step failed. "Show the full log" has the details.'; return }
    }
    Next-Step; Write-Status $Steps[$script:i].label; return
  }

  if ($script:waitingForBob) {
    if (Bob-Running) { return }
    $script:waitingForBob = $false
  }

  if ($step.id -eq 'runtime') {
    if (Runtime-Ready) { Log "Electron $ElectronVersion is already here."; Next-Step; Write-Status $Steps[$script:i].label; return }
    $script:lastWrite = Get-Date; $bar.Style = 'Marquee'
    Log "> bob-runtime.ps1 -Version $ElectronVersion"
    Write-Status $step.label
    try { Start-Command (Runtime-Command) } catch { Fail "Couldn't start: $($_.Exception.Message)" }
    return
  }

  if ($Commands.ContainsKey($step.id)) {
    $script:lastWrite = Get-Date
    $bar.Style = 'Marquee'
    Log ('> ' + $Commands[$step.id])
    Write-Status $step.label
    try { Start-Command $Commands[$step.id] } catch { Fail "Couldn't start: $($_.Exception.Message)" }
    return
  }

  if ($Mode -eq 'swap' -and $step.id -eq 'swap') {
    $pa = Join-Path $Res 'app.pending'; $pr = Join-Path $AppDir 'runtime.pending'
    if (-not (Test-Path -LiteralPath $pa) -and -not (Test-Path -LiteralPath $pr)) { Fail 'There was no new Bob waiting.'; return }
    if (-not (Bob-Running) -and (Apply-Update 'pending')) { Write-HomeJson; if (-not $NoShortcut) { try { Add-StartMenu } catch {} }; Next-Step; return }
    if (((Get-Date) - $script:stepStarted).TotalSeconds -gt 60) {
      if (Test-Path -LiteralPath $pa) { Rename-Item -LiteralPath $pa -NewName 'app.failed' -ErrorAction SilentlyContinue }
      if (Test-Path -LiteralPath $pr) { Rename-Item -LiteralPath $pr -NewName 'runtime.failed' -ErrorAction SilentlyContinue }
      Fail 'Bob''s files stayed in use for a minute, so the swap was skipped.'; return
    }
    $logLine.Text = 'Waiting for Bob to close...'; return
  }

  try { $r = Run-Quick $step.id } catch { Fail $_.Exception.Message; return }
  if ($r -eq 'wait') {
    # Install over a Bob that's open: his program file is in use.
    $msg.ForeColor = $text; $msg.Text = 'Bob is open, so his files are in use. Close Bob, or press "Close Bob for me". This carries on by itself.'
    $btnAlt.Text = 'Close Bob for me'; $btnAlt.Visible = $true
    $script:waitingForBob = $true
    return
  }
  $msg.Text = ''; $btnAlt.Visible = $false
  Next-Step
  Write-Status $Steps[[Math]::Min($script:i, $Steps.Count - 1)].label
})

$btnAlt.Add_Click({
  if ($script:finished -and $Mode -eq 'update') { $form.Close(); return } # "Later": the new Bob waits in resources\app.new
  Ask-Bob-To-Close
})

$btnMain.Add_Click({
  if ($script:failed) {
    # Try again from the step that failed.
    $script:failed = $false; $msg.Text = ''; $msg.ForeColor = $text; $btnMain.Visible = $false
    return
  }
  if ($Mode -eq 'install') { Start-Process -FilePath $Exe -WorkingDirectory $AppDir; $form.Close(); return }
  if ($Mode -eq 'update') { Restart-Bob $false }
})

$form.Add_FormClosing({ if ($script:proc -and -not $script:proc.HasExited) { try { & taskkill.exe /PID $script:proc.Id /T /F | Out-Null } catch {} } })
$form.Add_Shown({ $form.Activate(); $form.TopMost = $false; $timer.Start() })
Write-Status 'Starting'
[System.Windows.Forms.Application]::Run($form)
