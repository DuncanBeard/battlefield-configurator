<# Build PROFSAVE_profile and deploy to the game settings directory #>
param(
    [string]$Device,
    [string]$GameDir
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
    if ($GameDir) { $env:GAME_DIR = $GameDir }
    $bunArgs = @("run", "cli/deploy.ts")
    if ($Device) { $bunArgs += $Device }
    & bun @bunArgs
} finally {
    if ($GameDir) { Remove-Item Env:GAME_DIR -ErrorAction SilentlyContinue }
    Pop-Location
}
