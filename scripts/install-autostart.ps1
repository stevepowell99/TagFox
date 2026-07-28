# Register (or remove) the per-machine autostart for Everything + TagFox.
# Creates a scheduled task that runs scripts/autostart.ps1 at logon, on unlock and on
# resume from sleep/hibernate. Falls back to a Startup-folder shortcut if the task
# cannot be registered. Nothing here needs elevation.
#
#   pwsh scripts/install-autostart.ps1            # install
#   pwsh scripts/install-autostart.ps1 -Uninstall # remove

[CmdletBinding()]
param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'autostart.ps1'
$taskName = 'TagFoxAutostart'
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$shortcut = Join-Path $startupDir 'TagFox autostart.lnk'

$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
$shellArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""

if ($Uninstall) {
  schtasks.exe /Delete /TN $taskName /F 2>&1 | Out-Null
  if (Test-Path $shortcut) { Remove-Item $shortcut -Force }
  Write-Host "Removed autostart (task $taskName and any Startup shortcut)."
  return
}

if (-not (Test-Path $script)) { throw "Missing $script" }

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start Everything and TagFox at logon and on resume.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$env:USERDOMAIN\$env:USERNAME</UserId>
      <Delay>PT20S</Delay>
    </LogonTrigger>
    <SessionStateChangeTrigger>
      <Enabled>true</Enabled>
      <UserId>$env:USERDOMAIN\$env:USERNAME</UserId>
      <StateChange>SessionUnlock</StateChange>
      <Delay>PT10S</Delay>
    </SessionStateChangeTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Delay>PT10S</Delay>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$env:USERDOMAIN\$env:USERNAME</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$shell</Command>
      <Arguments>$shellArgs</Arguments>
      <WorkingDirectory>$root</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path ([System.IO.Path]::GetTempPath()) 'tagfox-autostart.xml'
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.UnicodeEncoding]::new($false, $true))

$out = schtasks.exe /Create /TN $taskName /XML $xmlPath /F 2>&1
$ok = $LASTEXITCODE -eq 0
Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue

if ($ok) {
  # One mechanism only: drop any earlier fallback shortcut.
  if (Test-Path $shortcut) { Remove-Item $shortcut -Force }
  Write-Host "Installed scheduled task '$taskName' (logon, unlock, resume)."
  return
}

Write-Warning "Could not register the scheduled task: $out"
Write-Host "Falling back to a Startup-folder shortcut (logon only)."
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($shortcut)
$lnk.TargetPath = $shell
$lnk.Arguments = $shellArgs
$lnk.WorkingDirectory = $root
$lnk.WindowStyle = 7
$lnk.Description = 'Start Everything and TagFox'
$lnk.Save()
Write-Host "Created $shortcut"
