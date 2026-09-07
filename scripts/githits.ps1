# Run GitHits CLI with GITHITS_API_TOKEN from BWS (never print the token).
#
# Usage (from repo root or anywhere):
#   .\scripts\githits.ps1 example "WebGPU importExternalTexture" -l typescript
#   .\scripts\githits.ps1 search "importExternalTexture" "--in" "github:webgpu/webgpu-samples"
#
# Requires: bun add -g githits@latest
#           BWS bootstrap BWS_ACCESS_TOKEN + secret GITHITS_API_TOKEN in hermes_keys
#
# Quote "--in" so PowerShell does not treat -in as a cmdlet parameter.

$ErrorActionPreference = "Stop"

$AgentSecrets = "C:\Users\Gordo\Documents\Github\proxmox-home\shared\bin\agent-secrets.mjs"
$Githits = "githits"

if (-not (Test-Path -LiteralPath $AgentSecrets)) {
    throw @"
agent-secrets not found: $AgentSecrets

Install proxmox-home or set AgentSecrets to your clone path.
"@
}

if (-not (Get-Command $Githits -ErrorAction SilentlyContinue)) {
    $Githits = Join-Path $env:USERPROFILE ".bun\bin\githits.exe"
    if (-not (Test-Path -LiteralPath $Githits)) {
        throw "githits not found. Install: bun add -g githits@latest"
    }
}

$cmdArgs = @($args)
if ($cmdArgs.Count -eq 0) {
    $cmdArgs = @("auth", "status")
}

& node $AgentSecrets run --secret=GITHITS_API_TOKEN -- $Githits @cmdArgs
exit $LASTEXITCODE
