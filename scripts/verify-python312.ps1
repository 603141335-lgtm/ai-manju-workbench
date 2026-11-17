#Requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'find-python312.ps1')
Write-Host 'DuduAI V1.3 - Python 3.12 detector v2' -ForegroundColor Cyan
$found=Find-DuduPython312
if ($null -eq $found) {
    Write-Host '[NO] Python 3.12 is not visible to the build environment.' -ForegroundColor Yellow
    Write-Host 'Try in a new CMD: py -3.12 --version'
    exit 1
}
Write-Host ('[OK] '+$found.Version) -ForegroundColor Green
Write-Host ('[EXE] '+$found.Executable)
Write-Host ('[ARGS] '+($found.Arguments -join ' '))
Write-Host 'Next: CHECK_Build_Tools.cmd and BUILD_Windows_EXE.cmd'
exit 0
