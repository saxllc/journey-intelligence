Write-Host ""
Write-Host "APPLICATIONATOR DEMO STARTER" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/3] Stopping old processes..." -ForegroundColor Yellow
pm2 delete applicationator 2>$null
taskkill /F /IM ngrok.exe 2>$null
Start-Sleep -Seconds 1
Write-Host "      Done." -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Starting Express via PM2..." -ForegroundColor Yellow
pm2 start C:\Users\dhuli\applicationator\demo\server.js --name applicationator
Start-Sleep -Seconds 2
Write-Host "      Done." -ForegroundColor Green

Write-Host ""
Write-Host "[3/3] Starting ngrok..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000"
Start-Sleep -Seconds 4

$ngrokUrl = "NOT DETECTED"
try {
  $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
  $https = $tunnels.tunnels | Where-Object { $_.proto -eq "https" }
  $ngrokUrl = $https.public_url
} catch {
  $ngrokUrl = "Check ngrok window manually"
}

Write-Host "      Done." -ForegroundColor Green
Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "DEMO READY" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "DESKTOP - Configurator:" -ForegroundColor White
Write-Host "  https://applicationator.vercel.app/configurator.html" -ForegroundColor Green
Write-Host ""
Write-Host "PHONE - Finternet App:" -ForegroundColor White
Write-Host "  https://applicationator.vercel.app/finternet.html" -ForegroundColor Green
Write-Host ""
Write-Host "ngrok URL - paste into Configurator:" -ForegroundColor White
Write-Host "  $ngrokUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "STEPS:" -ForegroundColor Cyan
Write-Host "  1. Copy ngrok URL above" -ForegroundColor White
Write-Host "  2. Open Configurator, paste URL, click Save URL" -ForegroundColor White
Write-Host "  3. Select persona, click Apply" -ForegroundColor White
Write-Host "  4. Open Finternet app on phone" -ForegroundColor White
Write-Host ""