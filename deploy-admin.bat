@echo off
REM 部署 admin 云函数
echo Deploying admin cloud function...
node --check cloudfunctions\admin\modules\userModule.js
if %ERRORLEVEL% neq 0 (
    echo Syntax error in userModule.js!
    exit /b 1
)
node --check cloudfunctions\admin\modules\authModule.js
if %ERRORLEVEL% neq 0 (
    echo Syntax error in authModule.js!
    exit /b 1
)
echo All syntax checks passed!
echo Please deploy using WeChat Developer Tools or CloudBase CLI
pause
