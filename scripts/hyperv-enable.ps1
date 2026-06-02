$ErrorActionPreference = 'Continue'
$logPath = 'D:\Users\assah\OneDrive\Desktop\APPS\AI EHR Mobile\ai-ehr-mobile-code\clariva-bot\scripts\hyperv-enable.log'
Start-Transcript -Path $logPath -Force | Out-Null

Write-Host '=== Enabling Hyper-V (all sub-features) ===' -ForegroundColor Cyan
DISM.exe /online /enable-feature /featurename:Microsoft-Hyper-V-All /all /norestart
$hvExit = $LASTEXITCODE

Write-Host ''
Write-Host '=== Enabling Containers feature (Docker prereq) ===' -ForegroundColor Cyan
DISM.exe /online /enable-feature /featurename:Containers /all /norestart
$ctExit = $LASTEXITCODE

Write-Host ''
Write-Host '=== RESULT SUMMARY ===' -ForegroundColor Yellow
Write-Host ('Hyper-V exit code:    ' + $hvExit)
Write-Host ('Containers exit code: ' + $ctExit)

if ($hvExit -eq 0 -and $ctExit -eq 0) {
    Write-Host 'SUCCESS' -ForegroundColor Green
} else {
    Write-Host 'FAILED' -ForegroundColor Red
}

Stop-Transcript | Out-Null
