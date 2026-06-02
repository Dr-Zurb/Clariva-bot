$ErrorActionPreference = 'Continue'

Write-Host '=== STEP 1 of 4: DISM RestoreHealth -- 5 to 10 min ===' -ForegroundColor Cyan
DISM.exe /Online /Cleanup-Image /RestoreHealth

Write-Host ''
Write-Host '=== STEP 2 of 4: SFC scannow -- 5 to 10 min ===' -ForegroundColor Cyan
sfc.exe /scannow

Write-Host ''
Write-Host '=== STEP 3 of 4: Direct DISM enable WSL feature ===' -ForegroundColor Cyan
DISM.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host ''
Write-Host '=== STEP 4 of 4: Direct DISM enable VirtualMachinePlatform ===' -ForegroundColor Cyan
DISM.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host ''
Write-Host '=== Repair finished. Reboot and ping the assistant. Close this window. ===' -ForegroundColor Green
