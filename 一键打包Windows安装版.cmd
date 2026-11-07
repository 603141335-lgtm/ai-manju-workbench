@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Please install Node.js 22 first. & pause & exit /b 1)
call npm install --no-audit --no-fund || (pause & exit /b 1)
call npm run check || (pause & exit /b 1)
set "BUILD_TEMP=%TEMP%\doubao-build-%RANDOM%"
mkdir "%BUILD_TEMP%" || exit /b 1
xcopy /E /I /Y /Q "%~dp0*" "%BUILD_TEMP%\" >nul
pushd "%BUILD_TEMP%"
call node scripts\harden.js || (popd & pause & exit /b 1)
call npm run check || (popd & pause & exit /b 1)
call node scripts\prepare-feed.js || (popd & pause & exit /b 1)
call npx electron-builder --win nsis --x64 --config release-build.json --publish never || (popd & pause & exit /b 1)
xcopy /E /I /Y /Q "release\*" "%~dp0release\" >nul
popd
echo Installer at release\Doubao-Creative-Hub-Setup-v0.6.0-x64.exe
pause
