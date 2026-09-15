#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Removes PC Guard scheduled task and stops the program.
#>

$taskName = "PCGuard"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Stopping and removing '$taskName'..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Done. PC Guard has been removed." -ForegroundColor Green
} else {
    Write-Host "Task '$taskName' not found — nothing to remove." -ForegroundColor Gray
}
