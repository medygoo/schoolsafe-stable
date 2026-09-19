param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4175
)

$client = [System.Net.Sockets.TcpClient]::new()
try {
    if ($client.ConnectAsync("127.0.0.1", $Port).Wait(750)) {
        Write-Output "ACTIVE http://127.0.0.1:$Port/"
        exit 0
    }
}
finally {
    $client.Dispose()
}

Write-Output "INACTIVE http://127.0.0.1:$Port/"
exit 1
