param([switch]$Run)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
foreach ($tool in @('bun','cargo')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install $tool before building the Sentinel preview." }
}
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'Beatsmaxxer/sentinel-build' }
$env:TAURI_ENV_PLATFORM = '1'
Push-Location $repoPath
try {
    bun install
    if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed.' }
    bun install --cwd desktop
    if ($LASTEXITCODE -ne 0) { throw 'Desktop dependency install failed.' }
    bun run build:desktop-frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    Push-Location (Join-Path $repoPath 'desktop')
    try {
        bunx tauri build --debug --no-bundle --config sentinel.preview.json
        if ($LASTEXITCODE -ne 0) { throw 'Native preview build failed.' }
    } finally { Pop-Location }
    $appPath = Join-Path $env:CARGO_TARGET_DIR 'debug/beatsmaxxer-pro-desktop.exe'
    if (-not (Test-Path -LiteralPath $appPath)) { throw "Built app missing: $appPath" }
    Write-Output "Sentinel preview app: $appPath"
    if ($Run) { Start-Process -FilePath $appPath -WorkingDirectory $repoPath }
} finally { Pop-Location }
