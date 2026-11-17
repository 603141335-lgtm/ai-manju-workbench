@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [豆包创作舱] 本地卡密功能验证
set /p HUB_ADMIN_PASSWORD=请设置至少12位管理员密码(不要公开): 
set /p HUB_CARD_PEPPER=请设置至少24位服务端密钥(不要公开): 
set HUB_DATA_DIR=%~dp0private-demo-data
start "" http://127.0.0.1:8765
py -3 license-prototype\license_server.py
pause
