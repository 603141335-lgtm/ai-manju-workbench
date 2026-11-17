#Requires -Version 5.1
# Explicit opt-in: installing Python changes this Windows user's applications.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'find-python312.ps1')
Write-Host 'DuduAI V1.3 | Python 3.12 build prerequisite installer' -ForegroundColor Cyan
Write-Host 'Installs ONLY Python 3.12 using the official WinGet package. Does NOT touch workbench files, accounts, license keys, Worker, D1 or payment settings.'
$existing=Find-DuduPython312
if ($existing) {
  Write-Host ('[OK] Python 3.12 already available: '+$existing.Executable) -ForegroundColor Green
  exit 0
}
$winget=Get-Command 'winget.exe' -ErrorAction SilentlyContinue
if (-not $winget) {
  Write-Host '[NO] winget is missing. Download Python 3.12 from https://www.python.org/downloads/windows/ instead.' -ForegroundColor Yellow
  exit 2
}
$reply=Read-Host 'Type YES to install Python 3.12 for the current Windows user (anything else cancels)'
if ($reply -cne 'YES') {Write-Host 'Canceled. No changes made.';exit 2}
Write-Host '[INSTALL] Python.Python.3.12 via Windows Package Manager ...'
& $winget.Source install --id Python.Python.3.12 --exact --source winget --scope user --accept-package-agreements --accept-source-agreements
$rc=$LASTEXITCODE
if($rc -ne 0) {
  Write-Host ('[ERROR] WinGet returned '+$rc+'. Try the official Python installer at https://www.python.org/downloads/windows/') -ForegroundColor Red
  exit 1
}
$found=Find-DuduPython312
if(-not $found) {
  Write-Warning 'WinGet reported success but Python 3.12 was not found in this terminal. Close all terminal windows, reopen CHECK_Build_Tools.cmd, or run py -3.12 --version.'
  exit 3
}
Write-Host ('[OK] Python 3.12 ready: '+$found.Executable) -ForegroundColor Green
Write-Host 'Next: run CHECK_Build_Tools.cmd, then BUILD_Windows_EXE.cmd.'
exit 0
