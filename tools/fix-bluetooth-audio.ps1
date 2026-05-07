$ErrorActionPreference = "Continue"

$logDir = "D:\Projects\local-ai-radio\driver-backup"
$logPath = Join-Path $logDir "bluetooth-audio-fix.log"
$driverBackup = Join-Path $logDir "bongiovi-oem9"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $driverBackup | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Add-Content -Path $logPath -Value $line
  Write-Host $line
}

Write-Log "Starting Bluetooth audio repair."

Write-Log "Backing up Bongiovi driver oem9.inf."
pnputil /export-driver oem9.inf $driverBackup | Tee-Object -FilePath $logPath -Append

Write-Log "Removing unsigned Bongiovi APO driver package."
pnputil /delete-driver oem9.inf /uninstall /force | Tee-Object -FilePath $logPath -Append

$problemDevices = @(
  "BTHENUM\{0000110b-0000-1000-8000-00805f9b34fb}_LOCALMFG&0002\7&d46190b&0&D723D963386E_C00000000",
  "BTHENUM\{0000110b-0000-1000-8000-00805f9b34fb}_VID&0001000a_PID&ffff\7&d46190b&0&C086B36B0C2F_C00000000"
)

foreach ($device in $problemDevices) {
  Write-Log "Removing bad Bluetooth audio device: $device"
  pnputil /remove-device $device | Tee-Object -FilePath $logPath -Append
}

Write-Log "Restarting Bluetooth and audio services."
$services = @("BthAvctpSvc", "BTAGService", "bthserv", "AudioEndpointBuilder", "Audiosrv")
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

Write-Log "Problem devices after repair:"
pnputil /enum-devices /problem /ids /drivers | Tee-Object -FilePath $logPath -Append

Write-Log "Audio endpoints after repair:"
Get-PnpDevice -Class AudioEndpoint | Select-Object Status, FriendlyName, InstanceId | Format-Table -AutoSize | Out-String | Tee-Object -FilePath $logPath -Append

Write-Log "Bluetooth audio repair finished. You can close this window."
Start-Sleep -Seconds 6
