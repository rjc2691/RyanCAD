param([string]$Project = "runtime/projects/default.rycad", [int]$Port = 8790)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $taskPython)) {
    throw "Run Python 3.12 or 3.13 with scripts/bootstrap.py once before starting RyanCAD."
}
& $taskPython -m ryancad --project $Project --port $Port --demo mold
