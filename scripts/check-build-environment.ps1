#Requires -Version 5.1
$ErrorActionPreference='Continue'
$all=$true
Write-Host 'DuduAI Workbench V1.3 Windows build prerequisites' -ForegroundColor Cyan
Write-Host '(This check DOES NOT change the original source, credentials or cloud resources.)'
function Check([string]$name,[bool]$isOK,[string]$info) {
  if ($isOK) { Write-Host ('[OK]  '+$name+' - '+$info) -ForegroundColor Green }
  else { Write-Host ('[NO]  '+$name+' - '+$info) -ForegroundColor Yellow; $script:all=$false }
}
Check 'Windows x64' ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and [Environment]::Is64BitOperatingSystem) 'Windows 10/11 x64 build machine required'
$node=Get-Command node.exe -ErrorAction SilentlyContinue
$nodeMajor=0
if($node){try{$nodeMajor=[int]((& $node.Source --version).Trim().TrimStart('v').Split('.')[0])}catch{}}
Check 'Node.js' ($nodeMajor -ge 22) ('Node.js 22+ required; actual major '+$nodeMajor)
Check 'npm' ([bool](Get-Command npm.cmd -ErrorAction SilentlyContinue)) 'installed with Node.js'
$cargo=Get-Command cargo.exe -ErrorAction SilentlyContinue
$rustc=Get-Command rustc.exe -ErrorAction SilentlyContinue
$hostInfo='missing'
if($rustc){try{$hostInfo=[string]((& $rustc.Source -vV | Select-String '^host:').ToString())}catch{}}
Check 'Rust MSVC' ([bool]$cargo -and $hostInfo.Contains('x86_64-pc-windows-msvc')) ('Rust stable x86_64-pc-windows-msvc required; actual '+$hostInfo)
$hasCxx=$false
if(Get-Command cl.exe -ErrorAction SilentlyContinue){$hasCxx=$true}
$pf86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if(-not $hasCxx -and $pf86){
  $vswhere=Join-Path $pf86 'Microsoft Visual Studio/Installer/vswhere.exe'
  if(Test-Path $vswhere){
    try{$path=(& $vswhere '-latest' '-products' '*' '-requires' 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' '-property' 'installationPath' | Select-Object -First 1);$hasCxx=[bool]$path}catch{}
  }
}
Check 'Microsoft C++ Build Tools' $hasCxx 'Visual Studio C++ x64 toolchain and Windows SDK required for Rust MSVC'
 . (Join-Path $PSScriptRoot 'find-python312.ps1')
$python=Find-DuduPython312
Check 'Python 3.12' ([bool]$python) 'used by real 12-page tutorial screenshot generator'
if ($python) {
 Write-Host ('[INFO] Python 3.12 found at '+$python.Executable)
} else {
 Write-Host '[ACTION] Run INSTALL_Python312.cmd (optional, asks YES) or install Python 3.12 from https://www.python.org/downloads/windows/' -ForegroundColor Yellow
}
if(-not $env:DUDU_LICENSE_URL -or -not $env:DUDU_LICENSE_PUBLIC_KEY_B64){
 Write-Host '[INFO] Production Worker HTTPS URL/public verification key can be entered interactively when building.'
}else{
 Write-Host '[INFO] Production public license parameters are provided; build will verify their live Ed25519 attestation.'
}
Write-Host 'Required sources: https://nodejs.org  https://rustup.rs  https://visualstudio.microsoft.com/visual-cpp-build-tools/  https://www.python.org/downloads/'
if ($all) {Write-Host 'PASS: required local build tools detected. Network / license server are checked during full build.';exit 0}
Write-Host 'ACTION: install missing build tools above and rerun this check. Customer computers never need these tools.'
exit 1
