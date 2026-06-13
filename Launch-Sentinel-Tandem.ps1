# Sentinel Tandem Suite Launcher
# Starts the Tandem server and opens the operator dashboard.

param(
    [int]$Port = 3100,
    [string]$EdgeApiUrl = "",
    [string]$PulseApiUrl = "",
    [string]$PulseEdgeApiKey = "",
    [int]$RefreshMs = 5000,
    [string]$LogPath = "",
    [switch]$NoBrowser,
    [switch]$InstallDeps,
    [switch]$Rebuild,
    [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
$ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

$DesktopPath = [Environment]::GetFolderPath("Desktop")
if (-not $DesktopPath) { $DesktopPath = Join-Path $HOME "Desktop" }
if (-not $LogPath) { $LogPath = $DesktopPath }

$LogFile = Join-Path $LogPath "Sentinel-Tandem-Suite.log"
$OwnedProcesses = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$BrowserProcess = $null
$BrowserProfileDir = $null
$BrowserProcessIds = @()
$BrowserWindowProcessIds = @()
$BrowserStartedAt = $null
$BrowserMonitorDisabled = $false
$ShutdownStarted = $false
$CleanupEventSubscription = $null
$CancelKeyPressHandler = $null
$LauncherWatchdogProcess = $null
$LauncherWatchdogStopFile = $null
$LauncherWatchdogScriptFile = $null

function Write-Status {
    param([string]$Message, [string]$Level = "INFO")
    $color = switch ($Level) {
        "OK" { "Green" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        default { "Cyan" }
    }
    Write-Host "[$Level] $Message" -ForegroundColor $color
    if (Test-Path $LogPath) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
        Add-Content -Path $LogFile -Value "$timestamp [$Level] $Message" -Encoding UTF8
    }
}

function Join-ProcessArguments {
    param([string[]]$Arguments)

    return (($Arguments | ForEach-Object {
        $arg = $_
        if ([string]::IsNullOrEmpty($arg)) {
            '""'
        } elseif ($arg -match '[\s"]') {
            $escaped = $arg.Replace('"', '\"')
            '"' + $escaped + '"'
        } else {
            $arg
        }
    }) -join " ")
}

function Test-PortOpen {
    param([int]$Port)
    try {
        $client = New-Object Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(750, $false)
        if ($connected) { $client.EndConnect($async) }
        $client.Close()
        return $connected
    } catch {
        return $false
    }
}

function Wait-Port {
    param([int]$Port, [int]$Seconds = 30)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen -Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Test-TandemSuite {
    param([int]$Port)
    try {
        $snapshot = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/tandem/snapshot" -Method Get -TimeoutSec 5
        $properties = @($snapshot.PSObject.Properties.Name)
        return (
            $properties -contains "config" -and
            $properties -contains "edgeLive" -and
            $properties -contains "pulseHealth"
        )
    } catch {
        return $false
    }
}

function Wait-TandemSuite {
    param([int]$Port, [int]$Seconds = 45)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TandemSuite -Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Test-TandemUi {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
        return ($response.StatusCode -eq 200 -and $response.Content -match "Sentinel Tandem Suite")
    } catch {
        return $false
    }
}

function Find-CommandPath {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

function Find-Node {
    return Find-CommandPath -Names @("node.exe", "node")
}

function Find-Npm {
    return Find-CommandPath -Names @("npm.cmd", "npm.exe", "npm")
}

function Find-BrowserExecutable {
    $candidates = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }

    return Find-CommandPath -Names @("msedge.exe", "chrome.exe")
}

function Get-BrowserProfileProcesses {
    if (-not $BrowserProfileDir) { return @() }
    try {
        return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($BrowserProfileDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 } |
            ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    } catch {
        return @()
    }
}

function Get-BrowserWindowProcesses {
    return @(Get-BrowserProfileProcesses | Where-Object { $_.MainWindowHandle -and $_.MainWindowHandle -ne 0 })
}

function Update-BrowserProcessIds {
    $profileProcesses = @(Get-BrowserProfileProcesses)
    if ($profileProcesses.Count -gt 0) {
        $script:BrowserProcessIds = @($profileProcesses | Select-Object -ExpandProperty Id)
    }
    $windowProcesses = @($profileProcesses | Where-Object { $_.MainWindowHandle -and $_.MainWindowHandle -ne 0 })
    if ($windowProcesses.Count -gt 0) {
        $script:BrowserWindowProcessIds = @($windowProcesses | Select-Object -ExpandProperty Id)
    }
    return $profileProcesses
}

function Wait-BrowserProfileProcesses {
    param([int]$Seconds = 10)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $profileProcesses = @(Update-BrowserProcessIds)
        if ($profileProcesses.Count -gt 0) { return $profileProcesses }
        Start-Sleep -Milliseconds 250
    }
    return @(Update-BrowserProcessIds)
}

function Wait-BrowserWindowProcesses {
    param([int]$Seconds = 10)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        Update-BrowserProcessIds | Out-Null
        $windowProcesses = @(Get-BrowserWindowProcesses)
        if ($windowProcesses.Count -gt 0) {
            $script:BrowserWindowProcessIds = @($windowProcesses | Select-Object -ExpandProperty Id)
            return $windowProcesses
        }
        Start-Sleep -Milliseconds 250
    }
    Update-BrowserProcessIds | Out-Null
    return @(Get-BrowserWindowProcesses)
}

function Test-BrowserWindowClosed {
    if ($BrowserMonitorDisabled) { return $false }
    if (-not $BrowserProcess -and -not $BrowserProfileDir -and $BrowserProcessIds.Count -eq 0 -and $BrowserWindowProcessIds.Count -eq 0) { return $false }

    $profileProcesses = @(Update-BrowserProcessIds)
    $windowProcesses = @(Get-BrowserWindowProcesses)
    if ($windowProcesses.Count -gt 0) {
        $script:BrowserWindowProcessIds = @($windowProcesses | Select-Object -ExpandProperty Id)
        return $false
    }

    $knownWindowProcesses = @($BrowserWindowProcessIds | ForEach-Object {
        $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($process -and $process.MainWindowHandle -and $process.MainWindowHandle -ne 0) { $process }
    })
    if ($knownWindowProcesses.Count -gt 0) { return $false }
    if ($BrowserWindowProcessIds.Count -gt 0) { return $true }

    $knownProcesses = @($BrowserProcessIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if ($knownProcesses.Count -gt 0) { return $false }
    if ($BrowserProcessIds.Count -gt 0) { return $true }

    if ($BrowserProfileDir -and $BrowserStartedAt) {
        $elapsed = ((Get-Date) - $BrowserStartedAt).TotalSeconds
        if ($elapsed -lt 15 -and $profileProcesses.Count -gt 0) { return $false }
        if ($profileProcesses.Count -gt 0) { return $true }
    }

    if ($BrowserProcess -and $BrowserProcess.HasExited) { return $true }
    return $false
}

function Start-BrowserWindow {
    param([string]$Url)

    $browserExe = Find-BrowserExecutable
    if ($browserExe) {
        Write-Status "Opening dedicated browser window"
        $script:BrowserProfileDir = Join-Path ([System.IO.Path]::GetTempPath()) "SentinelTandem-Browser-$PID"
        $script:BrowserStartedAt = Get-Date
        New-Item -ItemType Directory -Path $script:BrowserProfileDir -Force | Out-Null
        $browserArgs = Join-ProcessArguments -Arguments @("--new-window", "--app=$Url", "--user-data-dir=$script:BrowserProfileDir", "--no-first-run", "--disable-background-mode")
        $process = Start-Process -FilePath $browserExe -ArgumentList $browserArgs -PassThru
        Wait-BrowserProfileProcesses -Seconds 10 | Out-Null
        Wait-BrowserWindowProcesses -Seconds 10 | Out-Null
        return $process
    }

    Write-Status "Opening default browser without close monitoring" "WARN"
    Start-Process $Url | Out-Null
    return $null
}

function Start-OwnedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [switch]$Visible
    )

    $startParams = @{
        FilePath = $FilePath
        WorkingDirectory = $WorkingDirectory
        PassThru = $true
    }
    if ($ArgumentList -and $ArgumentList.Count -gt 0) {
        $startParams.ArgumentList = Join-ProcessArguments -Arguments $ArgumentList
    }
    if (-not $Visible) {
        $startParams.WindowStyle = "Hidden"
    }
    $process = Start-Process @startParams
    $OwnedProcesses.Add($process)
    return $process
}

