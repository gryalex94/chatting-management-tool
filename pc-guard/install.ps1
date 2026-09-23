#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs PC Guard into C:\Program Files\PCGuard and registers a Windows
    Scheduled Task that starts it at boot, runs invisibly, and restarts it
    if it ever stops.

.DESCRIPTION
    Run this script from an admin PowerShell on the son's PC, inside the
    folder you downloaded PC Guard to. It:
      - copies guard.py and your config.ini to C:\Program Files\PCGuard
      - locks that folder so only administrators can change the program,
        and only administrators can read the settings (bot token) and log
      - installs the 'requests' library into an all-users Python
      - registers a scheduled task "PCGuard" that runs as SYSTEM at boot
    Run it again at any time to update PC Guard or to apply new settings.

.NOTES
    Needs Python 3.10+ installed "for all users" (in C:\Program Files).
    This file is plain ASCII on purpose: Windows PowerShell 5.1 misreads
    special characters in scripts saved without a byte-order mark.
#>

$ErrorActionPreference = "Stop"

function Fail($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    Write-Host ""
    exit 1
}

$taskName   = "PCGuard"
$sourceDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:ProgramFiles "PCGuard"
$dataDir    = Join-Path $installDir "data"

$srcGuard   = Join-Path $sourceDir "guard.py"
$srcConfig  = Join-Path $sourceDir "config.ini"
$example    = Join-Path $sourceDir "config.example.ini"
$destConfig = Join-Path $dataDir "config.ini"

# Well-known Windows group IDs (work in every Windows language)
$admins = "*S-1-5-32-544"   # Administrators
$system = "*S-1-5-18"       # SYSTEM
$users  = "*S-1-5-32-545"   # Users

if (-not (Test-Path $srcGuard)) {
    Fail "guard.py not found at $srcGuard. Run this installer from the PC Guard folder."
}

# --- Settings -----------------------------------------------------------------
# config.ini holds the real bot token, so it is never kept in git. It is created
# from the template on first run and must be filled in before installing.
$useNewConfig = $false
if (Test-Path $srcConfig) {
    $configText = Get-Content -Path $srcConfig -Raw
    if ($configText -match "PASTE_YOUR") {
        Fail "config.ini still contains PASTE_YOUR_... placeholders.`nOpen $srcConfig in Notepad, fill in your bot token and chat ID, save, and run this installer again."
    }
    if ($configText -notmatch '(?m)^\s*utc_offset_hours') {
        Write-Host "Note: config.ini has no 'utc_offset_hours' line, so PC Guard will use UTC time." -ForegroundColor Yellow
        Write-Host "      Copy that line from config.example.ini if you want your own time zone." -ForegroundColor Yellow
    }
    $useNewConfig = $true
} elseif (Test-Path $destConfig) {
    Write-Host "Keeping your existing settings in $destConfig" -ForegroundColor Cyan
} else {
    if (-not (Test-Path $example)) {
        Fail "config.example.ini not found in $sourceDir"
    }
    # Pre-fill this PC's current time zone (hours from UTC)
    $offset = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalHours
    $offsetText = $offset.ToString([Globalization.CultureInfo]::InvariantCulture)
    (Get-Content -Path $example) -replace '^utc_offset_hours\s*=.*$', "utc_offset_hours = $offsetText" |
        Set-Content -Path $srcConfig -Encoding ASCII
    Write-Host ""
    Write-Host "Created config.ini in $sourceDir" -ForegroundColor Yellow
    Write-Host "Open it in Notepad, fill in your bot token and chat ID, save, then run this installer again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# --- Find an all-users Python (in Program Files) -----------------------------
# PC Guard runs as SYSTEM (full control of the PC). A Python installed "just
# for me" lives in a personal folder that that user - or any program they run -
# can change, and the change would then run as SYSTEM. So only a Python
# installed for all users, under Program Files, is accepted.
$pythonw = $null
foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $pythonw -and $root -and (Test-Path $root)) {
        $pythonw = Get-ChildItem -Path $root -Directory -Filter "Python3*" -ErrorAction SilentlyContinue |
            Sort-Object { [int]([regex]::Match($_.Name, '^Python(\d+)').Groups[1].Value) } -Descending |
            ForEach-Object { Join-Path $_.FullName "pythonw.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
    }
}

$howToInstallPython = @"
How to fix:
  1. Go to https://www.python.org/downloads/ and download Python (3.10 or newer)
  2. Run it and click 'Customize installation', then 'Next'
  3. Tick 'Install Python for all users' (it then goes to C:\Program Files\Python3xx)
  4. Click 'Install', wait for it to finish, then run this installer again
"@

