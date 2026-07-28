#Requires -Version 5.1
<#
.SYNOPSIS
  CopyGo Chrome extension pack: validate -> zip -> verify

.USAGE
  .\build.ps1
  .\build.ps1 -OutDir "release"
#>
param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = $PSScriptRoot
$ManifestPath = Join-Path $Root "manifest.json"

function Write-Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) {
  Write-Host "  [FAIL] $msg" -ForegroundColor Red
  exit 1
}

function Get-Prop($obj, [string]$name) {
  if ($null -eq $obj) { return $null }
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

function Add-Rel([System.Collections.Generic.HashSet[string]]$set, [string]$rel) {
  if ([string]::IsNullOrWhiteSpace($rel)) { return }
  $norm = ($rel -replace "/", "\").TrimStart("\")
  [void]$set.Add($norm)
}

# 1. Read manifest
Write-Step "Read manifest.json"
if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Write-Fail "manifest.json not found: $ManifestPath"
}

try {
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Write-Fail "manifest.json parse error: $($_.Exception.Message)"
}

$name = [string](Get-Prop $manifest "name")
$version = [string](Get-Prop $manifest "version")
$mv = Get-Prop $manifest "manifest_version"
if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($version)) {
  Write-Fail "manifest missing name or version"
}
Write-Ok "name=$name  version=$version  MV=$mv"

# 2. Collect files from manifest
Write-Step "Collect extension assets from manifest"

$required = New-Object "System.Collections.Generic.HashSet[string]" ([StringComparer]::OrdinalIgnoreCase)
Add-Rel $required "manifest.json"

$background = Get-Prop $manifest "background"
if ($null -ne $background) {
  Add-Rel $required ([string](Get-Prop $background "service_worker"))
}

$action = Get-Prop $manifest "action"
if ($null -ne $action) {
  Add-Rel $required ([string](Get-Prop $action "default_popup"))
  $defaultIcon = Get-Prop $action "default_icon"
  if ($null -ne $defaultIcon) {
    foreach ($p in $defaultIcon.PSObject.Properties) {
      Add-Rel $required ([string]$p.Value)
    }
  }
}

$icons = Get-Prop $manifest "icons"
if ($null -ne $icons) {
  foreach ($p in $icons.PSObject.Properties) {
    Add-Rel $required ([string]$p.Value)
  }
}

$contentScripts = Get-Prop $manifest "content_scripts"
if ($null -ne $contentScripts) {
  foreach ($cs in @($contentScripts)) {
    $jsList = Get-Prop $cs "js"
    if ($null -ne $jsList) {
      foreach ($f in @($jsList)) { Add-Rel $required ([string]$f) }
    }
    $cssList = Get-Prop $cs "css"
    if ($null -ne $cssList) {
      foreach ($f in @($cssList)) { Add-Rel $required ([string]$f) }
    }
  }
}

$warList = Get-Prop $manifest "web_accessible_resources"
if ($null -ne $warList) {
  foreach ($war in @($warList)) {
    $res = Get-Prop $war "resources"
    if ($null -ne $res) {
      foreach ($f in @($res)) { Add-Rel $required ([string]$f) }
    }
  }
}

# Local css/js referenced by popup.html
$popupHtmlRel = $null
if ($null -ne $action) {
  $popupHtmlRel = Get-Prop $action "default_popup"
  if ($null -ne $popupHtmlRel) {
    $popupHtmlRel = ([string]$popupHtmlRel -replace "/", "\")
  }
}

if (-not [string]::IsNullOrWhiteSpace($popupHtmlRel)) {
  $popupFull = Join-Path $Root $popupHtmlRel
  if (Test-Path -LiteralPath $popupFull) {
    $html = Get-Content -LiteralPath $popupFull -Raw -Encoding UTF8
    $dq = [char]34
    $sq = [char]39
    $pattern = '(?i)(?:href|src)=[' + $dq + $sq + ']([^' + $dq + $sq + ']+)[' + $dq + $sq + ']'
    $linkMatches = [regex]::Matches($html, $pattern)
    foreach ($m in $linkMatches) {
      $ref = $m.Groups[1].Value
      if ($ref -match '^(https?:|data:|chrome-extension:|//)') { continue }
      if ($ref.StartsWith("#")) { continue }
      $baseDir = Split-Path $popupHtmlRel -Parent
      if ([string]::IsNullOrEmpty($baseDir)) {
        Add-Rel $required $ref
      } else {
        Add-Rel $required (Join-Path $baseDir $ref)
      }
    }
  }
}

$files = @($required | Sort-Object)
Write-Ok ("asset count: {0}" -f $files.Count)
foreach ($f in $files) { Write-Host "    - $f" }

# 3. Source existence
Write-Step "Validate source files exist"
$missing = New-Object System.Collections.Generic.List[string]
foreach ($rel in $files) {
  $full = Join-Path $Root $rel
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    [void]$missing.Add($rel)
    Write-Host "  [MISS] $rel" -ForegroundColor Yellow
  } else {
    $item = Get-Item -LiteralPath $full
    if ($item.Length -eq 0) {
      Write-Fail "empty file: $rel"
    }
  }
}
if ($missing.Count -gt 0) {
  Write-Fail ("missing {0} file(s): {1}" -f $missing.Count, ($missing -join ", "))
}
Write-Ok "all source files exist and non-empty"

# 4. Basic content checks
Write-Step "Basic content checks"

if ([int]$mv -ne 3) {
  Write-Fail "only Manifest V3 supported, got: $mv"
}

$bgPath = Join-Path $Root "background.js"
if (Test-Path -LiteralPath $bgPath) {
  $bgText = Get-Content -LiteralPath $bgPath -Raw -Encoding UTF8
  if ($bgText -notmatch "chrome\.") {
    Write-Host "  [WARN] background.js has no chrome API usage" -ForegroundColor Yellow
  }
}

