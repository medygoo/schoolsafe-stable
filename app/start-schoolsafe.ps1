param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4175
)

$ErrorActionPreference = "Stop"
$appRoot = $PSScriptRoot
$runtimeRoot = Join-Path ([System.IO.Path]::GetTempPath()) "SchoolSafeV2"
$serverPath = Join-Path $appRoot "server.mjs"
$pidPath = Join-Path $runtimeRoot ("server-{0}.pid" -f $Port)
$url = "http://127.0.0.1:$Port/"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (Test-Path -LiteralPath $pidPath) {
    $storedPid = 0
    [void][int]::TryParse((Get-Content -Raw -LiteralPath $pidPath).Trim(), [ref]$storedPid)
    $storedProcess = Get-Process -Id $storedPid -ErrorAction SilentlyContinue
    if ($storedProcess) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            if ($client.ConnectAsync("127.0.0.1", $Port).Wait(500)) {
                Write-Output "ALREADY ACTIVE PID $storedPid"
                Write-Output $url
                exit 0
            }
        }
        finally {
            $client.Dispose()
        }
    }
}

$portClient = [System.Net.Sockets.TcpClient]::new()
try {
    if ($portClient.ConnectAsync("127.0.0.1", $Port).Wait(500)) {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        $owner = if ($listener) { $listener.OwningProcess } else { "unknown" }
        throw "Port $Port is already in use by PID $owner. No process was stopped."
    }
}
finally {
    $portClient.Dispose()
}

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path -LiteralPath $bundledNode) {
    $nodePath = $bundledNode
}
else {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw "Node.js is unavailable. Install Node.js or restore the Codex bundled runtime."
    }
    $nodePath = $nodeCommand.Source
}

$stdoutPath = Join-Path $runtimeRoot ("server-{0}.out.log" -f $Port)
$stderrPath = Join-Path $runtimeRoot ("server-{0}.err.log" -f $Port)
$env:PORT = [string]$Port
$serverArgument = '"{0}"' -f $serverPath
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList $serverArgument -WorkingDirectory $appRoot `
    -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

Set-Content -LiteralPath $pidPath -Value $serverProcess.Id -Encoding ascii

$ready = $false
for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
    if ($serverProcess.HasExited) {
        $details = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { "" }
        throw "SchoolSafe V2 stopped during startup. $details"
    }

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        if ($client.ConnectAsync("127.0.0.1", $Port).Wait(100)) {
            $ready = $true
            break
        }
    }
    finally {
        $client.Dispose()
    }
    Start-Sleep -Milliseconds 100
}

if (-not $ready) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    throw "SchoolSafe V2 did not start on port $Port within 10 seconds."
}

Write-Output "STARTED PID $($serverProcess.Id)"
Write-Output $url
