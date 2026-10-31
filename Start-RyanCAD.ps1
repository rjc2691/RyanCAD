param([string]$Project = "runtime/projects/default.rycad", [int]$Port = 8790, [switch]$Background, [switch]$NoBrowser, [switch]$Lan)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $taskPython)) {
    throw "Run Python 3.12 or 3.13 with scripts/bootstrap.py once before starting RyanCAD."
}
$taskArguments = @('-m', 'ryancad', '--project', $Project, '--port', "$Port")
if ($NoBrowser) { $taskArguments += '--no-browser' }
if ($Lan) { $taskArguments += '--lan' }
if ($Background) {
    if ($Port -lt 1024 -or $Port -gt 65535) { throw "Choose a port from 1024 to 65535." }
    $probeAddress = if ($Lan) { [System.Net.IPAddress]::Any } else { [System.Net.IPAddress]::Loopback }
    $portProbe = [System.Net.Sockets.TcpListener]::new($probeAddress, $Port)
    $portProbe.ExclusiveAddressUse = $true
    try {
        $portProbe.Start()
    } catch {
        throw "Port $Port is already in use. RyanCAD may already be running; check its notification-area icon or use another port."
    } finally {
        $portProbe.Stop()
    }
    if ($Project -match '["\r\n]') { throw "The project path contains invalid characters." }
    # Start-Process joins arguments into a Windows command line. Preserve spaces
    # and trailing backslashes in a valid project path when quoting it.
    $quotedProject = '"' + [regex]::Replace($Project, '(\\+)$', '$1$1') + '"'
    $taskArguments[3] = $quotedProject
    Start-Process -FilePath $taskPython -ArgumentList $taskArguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    Write-Host "RyanCAD is starting in the background on port $Port. Use its notification-area icon to open or quit it."
} else {
    & $taskPython @taskArguments
}
