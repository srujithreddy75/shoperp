@echo off
chcp 65001 >nul
title Sri Sai Sandhya Vastralayam & Boutique ERP Server
color 0A
cd /d "%~dp0"

echo =========================================================================
echo   Sri Sai Sandhya Vastralayam ^& Boutique - Full-Stack ERP Server
echo =========================================================================
echo.
echo Starting backend server on http://localhost:3000 ...
echo Database: SQLite (data\boutique_erp.db)
echo.

rem Launch default browser after 1 second
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:3000"

rem Run the Node.js server
bin\node.exe --experimental-sqlite server.js

pause
