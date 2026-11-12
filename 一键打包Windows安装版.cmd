@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title 独独AI工作台 v1.0.0 安装包
where node >nul 2>nul || (echo 请先安装 Node.js 22。 & pause & exit /b 1)
call npm install --no-audit --no-fund || goto failed
call npm run brand:generate || goto failed
call npm run check || goto failed
rem Keep readable original source untouched; only scramble temporary copy.
set "STAGING=%TEMP%\DuduAI-Build-%RANDOM%%RANDOM%"
mkdir "%STAGING%" || goto failed
robocopy "%~dp0" "%STAGING%" /E /XD .git release .venv private-demo-data /XF *.log >nul
if errorlevel 8 goto failed
pushd "%STAGING%" || goto failed
if not exist "vendor\bin\ffmpeg.exe" (
  echo 请从 GitHub Actions 构建正式版：本地缺少 FFmpeg LGPL 二进制文件。
  echo 使用 GitHub Actions 可自动下载并打包 FFmpeg，保证尾帧功能不丢失。
  popd
  goto failed
)
call node scripts\harden.js || (popd & goto failed)
call npm run check:hardened || (popd & goto failed)
call node scripts\prepare-public-notice.js || (popd & goto failed)
call node scripts\prepare-feed.js || (popd & goto failed)
call npx electron-builder --win nsis --x64 --config release-build.json --publish never || (popd & goto failed)
if not exist "%~dp0release" mkdir "%~dp0release"
xcopy /Y /Q "release\*" "%~dp0release\" >nul
popd
echo [SUCCESS] 独独AI工作台-Setup-v1.0.0-x64.exe 已输出到 release 目录。
echo 若没有证书，安装包尚未数字签名；请优先以 GitHub Actions 发布版交付。
pause
exit /b 0
:failed
echo [ERROR] 构建失败。推荐使用 GitHub Actions 构建正式版，源代码和用户数据未修改。
pause
exit /b 1
