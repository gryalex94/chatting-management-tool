#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs PC Guard as a Windows Scheduled Task that starts at boot,
    runs invisibly, and auto-restarts if it ever stops.

.DESCRIPTION
    Run this script ONCE from an admin PowerShell on the son's PC.
    It registers a scheduled task called "PCGuard" that:
      - Starts when any user logs on
      - Also starts at system boot (before login)
      - Runs hidden (no window)
      - Restarts automatically if the process dies
      - Uses pythonw.exe so no console appears

.NOTES
    Before running: make sure Python is installed and config.ini is filled in.
#>

$ErrorActionPreference = "Stop"

# --- Locate files ---
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$guardPy    = Join-Path $scriptDir "guard.py"
$configIni  = Join-Path $scriptDir "config.ini"

if (-not (Test-Path $guardPy)) {
    Write-Error "guard.py not found at $guardPy"
    exit 1
}

# config.ini holds the real bot token, so it is never kept in git — it's created
# from the template on first install and must be filled in before installing.
if (-not (Test-Path $configIni)) {
    $example = Join-Path $scriptDir "config.example.ini"
    if (Test-Path $example) {
        Copy-Item $example $configIni
        Write-Host "Created config.ini from config.example.ini. Fill in your bot token and chat ID, then run this installer again."
    } else {
        Write-Error "config.ini not found at $configIni"
    }
    exit 1
}

# --- Find pythonw.exe ---
$pythonw = $null

# Try common locations
$candidates = @(
    (Get-Command pythonw -ErrorAction SilentlyContinue).Source,
    (Get-Command python -ErrorAction SilentlyContinue).Source -replace 'python\.exe$','pythonw.exe',
    "$env:LOCALAPPDATA\Programs\Python\Python312\pythonw.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\pythonw.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\pythonw.exe",
    "C:\Python312\pythonw.exe",
    "C:\Python311\pythonw.exe"
)

foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) {
        $pythonw = $c
        break
    }
}

if (-not $pythonw) {
    Write-Error @"
Could not find pythonw.exe.
Install Python from https://www.python.org/downloads/
Make sure to check 'Add Python to PATH' during installation.
"@
    exit 1
}

Write-Host "Using: $pythonw" -ForegroundColor Cyan

# --- Install Python dependencies ---
Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
$pip = $pythonw -replace 'pythonw\.exe$','python.exe'
& $pip -m pip install -r (Join-Path $scriptDir "requirements.txt") --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Warning "pip install had issues — check above. Continuing anyway."
}

# --- Remove old task if it exists ---
$taskName = "PCGuard"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing '$taskName' task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# --- Create the scheduled task ---
Write-Host "Creating scheduled task '$taskName'..." -ForegroundColor Cyan

$action = New-ScheduledTaskAction `
    -Execute $pythonw `
    -Argument "`"$guardPy`"" `
    -WorkingDirectory $scriptDir

# Trigger: at startup + at any user logon
$triggerBoot  = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Settings: restart on failure, don't stop on idle, run indefinitely
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Seconds 10) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Run as SYSTEM (so a standard-user kid can't stop it;
# even an admin kid won't see it in their Task Manager "Apps" tab)
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $triggerBoot, $triggerLogon `
    -Settings $settings `
    -Principal $principal `
    -Description "Parental time-limit guard with Telegram control" `
    | Out-Null

# --- Start it now ---
Write-Host "Starting task now..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 3
$info = Get-ScheduledTask -TaskName $taskName
Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host " PC Guard installed and running!" -ForegroundColor Green
Write-Host " Task status: $($info.State)" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "It will:" -ForegroundColor White
Write-Host "  - Start automatically at every boot" -ForegroundColor White
Write-Host "  - Restart in 10 seconds if stopped" -ForegroundColor White
Write-Host "  - Run with no visible window" -ForegroundColor White
Write-Host ""
Write-Host "Check Telegram — you should see a 'PC turned on' message." -ForegroundColor Cyan
Write-Host ""
Write-Host "To uninstall later, run uninstall.ps1 as admin." -ForegroundColor Gray
