param(
  [Parameter(Mandatory = $true)]
  [string]$Text,

  [Parameter(Mandatory = $true)]
  [string]$OutFile
)

Add-Type -AssemblyName System.Speech

$directory = Split-Path -Parent $OutFile
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Rate = 0
$speaker.Volume = 95
$speaker.SetOutputToWaveFile($OutFile)
$speaker.Speak($Text)
$speaker.Dispose()
