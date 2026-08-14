# Build the CrazyGames upload (Windows / PowerShell).
#
# The same job as tools/make_cg_build.sh, for people without Git Bash
# or WSL. Run it from PowerShell:
#
#   cd C:\path\to\echoes-of-legend
#   .\tools\make_cg_build.ps1
#
# If PowerShell refuses to run it ("running scripts is disabled"),
# either unblock this one file:
#
#   powershell -ExecutionPolicy Bypass -File .\tools\make_cg_build.ps1
#
# Output (default): ..\echoes-of-legend-cg\  - a sibling of the repo.
# Upload the CONTENTS of that folder; index.html must be at the top.
#
#   .\tools\make_cg_build.ps1              -> ..\echoes-of-legend-cg\
#   .\tools\make_cg_build.ps1 -Zip         -> ..\echoes-of-legend-cg.zip
#   .\tools\make_cg_build.ps1 C:\somewhere -> C:\somewhere\echoes-of-legend-cg\
#
# WHAT SHIPS: index.html, assets, css, data, js - nothing else.
# Everything omitted is omitted on purpose; see the .sh script's header
# for the full reasoning. The one that matters most: docs\ holds a real
# service_role key, and must never reach a public build.

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$OutDir,
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'

function Fail($msg) {
  Write-Host "error: $msg" -ForegroundColor Red
  exit 1
}

# --- locate the repo (this script lives in <repo>\tools) --------------
$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo 'index.html'))) {
  Fail "index.html not found in $repo - run this from inside the repo."
}

if (-not $OutDir) { $OutDir = Split-Path -Parent $repo }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$name   = 'echoes-of-legend-cg'
$dest   = Join-Path $OutDir $name
$zipOut = Join-Path $OutDir "$name.zip"
$marker = '.eol-cg-build'

Write-Host "repo  : $repo"
Write-Host ("mode  : " + $(if ($Zip) { 'zip' } else { 'folder' }))

# --- clobber guard ----------------------------------------------------
# Only ever delete a directory THIS script created. Anything else may be
# the user's own folder, and losing it would be our fault.
if (Test-Path $dest) {
  if (-not (Test-Path (Join-Path $dest $marker))) {
    Fail "$dest exists and was not created by this script - refusing to overwrite it."
  }
  Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $dest $marker) -Force | Out-Null

# --- copy the shipping set -------------------------------------------
foreach ($item in @('index.html', 'assets', 'css', 'data', 'js')) {
  $src = Join-Path $repo $item
  if (-not (Test-Path $src)) { Fail "missing from the repo: $item" }
  Copy-Item -Recurse -Force $src (Join-Path $dest $item)
}

# --- prune what must not ship ----------------------------------------
$rivals = Join-Path $dest 'assets\rivals-src'
if (Test-Path $rivals) { Remove-Item -Recurse -Force $rivals }

Get-ChildItem -Path $dest -Recurse -Force -File |
  Where-Object {
    $_.Name -eq '.DS_Store' -or
    $_.Extension -eq '.map' -or
    ($_.Extension -eq '.md' -and $_.FullName -like "*\assets\*")
  } | Remove-Item -Force

Get-ChildItem -Path $dest -Recurse -Force -Directory |
  Where-Object { $_.Name -eq '__MACOSX' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# --- self-check: no secrets, no leaked docs --------------------------
# A service_role key in a public build hands anyone full database
# access, bypassing every row-level security policy. Never ship one.
$leak = Get-ChildItem -Path $dest -Recurse -Force -File |
  Where-Object { $_.Extension -in @('.sql', '.md') }
if ($leak) {
  Write-Host "error: .sql/.md files reached the build:" -ForegroundColor Red
  $leak | ForEach-Object { Write-Host "  $($_.FullName)" }
  Fail 'aborting.'
}

$secretHits = Get-ChildItem -Path $dest -Recurse -Force -File |
  Where-Object { $_.Extension -in @('.js', '.html', '.css', '.json') } |
  Select-String -Pattern 'sb_secret_[A-Za-z0-9_-]{8,}' -List
if ($secretHits) {
  Write-Host 'error: a Supabase SECRET key is present in the build:' -ForegroundColor Red
  $secretHits | ForEach-Object { Write-Host "  $($_.Path)" }
  Fail 'aborting - rotate that key and use the publishable key instead.'
}

# --- self-check: every local reference resolves ----------------------
$html = Get-Content (Join-Path $dest 'index.html') -Raw
$refs = [regex]::Matches($html, '(?:src|href)\s*=\s*"([^"]+)"') |
  ForEach-Object { $_.Groups[1].Value }
$refs += [regex]::Matches($html, "document\.write\('<script src=\""([^\""]+)\""") |
  ForEach-Object { $_.Groups[1].Value }

$missing = @()
foreach ($r in $refs) {
  if ($r -match '^(https?:)?//' -or $r.StartsWith('data:') -or $r.StartsWith('#')) { continue }
  $clean = ($r -split '[?#]')[0]
  if (-not $clean) { continue }
  if (-not (Test-Path (Join-Path $dest $clean))) { $missing += $clean }
}
if ($missing.Count -gt 0) {
  Write-Host 'error: index.html references files that are not in the build:' -ForegroundColor Red
  $missing | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }
  Fail 'aborting.'
}
Write-Host '  all local references resolve'

# --- finish -----------------------------------------------------------
if ($Zip) {
  if (Test-Path $zipOut) { Remove-Item -Force $zipOut }
  Remove-Item -Force (Join-Path $dest $marker)
  Compress-Archive -Path (Join-Path $dest '*') -DestinationPath $zipOut
  Remove-Item -Recurse -Force $dest
  $mb = [math]::Round((Get-Item $zipOut).Length / 1MB, 1)
  Write-Host ''
  Write-Host "wrote : $zipOut  (${mb}M)"
  Write-Host 'upload this zip; index.html is at the top level inside it.'
}
else {
  $bytes = (Get-ChildItem -Path $dest -Recurse -Force -File |
    Measure-Object -Property Length -Sum).Sum
  $mb = [math]::Round($bytes / 1MB, 1)
  Write-Host ''
  Write-Host "wrote : $dest  (${mb}M)"
  Write-Host 'upload the CONTENTS of this folder (index.html must be at the top).'
  Write-Host ''
  Write-Host 'top level:'
  Get-ChildItem $dest | Where-Object { $_.Name -ne $marker } |
    ForEach-Object { Write-Host "  $($_.Name)" }
}

Write-Host ''
Write-Host 'Reminder: the cg-auth Edge Function is NOT in this build and does'
Write-Host 'not need redeploying. It lives on Supabase; the game calls it over'
Write-Host 'https. Deploy it once, from the git repo - never from here.'
