@echo off
chcp 65001 >nul
REM ══════════════════════════════════════════════
REM  NEUROVAULT — Development Startup Script
REM  Khởi động tất cả 3 services trong 1 command
REM ══════════════════════════════════════════════

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║         🧠 NEUROVAULT DEV LAUNCHER           ║
echo  ║         Starting all services...              ║
echo  ╚══════════════════════════════════════════════╝
echo.

REM ── Kiểm tra prerequisites ──
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Ollama không tìm thấy trong PATH.
    echo           LLM features sẽ không hoạt động.
    echo           Cài đặt: https://ollama.com/download
    echo.
) else (
    echo [1/4] 🚀 Khởi động Ollama...
    start "Ollama Server" cmd /k "ollama serve"
    timeout /t 2 /nobreak >nul
)

REM ── Kiểm tra Python (ưu tiên venv của dự án) ──
set "PY=python"
if exist "%~dp0backend\ai_core\.venv\Scripts\python.exe" set "PY=%~dp0backend\ai_core\.venv\Scripts\python.exe"
"%PY%" --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python không tìm thấy!
    echo         AI Core sẽ không hoạt động.
    echo.
    goto start_backend
)

echo [2/4] 🐍 Khởi động AI Core (Python FastAPI)...
start "AI Core" cmd /k "cd /d %~dp0backend\ai_core && "%PY%" api/ai_server.py"
timeout /t 3 /nobreak >nul

:start_backend
REM ── Kiểm tra Node.js ──
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js không tìm thấy trong PATH!
    pause
    exit /b 1
)

REM Không có MongoDB local (port 27017) thì dùng MongoDB in-memory
set "SERVER_CMD=npm run local"
netstat -an | findstr /C:":27017" | findstr LISTENING >nul && set "SERVER_CMD=npm start"

echo [3/4] 🟢 Khởi động Backend Gateway (Node.js)...
start "Backend Gateway" cmd /k "cd /d %~dp0backend\server && %SERVER_CMD%"
timeout /t 2 /nobreak >nul

echo [4/4] ⚛️  Khởi động Frontend (Vite)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  ✅ Tất cả services đã khởi động!            ║
echo  ║                                              ║
echo  ║  Ollama:    http://127.0.0.1:11434           ║
echo  ║  AI Core:   http://127.0.0.1:8000            ║
echo  ║  Backend:   http://127.0.0.1:5001            ║
echo  ║  Frontend:  http://localhost:5173             ║
echo  ║                                              ║
echo  ║  Health:    http://localhost:5001/api/health  ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Nhấn phím bất kỳ để đóng launcher...
pause >nul
