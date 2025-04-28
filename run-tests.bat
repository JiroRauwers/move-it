@echo off
set TERM=dumb
powershell -NoProfile -Command "Remove-Module PSReadLine -Force -ErrorAction SilentlyContinue; bun test %*" 