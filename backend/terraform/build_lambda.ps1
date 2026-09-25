$ErrorActionPreference = "Stop"

$backendDir = "$PSScriptRoot\.."
$terraformDir = $PSScriptRoot
$zipPath = "$terraformDir\lambda_payload.zip"

Write-Host "Building Lambda deployment package..."

# Remove any existing zip
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Collect items to include
$includes = @(
    "src",
    "package.json",
    "pnpm-lock.yaml"
)

# Create a temp staging directory
$stagingDir = New-Item -ItemType Directory -Path "$env:TEMP\lambda-stage-$(Get-Random)" -Force
Write-Host "Staging directory: $stagingDir"

try {
    # Copy include items to staging
    foreach ($item in $includes) {
        $source = Join-Path $backendDir $item
        if (Test-Path $source) {
            $dest = Join-Path $stagingDir $item
            if ((Get-Item $source).PSIsContainer) {
                Copy-Item -Path $source -Destination $dest -Recurse -Force
            } else {
                Copy-Item -Path $source -Destination $dest -Force
            }
            Write-Host "  Copied: $item"
        }
    }

    # Install only production dependencies into staging
    Write-Host "Installing production dependencies in staging..."
    Push-Location $stagingDir
    try {
        & pnpm install --prod --store-dir "c:\Users\shita\OneDrive\Desktop\awsproject\backend\.pnpm-store\v11" 2>&1
    } finally {
        Pop-Location
    }

    # Create the zip from the staging directory
    Write-Host "Creating zip archive: $zipPath"
    Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

    Write-Host "Lambda package created: $zipPath"
    $size = (Get-Item $zipPath).Length
    Write-Host "Package size: $([math]::Round($size / 1MB, 2)) MB"
} finally {
    # Clean up staging directory
    Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Staging directory cleaned up."
}
