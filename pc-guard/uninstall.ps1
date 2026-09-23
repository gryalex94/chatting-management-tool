#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Removes PC Guard: stops it, deletes the "PCGuard" scheduled task, and
    deletes C:\Program Files\PCGuard (program, settings, timer state and log).
#>

$taskName   = "PCGuard"
$installDir = Join-Path $env:ProgramFiles "PCGuard"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Stopping and removing '$taskName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Scheduled task removed." -ForegroundColor Green
} else {
    Write-Host "Task '$taskName' not found - nothing to remove." -ForegroundColor Gray
}

if (Test-Path $installDir) {
    Write-Host "Deleting $installDir ..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2   # give the program a moment to exit
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path $installDir) {
        # Still running? Stop any PC Guard process, then try again.
        Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like "*PCGuard*guard.py*" } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $installDir) {
        Write-Host "Could not delete everything in $installDir." -ForegroundColor Red
        Write-Host "Restart the PC and delete that folder by hand." -ForegroundColor Red
    } else {
        Write-Host "Deleted $installDir." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Done. PC Guard has been removed." -ForegroundColor Green
Write-Host "Tip: if you won't use the bot again, delete it in @BotFather (/deletebot)." -ForegroundColor Gray
