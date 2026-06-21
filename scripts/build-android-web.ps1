$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot "www"

if (Test-Path -LiteralPath $outputRoot) {
  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $outputRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputRoot "guide-assets") | Out-Null

$appFiles = @(
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "icon.svg",
  "openplay-ph-logo.png",
  "King-of-Open-Play-User-Guide.docx"
)

foreach ($file in $appFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $outputRoot
}

Get-ChildItem -LiteralPath (Join-Path $projectRoot "guide-assets") -File |
  Copy-Item -Destination (Join-Path $outputRoot "guide-assets") -Force

$indexPath = Join-Path $outputRoot "index.html"
$index = Get-Content -LiteralPath $indexPath -Raw
$index = $index -replace '<link rel="manifest" href="\./manifest\.webmanifest"\s*/?>', ""
$index = $index -replace '(?s)\s*<a\s+id="android-download-button".*?</a>', ""
$index = $index -replace '<script src="\./app\.js"></script>', '<script src="./app.js"></script>'
Set-Content -LiteralPath $indexPath -Value $index -Encoding utf8

Write-Host "Android web assets prepared in $outputRoot"
