$ErrorActionPreference = "Continue"

$logDir = "D:\Projects\local-ai-radio\driver-backup"
$logPath = Join-Path $logDir "rubyoung-reset.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Add-Content -Path $logPath -Value $line
  Write-Host $line
}

Write-Log "Starting Rubyoung_M430 reset."

$devices = Get-PnpDevice | Where-Object { $_.FriendlyName -like "*Rubyoung*" -or $_.FriendlyName -like "*M430*" }
foreach ($device in $devices) {
  Write-Log "Removing paired device instance: $($device.FriendlyName) / $($device.InstanceId)"
  pnputil /remove-device $device.InstanceId | Tee-Object -FilePath $logPath -Append
}

Write-Log "Restarting Bluetooth services."
$services = @("BthAvctpSvc", "BTAGService", "bthserv")
foreach ($service in $services) {
  try {
    Restart-Service -Name $service -Force -ErrorAction Stop
    Write-Log "Restarted service: $service"
  } catch {
    Write-Log "Could not restart service ${service}: $($_.Exception.Message)"
  }
}

Write-Log "Scanning devices."
pnputil /scan-devices | Tee-Object -FilePath $logPath -Append

Write-Log "Rubyoung reset finished. Put the speaker into pairing mode, then add it again in Windows Bluetooth settings."
Start-Sleep -Seconds 6
