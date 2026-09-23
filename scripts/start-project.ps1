$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$postgresPort = 55432
$env:POSTGRES_PORT = [string]$postgresPort

function Wait-ForExit {
    Write-Host ''
    Read-Host 'Press Enter to close this window'
}

function Test-DockerReady {
    try {
        & docker.exe info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Start-Postgres {
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is required for PostgreSQL but docker.exe was not found.'
    }

    if (-not (Test-DockerReady)) {
        $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $dockerDesktop)) {
            throw 'Docker Desktop is not running. Please start it and try again.'
        }
        Write-Host 'Starting Docker Desktop for PostgreSQL...'
        Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $deadline -and -not (Test-DockerReady)) {
            Start-Sleep -Seconds 2
        }
        if (-not (Test-DockerReady)) {
            throw 'Docker Desktop did not become ready in time. Please open it and retry.'
        }
    }

    Write-Host 'Starting PostgreSQL...'
    & docker.exe compose -p openmaic-classroom --profile server-persistence up -d postgres
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL could not be started.' }

    $deadline = (Get-Date).AddSeconds(30)
    do {
        $tcpClient = [System.Net.Sockets.TcpClient]::new()
        try {
            $tcpClient.Connect('127.0.0.1', $postgresPort)
            return
        } catch {
            Start-Sleep -Seconds 1
        } finally {
            $tcpClient.Dispose()
        }
    } while ((Get-Date) -lt $deadline)
    throw "PostgreSQL started but did not become ready on port $postgresPort."
}

$tcpClient = [System.Net.Sockets.TcpClient]::new()
try {
    $tcpClient.Connect('127.0.0.1', 3010)
    $isRunning = $true
} catch {
    $isRunning = $false
} finally {
    $tcpClient.Dispose()
}

try {
    Start-Postgres
} catch {
    Write-Host ("Failed to prepare PostgreSQL: " + $_.Exception.Message) -ForegroundColor Red
    Wait-ForExit
    exit 1
}

if ($isRunning) {
    Write-Host 'The classroom and PostgreSQL are already running. Opening it now...'
    Start-Process 'http://127.0.0.1:3010/'
    exit 0
}

$nextCli = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $nextCli)) {
    Write-Host 'Installing project dependencies for the first run...'
    & npx.cmd --yes pnpm@10.28.0 install
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Dependency installation failed.' -ForegroundColor Red
        Wait-ForExit
        exit 1
    }
}

try {
    $browserCommand = "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:3010/'"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
        '-NoProfile',
        '-Command',
        $browserCommand
    )

    Write-Host 'Starting the smart classroom at http://127.0.0.1:3010/' -ForegroundColor Cyan
    & node.exe $nextCli dev -p 3010
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host ("Failed to start the project: " + $_.Exception.Message) -ForegroundColor Red
    $exitCode = 1
}

if ($exitCode -ne 0) {
    Wait-ForExit
}
exit $exitCode
