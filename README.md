# 🤖 Winamax Scraper

Автоматический сбор данных с турниров Expresso на Winamax для DigitalOcean VPS.

## 🚀 Возможности

- **Автоматический скрапинг** каждые 10 минут
- **Веб-интерфейс мониторинга** на порту 3000
- **Поддержка 11 лимитов** от 0.25€ до 500€
- **Фильтрация по очкам** - настраиваемый минимальный порог
- **Whitelist система** - отслеживание конкретных игроков
- **Проверка дубликатов** - избежание повторного сохранения одинаковых данных
- **Полное логирование** - все операции записываются в БД
- **API для мониторинга** - REST endpoints для автоматизации

## 📦 Установка на DigitalOcean

```bash
# Клонирование репозитория
git clone <your-repo-url>
cd winamax-scraper

# Установка зависимостей
npm install --production

# Настройка окружения
cp config.example.env .env
# Отредактируйте .env с вашими настройками MySQL
```

## ⚙️ Настройка

### 1. База данных (.env)
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=winamax_analytics
MIN_POINTS_FILTER=5
CHECK_DUPLICATES=true
```

### 2. Лимиты (limits.txt)
Отредактируйте файл `limits.txt` - закомментируйте ненужные лимиты:
```
# 50€ - Mid stakes  
50€|https://www.winamax.fr/en/challenges/expresso/50/

# 100€ - High stakes
100€|https://www.winamax.fr/en/challenges/expresso/100/
```

### 3. Whitelist (whitelist.txt)
Добавьте имена игроков для отслеживания только их:
```
PlayerName1
PlayerName2
```

## 🎮 Использование

### Запуск с веб-мониторингом (РЕКОМЕНДУЕТСЯ)
```bash
# PM2 для продакшена
pm2 start server.js --name "winamax-scraper"
pm2 startup
pm2 save

# Или обычный запуск
node server.js
```

### Только скрапинг без веб-интерфейса
```bash
node start-scraping.js
```

### Разовый тест
```bash
npm run test
```

## 🌐 Веб-интерфейс

После запуска доступен по адресу:
- **Локально**: http://localhost:3000
- **На сервере**: http://YOUR_SERVER_IP:3000

### Функции интерфейса:
- 📊 **Статус системы** - время работы, состояние
- 🚀 **Управление скрапингом** - запуск/остановка
- 📈 **Статистика** - успешные/неудачные запуски
- 📝 **Логи в реальном времени** - последние события

## 📡 API Endpoints

```bash
# Статус системы
GET /api/status

# Здоровье сервера
GET /api/health  

# Статус скрапинга
GET /api/scraping/status

# Запуск сбора данных
POST /api/scraping/start
```

## 📊 Структура данных

Данные сохраняются в MySQL таблицы:
- `tournament_snapshots` - снимки данных каждые 10 минут
- `scraping_logs` - логи работы скрапера

## 🛠️ Технологии

- **Node.js** + ES Modules
- **Puppeteer** - веб-скрапинг
- **MySQL2** - база данных
- **node-cron** - планировщик
- **Winston** - логирование

## 📝 Логи

Логи сохраняются в:
- `logs/` - файлы логов
- MySQL таблица `scraping_logs` - структурированные логи

## 🔧 Деплой

Для продакшена просто запустите:
```bash
npm start
```

Скрапер будет работать в фоне, собирая данные каждые 10 минут. 