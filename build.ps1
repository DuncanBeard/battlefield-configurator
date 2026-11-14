<# Build PROFSAVE_profile for a device #>
param(
    [string]$Device
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
    $bunArgs = @("run", "cli/build.ts")
    if ($Device) { $bunArgs += $Device }
    & bun @bunArgs
} finally {
    Pop-Location
}
