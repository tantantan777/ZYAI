@echo off
wt -d "E:\ZYAI\frontend" powershell -Command "npm run dev" ; split-pane -V -d "E:\ZYAI\backend" powershell -Command "npm run dev"