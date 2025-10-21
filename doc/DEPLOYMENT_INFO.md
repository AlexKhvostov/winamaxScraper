# 🚀 Информация о деплое Winamax Scraper

## 📊 Продакшн сервер (DigitalOcean)

### Основная информация
- **Ссылка на кабинет** : `[СКРЫТО]`
- **IP адрес**: `[СКРЫТО]`
- **Провайдер**: DigitalOcean Amsterdam
- **ОС**: Ubuntu 22.04 LTS
- **Тарифный план**: $5/месяц (1GB RAM, 1 vCPU, 25GB SSD)
- **SSH доступ**: `[СКРЫТО]`
- **Веб-интерфейс**: `[СКРЫТО]`

### Установленное ПО
- **Node.js**: 18.20.8
- **npm**: 10.8.2
- **PM2**: 6.0.8 (автозапуск приложения)
- **Git**: для деплоя кода
- **Chrome/Chromium**: для Puppeteer

### Структура проекта на сервере
```
/root/winamax-scraper/
├── src/
├── public/
├── .env (настройки БД и конфигурация)
├── server.js (основной сервер с скрапером)
├── package.json
└── README.md
```

### PM2 процессы
```bash
# Статус
pm2 status

# Логи
pm2 logs winamax-scraper

# Перезапуск
pm2 restart winamax-scraper

# Остановка
pm2 stop winamax-scraper
```

## 🗄️ База данных (Hostland)

### Подключение к БД
- **Хост**: `mysql80.hostland.ru`
- **Порт**: `3306`
- **База данных**: `host1708875_leaderboard`
- **Пользователь**: `host1708875_redparty`
- **Пароль**: `[СКРЫТО]`

### Основные таблицы
- **tournament_snapshots** - основные данные игроков
- **scraping_logs** - логи работы скрапера
- **scraping_metadata** - метаданные скрапинга

## ⚙️ Настройки проекта (.env)

### База данных
```env
MYSQL_HOST=mysql80.hostland.ru
MYSQL_USERNAME=host1708875_redparty
MYSQL_PASSWORD=[СКРЫТО]
MYSQL_DATABASE=host1708875_leaderboard
MYSQL_PORT=3306
```

### Скрапинг
```env
# Активные лимиты
ACTIVE_LIMITS=0.25,0.5,1-1.5,2-3,4-7,8-15,16-25,50,100,250,500

# Минимальные очки для сохранения
MIN_POINTS_FILTER=0

# Проверка дубликатов
CHECK_DUPLICATES=true

# Интервал сбора (минуты)
SCRAPING_INTERVAL_MINUTES=10
```

### Сервер
```env
# Порт веб-сервера
PORT=3000

# Часовой пояс (Милан)
TIMEZONE=Europe/Rome

# Логирование
LOG_LEVEL=info
```

## 🔄 Процесс деплоя

### 1. Локальная разработка
```bash
# Тестирование локально
node server-no-scraper.js  # без скрапера
node server.js             # с скрапером
```

### 2. Коммит изменений
```bash
git add .
git commit -m "Описание изменений"
git push origin main
```

### 3. Деплой на сервер
```bash
# Подключение к серверу
ssh root@[СКРЫТО]

# Переход в папку проекта
cd /root/winamax-scraper

# Обновление кода
git pull origin main

# Установка зависимостей (если нужно)
npm install

# Перезапуск PM2
pm2 restart winamax-scraper

# Проверка статуса
pm2 status
pm2 logs winamax-scraper
```

## 🌐 Доступные URL

### Продакшн (DigitalOcean)
- **Главная**: `[СКРЫТО]`
- **API статуса**: `[СКРЫТО]`
- **API статистики**: `[СКРЫТО]`
- **API истории**: `[СКРЫТО]`

### Локальная разработка
- **Главная**: http://localhost:3001 (или PORT из .env)
- **API**: http://localhost:3001/api/*

## 📋 Мониторинг

### Ключевые метрики
- **Интервал скрапинга**: каждые 10 минут
- **Активные лимиты**: 11 лимитов (0.25€ - 500€)
- **Проверка дубликатов**: включена
- **Автозапуск**: через PM2

### Логи
```bash
# PM2 логи
pm2 logs winamax-scraper

# Системные логи
journalctl -u pm2-root

# Логи приложения
tail -f /root/.pm2/logs/winamax-scraper-out.log
tail -f /root/.pm2/logs/winamax-scraper-error.log
```

## 🔧 Устранение проблем

### Проблемы с Puppeteer
```bash
# Проверка Chrome
google-chrome --version
chromium-browser --version

# Переустановка зависимостей
cd /root/winamax-scraper
npm install puppeteer
```

### Проблемы с БД
```bash
# Тест подключения
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: 'mysql80.hostland.ru',
  user: 'host1708875_redparty',
  password: '[СКРЫТО]',
  database: 'host1708875_leaderboard'
}).then(() => console.log('✅ БД доступна')).catch(console.error);
"
```

### Перезапуск всего
```bash
# Полный перезапуск
pm2 delete winamax-scraper
pm2 start server.js --name winamax-scraper
pm2 save
pm2 startup
```

## 📞 Контакты и доступы

### DigitalOcean
- **Email**: [ваш email]
- **Пароль**: [ваш пароль]
- **2FA**: включен

### Hostland
- **Панель управления**: https://cp.hostland.ru
- **Login**: [ваш логин]
- **Пароль**: [ваш пароль]

### GitHub
- **Репозиторий**: [ссылка на репозиторий]
- **Ветка**: main

---

**Последнее обновление**: 24 июня 2025
**Версия проекта**: 1.0
**Статус**: 🟢 Работает 