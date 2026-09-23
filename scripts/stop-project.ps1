$ErrorActionPreference = 'Stop'

try {
    $listenerPattern = '^\s*TCP\s+\S+:3010\s+\S+\s+LISTENING\s+(\d+)\s*$'
    $targetPids = @(
        & netstat.exe -ano -p TCP |
            Where-Object { $_ -match $listenerPattern } |
            ForEach-Object {
                if ($_ -match $listenerPattern) { [int]$Matches[1] }
            } |
            Select-Object -Unique
    )

    foreach ($targetPid in $targetPids) {
        & taskkill.exe /PID $targetPid /T /F *> $null
        if ($LASTEXITCODE -ne 0) {
            Stop-Process -Id $targetPid -Force -ErrorAction Stop
        }
    }

    if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
        & docker.exe compose -p openmaic-classroom --profile server-persistence stop postgres *> $null
    }

    if ($targetPids.Count -eq 0) {
        Write-Host 'The classroom was not running. PostgreSQL has been stopped.'
    } else {
        Write-Host 'The classroom and PostgreSQL have been stopped.' -ForegroundColor Green
    }
    Start-Sleep -Seconds 2
    exit 0
} catch {
    Write-Host ("Failed to stop the project: " + $_.Exception.Message) -ForegroundColor Red
    Read-Host 'Press Enter to close this window'
    exit 1
}
