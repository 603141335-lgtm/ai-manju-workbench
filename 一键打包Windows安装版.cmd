@echo off
setlocal
call "%~dp0BUILD_Windows_EXE.cmd" %*
exit /b %errorlevel%