$contentJs = Join-Path $Root "content.js"
if (Test-Path -LiteralPath $contentJs) {
  $cjs = Get-Content -LiteralPath $contentJs -Raw -Encoding UTF8
  if ($cjs -notmatch "copyGoInjected|showToolbar|toggleInspector") {
    Write-Host "  [WARN] content.js missing expected symbols" -ForegroundColor Yellow
  }
}

$denyNames = @(".git", "node_modules", ".DS_Store", "Thumbs.db")
foreach ($rel in $files) {
  foreach ($d in $denyNames) {
    if ($rel -like "*\$d\*" -or $rel -eq $d -or $rel -like "$d\*") {
      Write-Fail "forbidden path in package list: $rel"
    }
  }
}
Write-Ok "manifest / script checks passed"

# 5. Zip
Write-Step "Create zip package"

$outFull = Join-Path $Root $OutDir
if (-not (Test-Path -LiteralPath $outFull)) {
  New-Item -ItemType Directory -Path $outFull | Out-Null
}

$safeName = "CopyGo"

$zipName = "{0}-v{1}.zip" -f $safeName, $version
$zipPath = Join-Path $outFull $zipName

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$staging = Join-Path $env:TEMP ("CopyGo-build-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path $staging | Out-Null

  foreach ($rel in $files) {
    $src = Join-Path $Root $rel
    $dst = Join-Path $staging $rel
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path -LiteralPath $dstDir)) {
      New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }

  Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force
} finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $zipPath)) {
  Write-Fail "zip not created: $zipPath"
}
$zipInfo = Get-Item -LiteralPath $zipPath
$sizeKb = [math]::Round($zipInfo.Length / 1KB, 1)
Write-Ok ("created {0}  ({1} KB)" -f $zipName, $sizeKb)

# 6. Verify zip
Write-Step "Verify zip contents"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entryNames = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $zip.Entries) {
    $n = ($entry.FullName -replace "/", "\").TrimEnd("\")
    if ([string]::IsNullOrEmpty($n)) { continue }
    if ($entry.FullName.EndsWith("/") -or $entry.FullName.EndsWith("\")) { continue }
    [void]$entryNames.Add($n)
  }

  $entrySet = New-Object "System.Collections.Generic.HashSet[string]" ([StringComparer]::OrdinalIgnoreCase)
  foreach ($e in $entryNames) { [void]$entrySet.Add($e) }

  $zipMissing = New-Object System.Collections.Generic.List[string]
  foreach ($rel in $files) {
    if (-not $entrySet.Contains($rel)) {
      [void]$zipMissing.Add($rel)
    }
  }
  if ($zipMissing.Count -gt 0) {
    Write-Fail ("zip missing files: {0}" -f ($zipMissing -join ", "))
  }

  $fileSet = New-Object "System.Collections.Generic.HashSet[string]" ([StringComparer]::OrdinalIgnoreCase)
  foreach ($rel in $files) { [void]$fileSet.Add($rel) }

  $extra = New-Object System.Collections.Generic.List[string]
  foreach ($e in $entryNames) {
    if (-not $fileSet.Contains($e)) { [void]$extra.Add($e) }
  }
  if ($extra.Count -gt 0) {
    Write-Host ("  [WARN] zip has undeclared files: {0}" -f ($extra -join ", ")) -ForegroundColor Yellow
  }

  foreach ($entry in $zip.Entries) {
    if ($entry.FullName.EndsWith("/") -or $entry.FullName.EndsWith("\")) { continue }
    if ($entry.Length -eq 0) {
      Write-Fail ("empty file in zip: {0}" -f $entry.FullName)
    }
  }

  $hasManifestRoot = $false
  foreach ($entry in $zip.Entries) {
    $n = $entry.FullName -replace "\\", "/"
    if ($n -eq "manifest.json") { $hasManifestRoot = $true; break }
  }
  if (-not $hasManifestRoot) {
    Write-Fail "zip root missing manifest.json (Chrome Web Store requires this)"
  }

  Write-Ok ("zip has {0} files, matches asset list" -f $entryNames.Count)
} finally {
  $zip.Dispose()
}

# 7. Summary + checksum
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD OK" -ForegroundColor Green
Write-Host "  Name:    $name" -ForegroundColor Green
Write-Host "  Version: $version" -ForegroundColor Green
Write-Host "  Output:  $zipPath" -ForegroundColor Green
Write-Host "  Size:    $sizeKb KB" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Upload this zip to Chrome/Edge Web Store." -ForegroundColor DarkGray
Write-Host "Local test: chrome://extensions -> Load unpacked." -ForegroundColor DarkGray

$reportPath = Join-Path $outFull ("{0}-v{1}-checksum.txt" -f $safeName, $version)
$lines = New-Object System.Collections.Generic.List[string]
[void]$lines.Add("CopyGo package report")
[void]$lines.Add("Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$lines.Add("Name: $name")
[void]$lines.Add("Version: $version")
[void]$lines.Add("Zip: $zipName")
[void]$lines.Add("Size: $($zipInfo.Length) bytes")
[void]$lines.Add("")
[void]$lines.Add("Files:")
foreach ($rel in $files) {
  $full = Join-Path $Root $rel
  $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
  $len = (Get-Item -LiteralPath $full).Length
  [void]$lines.Add(("  {0}  {1}  {2}" -f $rel, $len, $hash))
}
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
[void]$lines.Add("")
[void]$lines.Add("Zip SHA256: $zipHash")
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($reportPath, $lines.ToArray(), $utf8Bom)
Write-Ok "checksum report: $reportPath"