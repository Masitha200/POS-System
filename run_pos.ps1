# PowerShell 1-Click Launcher for Metro POS
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "            METRO RETAIL MART - POINT OF SALE (POS)            " -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "Detecting Python runtime..." -ForegroundColor Yellow

$pyPath = "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe"

if (Test-Path $pyPath) {
    Write-Host "[+] Found Python at: $pyPath" -ForegroundColor Green
    & $pyPath run_pos.py
} else {
    Write-Host "[+] Using system python..." -ForegroundColor Green
    python run_pos.py
}
