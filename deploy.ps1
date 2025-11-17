# Build production version
Write-Host "Building production version..." -ForegroundColor Green
npm run build:prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}

# Backup index.html
Write-Host "Preparing files..." -ForegroundColor Yellow
Copy-Item index.html index.html.backup -Force

# Replace script.js with script.min.js
(Get-Content index.html) -replace "script\.js", "script.min.js" | Set-Content index.html

# Deploy to Firebase
Write-Host "Deploying to Firebase Hosting..." -ForegroundColor Green
firebase deploy --only hosting

$deploySuccess = $LASTEXITCODE -eq 0

# Restore original index.html
Write-Host "Restoring development files..." -ForegroundColor Yellow
Move-Item index.html.backup index.html -Force

if ($deploySuccess) {
    Write-Host ""
    Write-Host "✓ Deployment successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Live URLs:" -ForegroundColor Cyan
    Write-Host "  https://looting-simulator-90463.web.app" -ForegroundColor White
    Write-Host "  https://lootingsimulator.com (pending DNS)" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "✗ Deployment failed!" -ForegroundColor Red
    exit 1
}
