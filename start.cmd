@echo off
cd /d "%~dp0"
node start.cjs %*
if errorlevel 1 pause