function Stop-ProcessTree {
    param([int]$ProcessId)
    try {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
        foreach ($child in $children) {
            Stop-ProcessTree -ProcessId $child.ProcessId
        }

        $current = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($current) {
            Write-Status "Stopping process $($current.ProcessName) ($($current.Id))"
            Stop-Process -Id $current.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

function Stop-PortOwnerProcess {
    param([int]$Port, [string]$Label)
    $owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -and $_ -gt 0 })
    foreach ($owner in $owners) {
        Write-Status "Replacing existing $Label on port $Port (process $owner)" "WARN"
        Stop-ProcessTree -ProcessId $owner
    }
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-PortOpen -Port $Port)) { return }
        Start-Sleep -Milliseconds 250
    }
    if (Test-PortOpen -Port $Port) {
        throw "Port $Port is still in use after stopping existing $Label."
    }
}

function Stop-OwnedProcesses {
    for ($i = $OwnedProcesses.Count - 1; $i -ge 0; $i--) {
        $process = $OwnedProcesses[$i]
        Stop-ProcessTree -ProcessId $process.Id
    }
}

function Start-LauncherShutdownWatchdog {
    if ($script:LauncherWatchdogProcess -and -not $script:LauncherWatchdogProcess.HasExited) { return }

    $watchdogName = "SentinelTandem-Watchdog-$PID"
    $script:LauncherWatchdogStopFile = Join-Path ([System.IO.Path]::GetTempPath()) "$watchdogName.stop"
    $script:LauncherWatchdogScriptFile = Join-Path ([System.IO.Path]::GetTempPath()) "$watchdogName.ps1"
    if (Test-Path $script:LauncherWatchdogStopFile) {
        Remove-Item -LiteralPath $script:LauncherWatchdogStopFile -Force -ErrorAction SilentlyContinue
    }

    $watchdogScript = @'
param(
    [int]$ParentProcessId,
    [string]$BrowserProfileDir,
    [string]$OwnedProcessIds,
    [string]$StopFile,
    [string]$LogFile
)

function Write-WatchdogLog {
    param([string]$Message)
    if (-not $LogFile) { return }
    try {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
        Add-Content -Path $LogFile -Value "$timestamp [WATCHDOG] $Message" -Encoding UTF8
    } catch {
    }
}

function Get-ProfileProcesses {
    if (-not $BrowserProfileDir) { return @() }
    try {
        return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($BrowserProfileDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 } |
            ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    } catch {
        return @()
    }
}

function Stop-ProcessTreeById {
    param([int]$ProcessId)
    try {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
        foreach ($child in $children) {
            Stop-ProcessTreeById -ProcessId $child.ProcessId
        }
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    } catch {
    }
}

try {
    while ($true) {
        if ($StopFile -and (Test-Path -LiteralPath $StopFile)) { exit 0 }
        $parent = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
        if (-not $parent) { break }
        Start-Sleep -Seconds 1
    }

    Write-WatchdogLog "Launcher process $ParentProcessId ended; closing browser and owned processes"
    $profileProcesses = @(Get-ProfileProcesses)
    foreach ($process in $profileProcesses) {
        try { $process.CloseMainWindow() | Out-Null } catch {}
    }
    Start-Sleep -Milliseconds 750
    foreach ($process in $profileProcesses) {
        Stop-ProcessTreeById -ProcessId $process.Id
    }

    foreach ($idText in @($OwnedProcessIds -split ",")) {
        if (-not $idText) { continue }
        $id = 0
        if ([int]::TryParse($idText, [ref]$id)) {
            Stop-ProcessTreeById -ProcessId $id
        }
    }

    if ($BrowserProfileDir -and (Test-Path -LiteralPath $BrowserProfileDir)) {
        Remove-Item -LiteralPath $BrowserProfileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
} catch {
    Write-WatchdogLog $_.Exception.Message
}
'@

    Set-Content -Path $script:LauncherWatchdogScriptFile -Value $watchdogScript -Encoding UTF8
    $ownedIds = @($OwnedProcesses | ForEach-Object { $_.Id }) -join ","
    $watchdogArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $script:LauncherWatchdogScriptFile,
        "-ParentProcessId", "$PID",
        "-BrowserProfileDir", "$BrowserProfileDir",
        "-OwnedProcessIds", $ownedIds,
        "-StopFile", $script:LauncherWatchdogStopFile,
        "-LogFile", $LogFile
    )
    $script:LauncherWatchdogProcess = Start-Process -FilePath "powershell.exe" -ArgumentList (Join-ProcessArguments -Arguments $watchdogArgs) -WindowStyle Hidden -PassThru
}

