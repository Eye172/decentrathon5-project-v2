# Первичная настройка после клона: venv, pip, npm. backend\.env в репозитории — ключи уже внутри (приватный репо).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

$envFile = Join-Path $backend ".env"
$envExample = Join-Path $backend ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "Создан backend\.env из .env.example — укажите ключи API." -ForegroundColor Yellow
    } else {
        Write-Host "Нет backend\.env и .env.example — создайте .env вручную." -ForegroundColor Red
        exit 1
    }
}

Push-Location $backend
try {
    if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
        python -m venv .venv
    }
    & .\.venv\Scripts\python.exe -m pip install -q --upgrade pip
    & .\.venv\Scripts\pip.exe install -r requirements.txt
}
finally {
    Pop-Location
}

Push-Location $frontend
try {
    npm install
}
finally {
    Pop-Location
}

Write-Host "Готово. Запуск: .\start.ps1 (бэкенд + фронт в отдельных окнах)." -ForegroundColor Green
