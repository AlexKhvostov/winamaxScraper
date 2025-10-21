# 🚀 Инструкция по запуску (прод) — Winamax Scraper

Документ описывает полный цикл деплоя и управления сервисами (сервер, бот, watchdog) с учётом актуальных изменений.

## 📋 Подготовка

1) Node.js 18+ и PM2
```bash
npm i -g pm2
```

2) Обновление кода
```bash
cd ~/winamax-scraper
git fetch origin
git reset --hard origin/main
npm ci --no-audit --no-fund
mkdir -p logs
```

3) Проверить .env (обязательно)
- MYSQL_HOST, MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_PORT
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- TELEGRAM_STATUS_INTERVAL_HOURS (часовой статус отправляет server.js)
- TELEGRAM_MONITORING_INTERVAL_MINUTES, TELEGRAM_DAILY_REPORT_HOUR
- LOG_LEVEL, LOG_MAX_SIZE_MB=10, LOG_MAX_FILES=5
- LOGS_AUTO_CLEAR_HOUR=23 (или LOGS_AUTO_CLEAR_CRON)
- WATCHDOG_SERVER_URL=http://localhost:3000/api/status

## 🎯 Запуск через PM2 (рекомендуется)

```bash
# Сервер (API, скрапер-расписание, часовой Telegram-статус fallback)
pm2 start server.js --name winamax-server

# Watchdog (следит за сервером, перезапускает при падении)
pm2 start watchdog.js --name winamax-watchdog -- start

# Telegram-бот (команды, ежедневный отчёт; часовой статус отключён в боте)
pm2 start bot/telegram-monitor.js --name winamax-bot

# Сохранить конфиг и включить автозапуск
pm2 save
pm2 status
```

Проверка:
```bash
curl -s http://localhost:3000/api/status | jq
curl -s http://localhost:3001/api/status | jq
pm2 logs winamax-server --lines 50
pm2 logs winamax-bot --lines 50
```

## 🌐 Веб-интерфейс
- Дашборд: http://YOUR_SERVER_IP:3000/
- API статус: http://YOUR_SERVER_IP:3000/api/status
- Watchdog статус: http://YOUR_SERVER_IP:3001/api/status

## 🤖 Telegram
- Бот: команды `/status`, `/restart`, `/restartlocal`, `/restartwatchdog`, `/logs`, `/clearlogs`, `/help`
- Ежедневный отчёт — отправляет бот в `TELEGRAM_DAILY_REPORT_HOUR`
- Часовой статус — отправляет server.js (fallback) каждые `TELEGRAM_STATUS_INTERVAL_HOURS`

## 🗂️ Логи
- Ротация: `logs/combined-YYYY-MM-DD.log`, `logs/error-YYYY-MM-DD.log` (zipped, лимиты по размеру/кол-ву)
- Команда бота `/logs` показывает размеры и хвосты актуальных файлов
- `/clearlogs` очищает текущие rotated и legacy (`combined.log`, `error.log`)

PM2:
```bash
pm2 logs winamax-server --lines 100
pm2 logs winamax-bot --lines 100
pm2 flush            # очистить pm2-логи
```

## 🔒 Защита от дублей (lock)
- Сервер: `scraper-server.lock`
- Бот: `telegram-bot.lock`
Lock удаляется при корректном завершении; «битый» lock удаляется автоматически при старте, если PID не жив.

## 🔄 Перезапуск/остановка
```bash
pm2 restart all
pm2 restart winamax-server
pm2 restart winamax-bot
pm2 stop all
pm2 delete winamax-server winamax-watchdog winamax-bot
pm2 save
```

### Быстрый перезапуск всех сервисов
```bash
pm2 restart all
pm2 save
pm2 status
```

Проверки после перезапуска:
```bash
curl -s http://localhost:3000/api/status
curl -s http://localhost:3001/api/status
pm2 logs winamax-server --lines 50
pm2 logs winamax-bot --lines 50
```

### Точечный перезапуск
```bash
pm2 restart winamax-server      # сервер (API/cron/hourly fallback)
pm2 restart winamax-watchdog    # watchdog
pm2 restart winamax-bot         # телеграм-бот
```

## 🚨 Troubleshooting

1) Порт 3000 занят (EADDRINUSE)
- Убедитесь, что нет второго процесса сервера: `pm2 delete winamax-server && pm2 start server.js --name winamax-server`

2) 409 в Telegram (двойной бот)
- `pm2 delete winamax-bot && pm2 start bot/telegram-monitor.js --name winamax-bot`
- Lock-файл удалится автоматически при старте, если PID мёртв

3) Часовой статус не приходит
- Проверить логи `winamax-server` на строки cron, убедиться в корректности TZ Europe/Rome
- Бот не отправляет часовой статус — это делает сервер (fallback)

4) Автоочистка логов
- Убедитесь, что задан `LOGS_AUTO_CLEAR_HOUR` или `LOGS_AUTO_CLEAR_CRON`

5) DigitalOcean обновление после force-push
```bash
git fetch origin && git reset --hard origin/main && npm ci && pm2 restart all && pm2 save
```

---
**✅ Готово.** Система запускается через PM2, мониторится в Telegram, логи ротируются, дубли процессов предотвращены lock-механизмом.