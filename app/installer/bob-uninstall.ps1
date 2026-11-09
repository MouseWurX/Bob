# Removes Bob from this PC. Started by Bob's own "Remove Bob" button (after a confirm), from a copy in
# %TEMP%, so it isn't inside the folder it deletes. Waits for Bob to close, then removes:
#   the Start menu shortcut (only if it points at this Bob.exe), the program folder (only if it really is
#   Bob's: Bob.exe plus resources\app\package.json named "bob"), Electron's window data for Bob, and only
#   when they're passed: Bob's own data folder (inn\bob) and his models folder (models\bob). The rest of the
#   inn folder (notice board, logbook, pictures, other agents' files) is never touched.
# Nothing else is touched. Shows what it did in a small window. Windows PowerShell 5.1 compatible.
param(
  [Parameter(Mandatory = $true)] [string] $AppDir,
  [int] $Port = 7777,
  [string] $ElectronData = '',
  [string] $Inn = '',
  [string] $Models = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Removing Bob'; $form.ClientSize = New-Object System.Drawing.Size(520, 220)
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(29, 21, 16); $form.ForeColor = [System.Drawing.Color]::FromArgb(243, 231, 211)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$label = New-Object System.Windows.Forms.Label; $label.SetBounds(20, 16, 480, 150); $form.Controls.Add($label)
$ok = New-Object System.Windows.Forms.Button; $ok.Text = 'Close'; $ok.SetBounds(400, 175, 100, 32); $ok.Visible = $false; $ok.FlatStyle = 'Flat'
$ok.Add_Click({ $form.Close() }); $form.Controls.Add($ok)

function Say([string]$t) { $label.Text = $t; [System.Windows.Forms.Application]::DoEvents() }
# Bob counts as open while his port answers or any program from his folder is still running.
function Bob-Running {
  try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); return $true } catch {}
  $prefix = [IO.Path]::GetFullPath($AppDir).TrimEnd('\') + '\'
  $p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }
  return [bool]$p
}

# Deletes a folder, retrying for a while if Windows still has a file open.
function Remove-Folder([string]$dir) {
  for ($n = 0; $n -lt 30; $n++) {
    if (-not (Test-Path -LiteralPath $dir)) { return $true }
    try { Remove-Item -LiteralPath $dir -Recurse -Force; return $true } catch { Start-Sleep -Milliseconds 1000; [System.Windows.Forms.Application]::DoEvents() }
  }
  return $false
}

# Bob's data and models go to the Recycle Bin, so they can be brought back. Only the program is deleted outright.
function Recycle-Folder([string]$dir) {
  for ($n = 0; $n -lt 30; $n++) {
    if (-not (Test-Path -LiteralPath $dir)) { return $true }
    try { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($dir, 'OnlyErrorDialogs', 'SendToRecycleBin'); return $true } catch { Start-Sleep -Milliseconds 1000; [System.Windows.Forms.Application]::DoEvents() }
  }
  return $false
}

function Is-BobProgram([string]$dir) {
  $pkg = Join-Path $dir 'resources\app\package.json'
  if (-not (Test-Path -LiteralPath (Join-Path $dir 'Bob.exe')) -or -not (Test-Path -LiteralPath $pkg)) { return $false }
  try { return ((Get-Content -Raw -LiteralPath $pkg | ConvertFrom-Json).name -eq 'bob') } catch { return $false }
}

$form.Add_Shown({
  $done = @(); $left = @()
  Say 'Waiting for Bob to close...'
  $deadline = (Get-Date).AddSeconds(60)
  while ((Bob-Running) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300; [System.Windows.Forms.Application]::DoEvents() }
  if (Bob-Running) { Say 'Bob is still open, so nothing was removed. Close Bob and try again.'; $ok.Visible = $true; return }
  Start-Sleep -Milliseconds 800

  Say 'Removing the Start menu shortcut...'
  $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Bob.lnk'
  if (Test-Path -LiteralPath $lnk) {
    try {
      $target = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk).TargetPath
      if ($target -and ([IO.Path]::GetFullPath($target) -ieq [IO.Path]::GetFullPath((Join-Path $AppDir 'Bob.exe')))) { Remove-Item -LiteralPath $lnk -Force; $done += 'the Start menu shortcut' }
      else { $left += "the Start menu shortcut (it points somewhere else: $target)" }
    } catch { $left += 'the Start menu shortcut' }
  }

  Say 'Removing the program...'
  if (Is-BobProgram $AppDir) {
    if (Remove-Folder $AppDir) { $done += "the program ($AppDir)" } else { $left += "the program folder ($AppDir): a file was still in use" }
  } else { $left += "$AppDir (it doesn't look like Bob's program folder, so it was left alone)" }

  if ($ElectronData -and (Split-Path -Leaf $ElectronData) -eq 'Bob') {
    if (Recycle-Folder $ElectronData) { $done += 'his window data (to the Recycle Bin)' } else { $left += $ElectronData }
  }
  if ($Inn -and (Split-Path -Leaf $Inn) -eq 'bob' -and (Split-Path -Leaf (Split-Path -Parent $Inn)) -eq 'inn') {
    Say 'Removing his chats and settings...'
    if (Recycle-Folder $Inn) { $done += "his chats and settings ($Inn, to the Recycle Bin)" } else { $left += $Inn }
  }
  if ($Models -and (Split-Path -Leaf $Models) -eq 'bob' -and (Split-Path -Leaf (Split-Path -Parent $Models)) -eq 'models') {
    Say 'Removing the models Bob downloaded...'
    if (Recycle-Folder $Models) { $done += "his models ($Models, to the Recycle Bin)" } else { $left += $Models }
  }

  $t = 'Bob is removed.'
  if ($done) { $t += "`n`nRemoved: " + ($done -join '; ') + '.' }
  if (-not $Inn) { $t += "`n`nKept: his chats and settings." }
  $t += ' The rest of the inn folder (notice board, logbook, pictures) is untouched.'
  if (-not $Models) { $t += ' Kept: the models he downloaded.' }
  if ($left) { $t += "`n`nNot removed: " + ($left -join '; ') + '. You can delete these by hand.' }
  Say $t
  $ok.Visible = $true
  try { Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue } catch {}
})
[System.Windows.Forms.Application]::Run($form)
