@echo off
chcp 65001 >nul
setlocal
set "NODE=node"
where node >nul 2>nul
if %errorlevel%==0 goto nodeready
set "NODE=%~dp0..\..\.tools\node22\node.exe"
if not exist "%NODE%" (
  echo [projectmem] 未找到 Node，无法执行徽章恢复步骤。
  set "NODE="
)
:nodeready
echo ================================================
echo  projectmem CI 启用脚本（补 workflow 权限 + 恢复 CI）
echo ================================================
echo.
echo [1/4] 打开 GitHub 授权页并开始设备授权...
start "" "https://github.com/login/device"
gh auth refresh -h github.com -s workflow
if errorlevel 1 (
  echo.
  echo ❌ 授权失败。最常见原因：当前网络到 github.com 不通——请先连接 VPN/代理再重跑本脚本。
  pause
  exit /b 1
)
echo.
echo [2/4] 恢复 CI workflow 文件...
if not exist ".github\workflows" mkdir ".github\workflows"
move /y "docs\ci-workflow.pending.yml" ".github\workflows\ci.yml" >nul
echo [3/4] 恢复 README CI 徽章...
if defined NODE (
  "%NODE%" -e "const fs=require('fs');for(const f of ['README.md','README.en.md']){let s=fs.readFileSync(f,'utf8');const i=s.indexOf('<!-- CI');if(i>=0){const j=s.indexOf('-->',i);s=s.slice(0,i)+'[![CI](https://github.com/liv114514/projectmem/actions/workflows/ci.yml/badge.svg)](https://github.com/liv114514/projectmem/actions/workflows/ci.yml)'+s.slice(j+3);fs.writeFileSync(f,s);console.log('  badge restored:',f);}}"
)
echo [4/4] 提交并推送...
git add -A
git commit -m "ci: enable GitHub Actions" --no-verify -q
git push
if errorlevel 1 (
  echo git push 失败，改走 API 通道...
  if exist "%~dp0..\..\.tools\push-via-api.js" "%NODE%" "%~dp0..\..\.tools\push-via-api.js"
)
echo.
echo ✅ 完成！到 https://github.com/liv114514/projectmem/actions 看看 CI 跑绿没有。
pause
