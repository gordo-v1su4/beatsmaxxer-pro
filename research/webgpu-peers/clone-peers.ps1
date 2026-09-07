# Shallow-clone WebGPU peer repos into research/webgpu-peers/repos/
param(
    [switch]$Refresh
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReposDir = Join-Path $Root "repos"

$Peers = @(
    @{ Name = "beatform"; Url = "https://github.com/0langa/beatform.git" },
    @{ Name = "ghost-arcade"; Url = "https://github.com/riskcapital/ghost-arcade.git" },
    @{ Name = "freecut"; Url = "https://github.com/walterlow/freecut.git" },
    @{ Name = "webgpu-video-rendering"; Url = "https://github.com/apssouza22/webgpu-video-rendering.git" },
    @{ Name = "webgpu-samples"; Url = "https://github.com/webgpu/webgpu-samples.git" },
    @{ Name = "spektral"; Url = "https://github.com/kaltwrk/spektral.git" },
    @{ Name = "webgpu-video-shaders"; Url = "https://github.com/kbrandwijk/webgpu-video-shaders.git" }
)

New-Item -ItemType Directory -Force -Path $ReposDir | Out-Null

foreach ($peer in $Peers) {
    $dest = Join-Path $ReposDir $peer.Name
    if (Test-Path $dest) {
        if ($Refresh) {
            Write-Host "Refreshing $($peer.Name) ..."
            Push-Location $dest
            git fetch --depth 1 origin
            git checkout -B main origin/HEAD 2>$null
            if ($LASTEXITCODE -ne 0) { git checkout -B master origin/HEAD 2>$null }
            git reset --hard origin/HEAD
            Pop-Location
        } else {
            Write-Host "Skip $($peer.Name) (exists). Use -Refresh to update."
        }
        continue
    }
    Write-Host "Cloning $($peer.Name) ..."
    git clone --depth 1 $peer.Url $dest
}

Write-Host "Done. Clones live in $ReposDir (gitignored)."
