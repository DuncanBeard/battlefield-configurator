<# Import PROFSAVE_profile changes into source TOML files #>
param(
    [string]$Device,
    [switch]$DryRun
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
    $bunArgs = @("run", "cli/import.ts")
    if ($Device) { $bunArgs += $Device }
    if ($DryRun) { $bunArgs += "--dry-run" }
    & bun @bunArgs
} finally {
    Pop-Location
}
