# 🔒 Руководство по безопасности Winamax Scraper

## 🚨 КРИТИЧЕСКИ ВАЖНО!

**НИКОГДА НЕ КОММИТЬТЕ ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ В GIT!**

## 📋 Что НЕЛЬЗЯ коммитить:

### ❌ Запрещено в репозитории:
- **Токены API** (Telegram, Discord, и т.д.)
- **Пароли** от баз данных
- **Ключи доступа** (AWS, DigitalOcean, и т.д.)
- **IP адреса** серверов
- **SSH ключи** и доступы
- **Секретные ключи** приложений
- **Данные подключения** к БД
- **Личные данные** пользователей

### ✅ Разрешено в репозитории:
- **Примеры конфигурации** (`.env.example`)
- **Шаблоны** с плейсхолдерами
- **Документация** без секретов
- **Код приложения**
- **Тестовые данные**

## 🛡️ Правила безопасности:

### 1. **Переменные окружения**
```bash
# ✅ Правильно - в .env файле (НЕ в git)
TELEGRAM_BOT_TOKEN=your_real_token_here
MYSQL_PASSWORD=your_real_password_here

# ✅ Правильно - в .env.example (в git)
TELEGRAM_BOT_TOKEN=your_bot_token_here
MYSQL_PASSWORD=your_password_here
```

### 2. **Fallback значения в коде**
```javascript
// ❌ НЕПРАВИЛЬНО - реальные данные в коде
this.botToken = process.env.TELEGRAM_BOT_TOKEN || '7967034577:REAL_TOKEN';

// ✅ ПРАВИЛЬНО - пустые значения или тестовые
this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
// или
this.botToken = process.env.TELEGRAM_BOT_TOKEN || 'test_token_for_development';
```

### 3. **Документация**
```markdown
<!-- ❌ НЕПРАВИЛЬНО - реальные данные -->
TELEGRAM_BOT_TOKEN=7967034577:AAGhX234234SvFq_fjSY5oFw-lGJBmb-muE

<!-- ✅ ПРАВИЛЬНО - плейсхолдеры -->
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## 🔍 Проверка перед коммитом:

### 1. **Поиск чувствительных данных:**
```bash
# Поиск токенов
grep -r "TELEGRAM_BOT_TOKEN\|API_KEY\|SECRET" . --exclude-dir=node_modules

# Поиск паролей
grep -r "PASSWORD\|PASS\|PWD" . --exclude-dir=node_modules

# Поиск IP адресов
grep -r "[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}" . --exclude-dir=node_modules
```

### 2. **Проверка .gitignore:**
Убедитесь, что `.env` файлы и другие чувствительные файлы добавлены в `.gitignore`.

### 3. **Проверка статуса git:**
```bash
git status
# Убедитесь, что .env файлы не отслеживаются
```

## 🚨 Если произошла утечка:

### 1. **Немедленные действия:**
- ✅ Удалить чувствительные данные из всех файлов
- ✅ Сменить все пароли и токены
- ✅ Проверить логи на предмет несанкционированного доступа
- ✅ Уведомить команду о проблеме

### 2. **Очистка истории git:**
```bash
# Удалить файл из истории (ОСТОРОЖНО!)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/sensitive/file' \
  --prune-empty --tag-name-filter cat -- --all

# Принудительно обновить удаленный репозиторий
git push origin --force --all
```

## 📝 Чек-лист безопасности:

- [ ] Все `.env` файлы в `.gitignore`
- [ ] В коде нет хардкодных паролей/токенов
- [ ] В документации только плейсхолдеры
- [ ] Примеры конфигурации безопасны
- [ ] Проверен `git status` перед коммитом
- [ ] Нет чувствительных данных в логах
- [ ] SSH ключи не в репозитории

## 🔧 Инструменты для проверки:

### 1. **GitLeaks** (рекомендуется):
```bash
# Установка
pip install git-leaks

# Проверка
git-leaks --path . --verbose
```

### 2. **TruffleHog**:
```bash
# Установка
pip install truffleHog

# Проверка
trufflehog --regex --entropy=False .
```

### 3. **Ручная проверка**:
```bash
# Поиск всех потенциальных секретов
grep -r -i "password\|token\|key\|secret\|api" . --exclude-dir=node_modules --exclude-dir=.git
```

## 📞 Контакты для экстренных случаев:

При обнаружении утечки данных немедленно:
1. Удалите чувствительные данные
2. Смените все пароли/токены
3. Уведомите команду
4. Проверьте логи на предмет взлома

---

**Помните: безопасность - это ответственность каждого разработчика!** 🛡️
