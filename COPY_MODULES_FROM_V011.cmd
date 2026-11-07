@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Doubao v0.5 - Reuse Electron modules from v0.1.1
if exist "node_modules\electron\dist\electron.exe" (
 echo [OK] v0.3 already has Electron. Launching...
 call "%~dp0START_Doubao.cmd"
 exit /b %errorlevel%
)
echo Enter the directory path of your WORKING v0.1.1 source folder.
echo Example: C:\Users\YourName\Downloads\Doubao_Creative_Hub_v0.1.1_Repair
echo Do not enter a ZIP file. Do not enter the node_modules subfolder.
set /p "OLD=Old v0.1.1 folder: "
set "OLD=%OLD:"=%"
if not exist "%OLD%\node_modules\electron\dist\electron.exe" (
 echo [ERROR] Electron not found at this location.
 pause
 exit /b 1
)
echo [INFO] Copying only the installed node_modules. No account or project data changes.
robocopy "%OLD%\node_modules" "%~dp0node_modules" /E /NFL /NDL /NP
if errorlevel 8 (
 echo [ERROR] Copy failed.
 pause
 exit /b 1
)
call "%~dp0START_Doubao.cmd"
exit /b %errorlevel%
