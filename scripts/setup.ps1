$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host 'Checking ClipForge Cutter prerequisites...'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget is required to install missing Windows tools.'
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements --silent
    Write-Host 'FFmpeg installed. Restart this terminal if ffmpeg is not immediately available.'
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements --silent
}

Push-Location $ProjectRoot
try {
    if (-not (Test-Path '.venv\Scripts\python.exe')) {
        py -3.12 -m venv .venv
    }
    & '.\.venv\Scripts\python.exe' -m pip install --upgrade pip
    & '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
    Push-Location 'frontend'
    try { npm install } finally { Pop-Location }
    & '.\.venv\Scripts\python.exe' -m pytest backend\tests -q
    Write-Host 'ClipForge Cutter setup completed successfully.'
} finally {
    Pop-Location
}
