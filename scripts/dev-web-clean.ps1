$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$webDir = Join-Path $repoRoot "apps\web"

function Stop-PortProcess {
  param([int]$Port)

  $attempt = 0
  $maxAttempts = 8

  do {
    $attempt += 1
    $processIds = Get-PortProcessIds -Port $Port

    foreach ($processId in $processIds) {
      if ($processId -and $processId -ne $PID) {
        Write-Host "Stopping process tree $processId on port $Port..."
        & taskkill.exe /PID $processId /T /F | Out-Host
      }
    }

    if ($processIds.Count -gt 0) {
      Start-Sleep -Seconds 2
    }
  } while ((Get-PortProcessIds -Port $Port).Count -gt 0 -and $attempt -lt $maxAttempts)

  $remaining = Get-PortProcessIds -Port $Port
  if ($remaining.Count -gt 0) {
    throw "Port $Port is still in use by process id(s): $($remaining -join ', ')"
  }

  Write-Host "Port $Port is free."
}

function Get-PortProcessIds {
  param([int]$Port)

  $processIds = @()

  try {
    $processIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $netstatLines = netstat -ano | Select-String -Pattern ":$Port\s+.*LISTENING"
    foreach ($line in $netstatLines) {
      $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
      if ($parts.Length -gt 0) {
        $processIds += [int]$parts[$parts.Length - 1]
      }
    }
    $processIds = $processIds | Select-Object -Unique
  }

  return @($processIds | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique)
}

function Remove-WorkspacePath {
  param([string]$Path)

  $rootPath = (Resolve-Path $repoRoot).Path
  $parent = Split-Path -Parent $Path
  $leaf = Split-Path -Leaf $Path

  if (-not (Test-Path $Path)) {
    return
  }

  $resolvedParent = (Resolve-Path $parent).Path
  $targetPath = Join-Path $resolvedParent $leaf

  if (-not $targetPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside repository: $targetPath"
  }

  Write-Host "Removing $targetPath..."
  Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction SilentlyContinue
}

Set-Location $repoRoot

Stop-PortProcess -Port 3000

Remove-WorkspacePath -Path (Join-Path $webDir ".next")
Remove-WorkspacePath -Path (Join-Path $repoRoot ".next")
Remove-WorkspacePath -Path (Join-Path $webDir "tsconfig.tsbuildinfo")

Set-Location $repoRoot

$npm = "npm.cmd"
Write-Host "Starting web preview with: $npm run dev:web"
& $npm run dev:web
