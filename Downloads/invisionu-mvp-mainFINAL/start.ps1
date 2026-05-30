# Запуск бэкенда (виртуальное окружение backend\.venv)
$backendPy = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $backendPy)) { $backendPy = "python" }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; & '$backendPy' -m uvicorn main:app --reload --port 8000"

# Запуск фронтенда
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host "Бэкенд: http://localhost:8000" -ForegroundColor Green
Write-Host "Фронтенд: http://localhost:5173" -ForegroundColor Green
Write-Host "Swagger: http://localhost:8000/docs" -ForegroundColor Cyan
