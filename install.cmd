@echo off
chcp 65001 >nul
set "NODE_EXE=node"
where node >nul 2>nul
if %errorlevel%==0 goto run
set "NODE_EXE=%~dp0..\.tools\node22\node.exe"
if exist "%NODE_EXE%" goto run
echo [projectmem] 未找到 Node.js。两种解决办法：
echo   1. 安装 Node 20+：winget install OpenJS.NodeJS.LTS  然后重新双击本文件
echo   2. 或把便携版 Node 解压到本仓库的上级目录\.tools\node22\node.exe
pause
exit /b 1
:run
"%NODE_EXE%" "%~dp0pmem.js" setup
echo.
pause
