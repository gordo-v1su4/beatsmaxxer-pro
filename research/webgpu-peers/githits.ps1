# Delegates to repo-root scripts/githits.ps1
$RootWrapper = (Join-Path $PSScriptRoot "..\..\scripts\githits.ps1" | Resolve-Path).Path
& $RootWrapper @args
exit $LASTEXITCODE
