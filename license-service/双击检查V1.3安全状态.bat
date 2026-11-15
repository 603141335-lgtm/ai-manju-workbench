@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo   独独AI运营管理中心 V1.3 - 安全验收
echo =============================================
echo 只读检查，不会创建密钥、修改D1或部署Worker。
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [失败] 未检测到Node.js 22，请先安装Node.js。
  goto fail
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [失败] 未检测到npm。
  goto fail
)
node --version
echo.
echo [1/3] 代码语法检查
call npm run check
if errorlevel 1 goto fail
echo.
echo [2/3] 本地自动化测试
call npm test
if errorlevel 1 goto fail
echo.
echo [3/3] 备份和授权身份只读检查
call npm run deploy:preflight
if errorlevel 1 goto fail
echo.
echo [通过] 本机安全预检完成。
echo 注意：这不代表Cloudflare线上和支付商户验收完成！
pause
exit /b 0
:fail
echo.
echo [未通过] 请根据上方提示检查，不要执行生产部署。
pause
exit /b 1
