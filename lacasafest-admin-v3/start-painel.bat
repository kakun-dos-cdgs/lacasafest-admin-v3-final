@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "La Casa Fest Admin" http://localhost:4173
  py -m http.server 4173
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "La Casa Fest Admin" http://localhost:4173
  python -m http.server 4173
  goto :eof
)
echo Python nao foi encontrado.
echo Instale Python em https://www.python.org/downloads/
pause
