$ErrorActionPreference = "Stop"
$ver = "8.12.1"
$zip = Join-Path $env:TEMP "gradle-$ver-bin.zip"
$dest = Join-Path $env:TEMP "gradle-$ver"
# Use this script's directory to avoid Cyrillic path encoding bugs
$project = $PSScriptRoot

if (-not (Test-Path (Join-Path $dest "bin\gradle.bat"))) {
  Write-Host "Downloading Gradle $ver..."
  Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$ver-bin.zip" -OutFile $zip
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Expand-Archive $zip -DestinationPath $env:TEMP -Force
}

$gradle = Join-Path $dest "bin\gradle.bat"
Set-Location -LiteralPath $project
Write-Host "Creating wrapper in $project ..."
& $gradle wrapper --gradle-version $ver
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Building..."
& ".\gradlew.bat" build
Write-Host "EXIT=$LASTEXITCODE"
exit $LASTEXITCODE
