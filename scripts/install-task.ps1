param(
  [switch]$Uninstall,
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DailyTask = 'ChaoduDaily'
$ServerTask = 'ChaoduServer'

if ($Uninstall) {
  foreach ($name in @($DailyTask, $ServerTask)) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task) {
      Unregister-ScheduledTask -TaskName $name -Confirm:$false
      Write-Host "Removed task: $name"
    }
  }
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe was not found in PATH.' }
if (-not (Test-Path (Join-Path $Root 'scripts\daily.mjs'))) { throw "daily.mjs not found under $Root" }

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

# The website has to survive after logon, so it must not inherit the 15-minute limit.
$serverSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$dailyAction = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"' + (Join-Path $Root 'scripts\daily.mjs') + '"') `
  -WorkingDirectory $Root
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At '08:00'
Register-ScheduledTask `
  -TaskName $DailyTask `
  -Action $dailyAction `
  -Trigger $dailyTrigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Chaodu: generate and push the daily 20 science articles at 08:00.' `
  -Force | Out-Null
Write-Host "Installed task: $DailyTask (daily at 08:00, wakes the PC if needed)"

$vbs = Join-Path $Root 'scripts\run-server-hidden.vbs'
if (Test-Path $vbs) {
  $serverAction = New-ScheduledTaskAction `
    -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') `
    -Argument ('"' + $vbs + '"') `
    -WorkingDirectory $Root
  $serverTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  Register-ScheduledTask `
    -TaskName $ServerTask `
    -Action $serverAction `
    -Trigger $serverTrigger `
    -Settings $serverSettings `
    -Principal $principal `
    -Description 'Chaodu: start the local website in the background after logon.' `
    -Force | Out-Null
  Write-Host "Installed task: $ServerTask (starts the site at logon, hidden window)"
}

if ($RunNow) {
  Start-ScheduledTask -TaskName $DailyTask
  Start-Sleep -Seconds 2
  $info = Get-ScheduledTaskInfo -TaskName $DailyTask
  Write-Host ("Triggered {0}; last result: {1}" -f $DailyTask, $info.LastTaskResult)
}

Write-Host ''
Write-Host "Site:  http://127.0.0.1:4321"
Write-Host "Logs:  $Root\data\server.log"
Write-Host "Remove both tasks with: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Uninstall"
