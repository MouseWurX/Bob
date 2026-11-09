# Bob's optional Windows Task Scheduler entry, "Bob schedules". Off unless you switch it on in Bob.
#
# Bob runs his own schedules while he is open. This task is only for when he isn't: every 15 minutes,
# while you are signed in, it looks at inn\bob\schedules.json and, if a schedule is due and Bob isn't
# open, starts Bob hidden (Bob.exe --hidden) so he can do it. It never runs a job itself, never needs
# admin, runs as you (not SYSTEM) and only while you are signed in.
#
#   -Action Add    -BobExe <path to Bob.exe> -Data <inn\bob> [-Port 7777]   add or refresh the task
#   -Action Remove                                                           remove it (Remove Bob does too)
#   -Action Status                                                           print On or Off
#   -Action Wake   -BobExe ... -Data ... [-Port ...]                          what the task runs
#
# Windows PowerShell 5.1 compatible, plain ASCII. Prints one line saying what happened.
param(
  [ValidateSet('Add', 'Remove', 'Status', 'Wake')] [string] $Action = 'Status',
  [string] $BobExe = '',
  [string] $Data = '',
  [int] $Port = 7777
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Bob schedules'
$TaskPath = '\'

function Get-BobTask {
  try { return Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction Stop } catch { return $null }
}

function Test-BobOpen {
  # Bob's window answers on his port; also count any process running this Bob.exe.
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
    if ($r.AsyncWaitHandle.WaitOne(800) -and $c.Connected) { return $true }
  } catch {} finally { $c.Close() }
  if ($BobExe) {
    $full = [System.IO.Path]::GetFullPath($BobExe)
    $p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $full) }
    if ($p) { return $true }
  }
  return $false
}

function Test-SomethingDue {
  $file = Join-Path $Data 'schedules.json'
  if (-not (Test-Path -LiteralPath $file)) { return $false }
  try { $j = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $false }
  $soon = (Get-Date).ToUniversalTime().AddMinutes(2)
  foreach ($e in @($j.schedules)) {
    if (-not $e.enabled -or $e.done -or -not $e.nextDue) { continue }
    try { $t = [DateTime]::Parse($e.nextDue, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { continue }
    if ($t -le $soon) { return $true }
  }
  return $false
}

function Test-IsBob($exe) {
  # Only start the real Bob: Bob.exe next to resources\app\package.json named bob.
  if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { return $false }
  if ((Split-Path -Leaf $exe) -ne 'Bob.exe') { return $false }
  $pkg = Join-Path (Split-Path -Parent $exe) 'resources\app\package.json'
  try { return ((Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json).name -eq 'bob') } catch { return $false }
}

switch ($Action) {
  'Status' {
    if (Get-BobTask) { 'On' } else { 'Off' }
  }
  'Remove' {
    if (Get-BobTask) { Unregister-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -Confirm:$false; 'Removed the Bob schedules task.' }
    else { 'There was no Bob schedules task.' }
  }
  'Add' {
    if (-not (Test-IsBob $BobExe)) { throw "That isn't Bob's program: $BobExe" }
    if (-not $Data -or -not (Test-Path -LiteralPath $Data -PathType Container)) { throw "Bob's data folder wasn't found: $Data" }
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $psArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Action Wake -BobExe `"$BobExe`" -Data `"$Data`" -Port $Port"
    # conhost --headless keeps the check from flashing a console window every 15 minutes.
    $act = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$ps`" $psArgs"
    $trig = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
    $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $who = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
    $task = New-ScheduledTask -Action $act -Trigger $trig -Settings $set -Principal $who -Description 'Wakes Bob (hidden) when one of his schedules is due and he is not open. Added from Bob; remove it there or in Remove Bob.'
    Register-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -InputObject $task -Force | Out-Null
    'Added the Bob schedules task.'
  }
  'Wake' {
    if (Test-BobOpen) { 'Bob is open; nothing to do.'; break }
    if (-not (Test-SomethingDue)) { 'Nothing is due.'; break }
    if (-not (Test-IsBob $BobExe)) { "Bob's program wasn't found at $BobExe."; break }
    Start-Process -FilePath $BobExe -ArgumentList '--hidden' -WorkingDirectory (Split-Path -Parent $BobExe)
    'Started Bob hidden for a due schedule.'
  }
}
