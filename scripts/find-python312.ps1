#Requires -Version 5.1
# Windows PowerShell 5.1 safe Python 3.12 detection.
# IMPORTANT: avoid `python -c 'print("...")'` because native quoting may be
# stripped on legacy PowerShell even when `py -3.12 --version` works in CMD.
# Read-only. Never installs Python, edits PATH, or changes user data.
function Find-DuduPython312 {
    $candidates = New-Object 'System.Collections.Generic.List[object]'
    foreach ($launcherName in @('py.exe', 'py')) {
        $launcher = Get-Command $launcherName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($launcher -and $launcher.Source) {
            $candidates.Add([pscustomobject]@{ Executable = [string]$launcher.Source; Arguments = @('-3.12') })
        }
    }
    foreach ($interpreterName in @('python3.12.exe', 'python.exe')) {
        $command = Get-Command $interpreterName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command -and $command.Source) {
            $candidates.Add([pscustomobject]@{ Executable = [string]$command.Source; Arguments = @() })
        }
    }
    $knownPaths = @()
    if ($env:DUDU_PYTHON312_EXE) { $knownPaths += $env:DUDU_PYTHON312_EXE }
    if ($env:LOCALAPPDATA) { $knownPaths += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe') }
    if ($env:ProgramFiles) {
        $knownPaths += (Join-Path $env:ProgramFiles 'Python312\python.exe')
        $knownPaths += (Join-Path $env:ProgramFiles 'Python\Python312\python.exe')
    }
    if (${env:ProgramFiles(x86)}) {
        $knownPaths += (Join-Path ${env:ProgramFiles(x86)} 'Python312\python.exe')
    }
    foreach ($p in $knownPaths) {
        if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) {
            $candidates.Add([pscustomobject]@{ Executable = [string]$p; Arguments = @() })
        }
    }
    foreach ($candidate in $candidates) {
        try {
            $exe = [string]$candidate.Executable
            $launchArgs = @($candidate.Arguments)
            # Use --version: no nested quotation or -c command string required.
            # `py -3.12 --version` is known working on this build machine.
            $versionOutput = & $exe @launchArgs '--version' 2>&1
            $exitCode = $LASTEXITCODE
            $versionText = ($versionOutput | Out-String).Trim()
            if ($exitCode -eq 0 -and $versionText -match '(?m)^Python 3\.12\.\d+(?:[^\r\n]*)$') {
                return [pscustomobject]@{
                    Executable = $exe
                    Arguments = $launchArgs
                    Version = $versionText
                }
            }
        } catch {
            # Try another installed interpreter; no mutations are performed.
            continue
        }
    }
    return $null
}
