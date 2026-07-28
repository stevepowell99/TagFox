# Start Everything (user instance, which hosts the HTTP server) and TagFox, if they are not already up.
# Idempotent: safe to run at logon, on resume, or by hand. See scripts/install-autostart.ps1.

[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA 'TagFox'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir 'autostart.log'

function Write-Log([string]$msg) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $log -Value $line
}

# Keep the log from growing without bound across boots.
if ((Test-Path $log) -and (Get-Item $log).Length -gt 200KB) { Clear-Content $log }
Write-Log "--- autostart run ---"

# --- Everything ---------------------------------------------------------

function Get-EverythingExe {
  $svc = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.PathName -match 'Everything\.exe' } | Select-Object -First 1
  if ($svc -and $svc.PathName -match '"([^"]+Everything\.exe)"') { return $Matches[1] }
  Get-ChildItem 'C:\Program Files\Everything*','C:\Program Files (x86)\Everything*' `
    -Filter Everything.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

function Get-EverythingHttpPort {
  # The HTTP server is a plugin; its port lives in the per-user plugin ini.
  $ini = Join-Path $env:APPDATA 'Everything\Plugins-1.5a.ini'
  if (Test-Path $ini) {
    $m = Select-String -Path $ini -Pattern '^port=(\d+)' | Select-Object -First 1
    if ($m) { return [int]$m.Matches[0].Groups[1].Value }
  }
  7070
}

function Test-EverythingUserInstance {
  # The service runs as SYSTEM and does not serve HTTP, so only a process owned by
  # this user counts as "Everything is up".
  $me = "$env:USERNAME"
  foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='Everything.exe'" -ErrorAction SilentlyContinue)) {
    $owner = Invoke-CimMethod -InputObject $p -MethodName GetOwner -ErrorAction SilentlyContinue
    if ($owner -and $owner.User -eq $me) { return $true }
  }
  $false
}

$port = Get-EverythingHttpPort

if (Test-EverythingUserInstance) {
  Write-Log "Everything already running for $env:USERNAME"
} else {
  $exe = Get-EverythingExe
  if (-not $exe) {
    Write-Log "ERROR Everything.exe not found; cannot start"
  } else {
    Write-Log "starting $exe -startup"
    Start-Process -FilePath $exe -ArgumentList '-startup' -WindowStyle Hidden
  }
}

# Wait for the HTTP server, since TagFox is useless without it.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$httpUp = $false
while ((Get-Date) -lt $deadline) {
  if ((Test-NetConnection -ComputerName '127.0.0.1' -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    $httpUp = $true; break
  }
  Start-Sleep -Milliseconds 500
}
Write-Log ("Everything HTTP on port {0}: {1}" -f $port, $(if ($httpUp) { 'up' } else { 'NOT responding' }))

# --- TagFox -------------------------------------------------------------

$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$running = @(Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path -ieq $electron }).Count -gt 0

if ($running) {
  Write-Log "TagFox already running"
} elseif (-not (Test-Path $electron)) {
  Write-Log "ERROR $electron missing; run npm install in $root"
} else {
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { $npm = Join-Path $env:ProgramFiles 'nodejs\npm.cmd' }
  if (-not (Test-Path $npm)) {
    Write-Log "ERROR npm not found; cannot start TagFox"
  } else {
    # npm start, not electron directly: prestart regenerates vendor assets and help.
    Write-Log "starting TagFox via $npm start in $root"
    Start-Process -FilePath $npm -ArgumentList 'start' -WorkingDirectory $root -WindowStyle Hidden
  }
}
