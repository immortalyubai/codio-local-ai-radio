param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"

Write-Host "Starting NeteaseCloudMusicApi on http://localhost:$Port ..."
Write-Host "Codio API will use this through NETEASE_API_BASE or the default http://localhost:3001."
Write-Host ""

$env:PORT = "$Port"
npx.cmd NeteaseCloudMusicApi@latest
