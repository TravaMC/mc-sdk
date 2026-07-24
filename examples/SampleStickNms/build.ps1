$ErrorActionPreference = "Stop"
# paperweight + Gradle workers break on Cyrillic user paths — build via ASCII mirror
$src = $PSScriptRoot
$dest = "C:\tmp\SampleStickNms"
$ghome = "C:\tmp\gradle-home"

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
New-Item -ItemType Directory -Path $ghome -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $src "*") $dest

$env:GRADLE_USER_HOME = $ghome
Set-Location -LiteralPath $dest
& ".\gradlew.bat" --stop 2>$null
& ".\gradlew.bat" build --no-daemon
$code = $LASTEXITCODE

$out = Join-Path $src "build\libs"
New-Item -ItemType Directory -Path $out -Force | Out-Null
if (Test-Path (Join-Path $dest "build\libs")) {
  Copy-Item -Force (Join-Path $dest "build\libs\*") $out
  Get-ChildItem $out | Format-Table Name, Length
}

Write-Host "EXIT=$code"
exit $code