function Stop-LauncherShutdownWatchdog {
    if ($script:LauncherWatchdogStopFile) {
        New-Item -ItemType File -Path $script:LauncherWatchdogStopFile -Force -ErrorAction SilentlyContinue | Out-Null
    }
    if ($script:LauncherWatchdogProcess -and -not $script:LauncherWatchdogProcess.HasExited) {
        try {
            $script:LauncherWatchdogProcess.WaitForExit(2000) | Out-Null
            if (-not $script:LauncherWatchdogProcess.HasExited) {
                Stop-Process -Id $script:LauncherWatchdogProcess.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
        }
    }
    if ($script:LauncherWatchdogScriptFile -and (Test-Path $script:LauncherWatchdogScriptFile)) {
        Remove-Item -LiteralPath $script:LauncherWatchdogScriptFile -Force -ErrorAction SilentlyContinue
    }
    if ($script:LauncherWatchdogStopFile -and (Test-Path $script:LauncherWatchdogStopFile)) {
        Remove-Item -LiteralPath $script:LauncherWatchdogStopFile -Force -ErrorAction SilentlyContinue
    }
}

function Stop-BrowserWindow {
    $profileProcesses = @(Get-BrowserProfileProcesses)
    try {
        foreach ($current in $profileProcesses) {
            Write-Status "Closing browser window ($($current.Id))"
            $current.CloseMainWindow() | Out-Null
        }
        Start-Sleep -Milliseconds 500
        foreach ($current in $profileProcesses) {
            $remaining = Get-Process -Id $current.Id -ErrorAction SilentlyContinue
            if ($remaining) {
                Stop-Process -Id $remaining.Id -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
    }
    if ($profileProcesses.Count -eq 0 -and $BrowserProcess) {
        try {
            $current = Get-Process -Id $BrowserProcess.Id -ErrorAction SilentlyContinue
            if ($current) {
                Write-Status "Closing browser window ($($current.Id))"
                $current.CloseMainWindow() | Out-Null
                Start-Sleep -Milliseconds 500
                $current = Get-Process -Id $BrowserProcess.Id -ErrorAction SilentlyContinue
                if ($current) {
                    Stop-Process -Id $current.Id -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {
        }
    }
    if ($BrowserProfileDir -and (Test-Path $BrowserProfileDir)) {
        try { Remove-Item -LiteralPath $BrowserProfileDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Invoke-LauncherCleanup {
    if ($script:ShutdownStarted) { return }
    $script:ShutdownStarted = $true
    Stop-LauncherShutdownWatchdog
    Stop-BrowserWindow
    Stop-OwnedProcesses
}

function Register-LauncherShutdownHandlers {
    try {
        $script:CleanupEventSubscription = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
            Invoke-LauncherCleanup
        }
    } catch {
    }

    try {
        $script:CancelKeyPressHandler = [ConsoleCancelEventHandler]{
            param($sender, $eventArgs)
            $eventArgs.Cancel = $true
            Write-Status "Shutdown requested; closing browser and Tandem server" "WARN"
            Invoke-LauncherCleanup
            exit 0
        }
        [Console]::CancelKeyPress += $script:CancelKeyPressHandler
    } catch {
    }
}

if ($SmokeTest) {
    Write-Status "Running launcher smoke test"
    $quotedArgs = Join-ProcessArguments -Arguments @("--user-data-dir=C:\Users\Lite OS\AppData\Local\Temp\SentinelTandem-Browser-1234")
    if (-not $quotedArgs.Contains('"--user-data-dir=C:\Users\Lite OS\AppData\Local\Temp\SentinelTandem-Browser-1234"')) {
        throw "Browser argument quoting smoke test failed."
    }
    $pathArgs = Join-ProcessArguments -Arguments @("dist-server\server\index.js", "--port", "3100")
    if (-not $pathArgs.Contains("dist-server\server\index.js") -or -not $pathArgs.Contains("--port")) {
        throw "Server argument smoke test failed."
    }
    if (-not (Get-Command Start-Process -ErrorAction SilentlyContinue)) {
        throw "Start-Process is unavailable."
    }
    Write-Status "Launcher smoke test passed" "OK"
    exit 0
}

Register-LauncherShutdownHandlers

try {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Sentinel Tandem Suite" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Status "Project root: $ProjectRoot"
    Write-Status "Launcher log: $LogFile"

    $node = Find-Node
    if (-not $node) { throw "Node.js was not found. Install Node.js 20+ and rerun the launcher." }
    $npm = Find-Npm
    if (-not $npm) { throw "npm was not found. Install Node.js/npm and rerun the launcher." }

    if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
        throw "package.json was not found in $ProjectRoot."
    }

    if ($InstallDeps -or -not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
        Write-Status "Installing Tandem Suite dependencies"
        & $npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    }

    $serverEntry = Join-Path $ProjectRoot "dist-server\server\index.js"
    $uiEntry = Join-Path $ProjectRoot "dist\index.html"
    if ($Rebuild -or -not (Test-Path $serverEntry) -or -not (Test-Path $uiEntry)) {
        Write-Status "Building Tandem Suite"
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE." }
    }

    if (-not $EdgeApiUrl) { $EdgeApiUrl = $env:EDGE_API_URL }
    if (-not $EdgeApiUrl) { $EdgeApiUrl = "http://localhost:8001" }
    if (-not $PulseApiUrl) { $PulseApiUrl = $env:PULSE_API_URL }
    if (-not $PulseApiUrl) { $PulseApiUrl = "http://localhost:8002" }
    if (-not $PulseEdgeApiKey) { $PulseEdgeApiKey = $env:PULSE_EDGE_API_KEY }

    $env:EDGE_API_URL = $EdgeApiUrl
    $env:PULSE_API_URL = $PulseApiUrl
    $env:PULSE_EDGE_API_KEY = $PulseEdgeApiKey
    $env:REFRESH_MS = "$RefreshMs"
    $env:PORT = "$Port"
    $env:NODE_ENV = "production"

    Write-Status "Edge API: $EdgeApiUrl"
    Write-Status "Pulse API: $PulseApiUrl"
    if ($PulseEdgeApiKey) {
        Write-Status "Pulse Edge API key: configured" "OK"
    } else {
        Write-Status "Pulse Edge API key is not configured; protected Pulse Edge endpoints will report unavailable." "WARN"
    }

    if (Test-PortOpen -Port $Port) {
        if (-not (Test-TandemSuite -Port $Port)) {
            throw "Port $Port is already in use by another service. Stop that service or launch Tandem with -Port <free port>."
        }
        Stop-PortOwnerProcess -Port $Port -Label "Sentinel Tandem Suite"
    }

    if (-not (Test-PortOpen -Port $Port)) {
        Write-Status "Starting Tandem Suite on port $Port"
        Start-OwnedProcess -FilePath $node -ArgumentList @("dist-server\server\index.js", "--port", "$Port") -WorkingDirectory $ProjectRoot | Out-Null
        if (-not (Wait-Port -Port $Port -Seconds 30)) {
            throw "Tandem Suite did not open port $Port. Check $LogFile."
        }
        if (-not (Wait-TandemSuite -Port $Port -Seconds 45)) {
            throw "Port $Port opened, but it is not responding as Sentinel Tandem Suite. Check $LogFile."
        }
        if (-not (Test-TandemUi -Port $Port)) {
            throw "Tandem API is ready, but the dashboard UI did not respond as expected."
        }
        Write-Status "Tandem Suite is ready" "OK"
    }

    $url = "http://127.0.0.1:$Port"
    if (-not $NoBrowser) {
        $BrowserProcess = Start-BrowserWindow -Url $url
    }
    Start-LauncherShutdownWatchdog

    Write-Host ""
    Write-Host "Ready: $url" -ForegroundColor Green
    Write-Host "Close this window or press Ctrl+C to stop Tandem Suite." -ForegroundColor Gray
    Write-Host ""

    while ($true) {
        foreach ($process in @($OwnedProcesses)) {
            if ($process.HasExited) {
                throw "Process $($process.Id) exited unexpectedly."
            }
        }
        if (Test-BrowserWindowClosed) {
            Write-Status "Browser window closed; shutting down Sentinel Tandem Suite" "OK"
            break
        }
        Start-Sleep -Seconds 1
    }
} catch {
    Write-Status $_.Exception.Message "ERROR"
    exit 1
} finally {
    Invoke-LauncherCleanup
}