if (-not $pythonw) {
    $perUser = @(
        (Get-Command pythonw -ErrorAction SilentlyContinue).Source
        (Get-Command python -ErrorAction SilentlyContinue).Source
        Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python\Python3*\pythonw.exe" -ErrorAction SilentlyContinue |
            ForEach-Object { $_.FullName }
    ) | Where-Object { $_ } | Select-Object -Unique

    if ($perUser) {
        Fail ("Python is only installed for a single user here:`n  " + ($perUser -join "`n  ") +
              "`n`nPC Guard runs with full system rights, so it needs a Python that only" +
              "`nadministrators can change (installed for all users, in C:\Program Files).`n`n" +
              $howToInstallPython)
    }
    Fail ("Could not find Python.`n`n" + $howToInstallPython)
}

$python = Join-Path (Split-Path -Parent $pythonw) "python.exe"
Write-Host "Using: $pythonw" -ForegroundColor Cyan

& $python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) {
    Fail ("PC Guard needs Python 3.10 or newer; $python is older.`n`n" + $howToInstallPython)
}

# --- Install Python dependencies (for all users) -----------------------------
Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
& $python -m pip install --disable-pip-version-check --quiet -r (Join-Path $sourceDir "requirements.txt")
# -I = ignore personal (per-user) packages, exactly as PC Guard runs
& $python -I -c "import requests"
if ($LASTEXITCODE -ne 0) {
    Fail "Could not install the 'requests' library for all users. Check the internet connection and run this installer again."
}

# --- Stop and remove the old task, if any ------------------------------------
$oldDir = $null
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Stopping and removing the existing '$taskName' task..." -ForegroundColor Yellow
    $oldDir = $existingTask.Actions[0].WorkingDirectory
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Start-Sleep -Seconds 2
}

# --- Create the install folder and lock it down ------------------------------
# Permissions are set BEFORE the files are copied in, so the token is never
# readable by the child, not even for a moment.
#   C:\Program Files\PCGuard       Administrators + SYSTEM: full; Users: read only
#   C:\Program Files\PCGuard\data  Administrators + SYSTEM only (token, state, log)
Write-Host "Installing to $installDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

& icacls $dataDir /inheritance:r /grant:r "${admins}:(OI)(CI)F" "${system}:(OI)(CI)F" /Q | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Could not set permissions on $dataDir" }

& icacls $installDir /inheritance:r /grant:r "${admins}:(OI)(CI)F" "${system}:(OI)(CI)F" "${users}:(OI)(CI)RX" /Q | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Could not set permissions on $installDir" }

# Files left from an earlier install: make them follow the folder permissions
Get-ChildItem -Path $installDir -File | ForEach-Object {
    & icacls $_.FullName /reset /Q | Out-Null
}
if (Get-ChildItem -Path $dataDir) {
    & icacls "$dataDir\*" /reset /T /C /Q | Out-Null
}

Copy-Item -Path $srcGuard -Destination (Join-Path $installDir "guard.py") -Force
if ($useNewConfig) {
    Copy-Item -Path $srcConfig -Destination $destConfig -Force
    # Don't leave the bot token lying around in a folder the child can read
    Remove-Item -Path $srcConfig -Force
    Write-Host "Your settings were moved to $destConfig" -ForegroundColor Cyan
    Write-Host "(the copy in $sourceDir was deleted so the bot token isn't left behind)." -ForegroundColor Cyan
}
$installedGuard = Join-Path $installDir "guard.py"

# --- Create the scheduled task -----------------------------------------------
Write-Host "Creating scheduled task '$taskName'..." -ForegroundColor Cyan

# -I = isolated mode: Python ignores personal packages and PYTHON* settings
$action = New-ScheduledTaskAction `
    -Execute $pythonw `
    -Argument "-I `"$installedGuard`"" `
    -WorkingDirectory $installDir

# Trigger: at startup + at any user logon
$triggerBoot  = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Settings: restart on failure, don't stop on idle, run indefinitely
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Run as SYSTEM so a standard-user child can't stop it
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

# --- Start it now ------------------------------------------------------------
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
Write-Host "  - Restart within a minute if stopped" -ForegroundColor White
Write-Host "  - Run with no visible window" -ForegroundColor White
Write-Host "  - Lock the screen when time is up, even without internet" -ForegroundColor White
Write-Host ""
Write-Host "Check Telegram - you should see a 'PC turned on' message." -ForegroundColor Cyan
Write-Host "Settings: $destConfig (open Notepad as administrator to edit," -ForegroundColor Gray
Write-Host "then run this installer again to apply them)." -ForegroundColor Gray
if ($oldDir -and ($oldDir.TrimEnd('\') -ne $installDir.TrimEnd('\'))) {
    Write-Host ""
    Write-Host "The old copy in $oldDir is no longer used." -ForegroundColor Yellow
    Write-Host "Delete that folder - it still contains your old bot token." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Important: your son's Windows account should be a STANDARD account (not" -ForegroundColor Yellow
Write-Host "administrator) with a password - otherwise he can switch PC Guard off." -ForegroundColor Yellow
Write-Host ""
Write-Host "To uninstall later, run uninstall.ps1 as admin." -ForegroundColor Gray
