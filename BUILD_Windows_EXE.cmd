@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title 独独AI工作台 - Windows 安装包构建
rem Compatibility alias for users of the older English-named build command.
call "%~dp0一键打包Windows安装版.cmd"
exit /b %errorlevel%
