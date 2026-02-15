# 🚀 Швидкий старт - Telegram Bot

## Що було створено

Повнофункціональний Python Telegram-бот для моніторингу відключень електроенергії ДТЕК.

## 📋 Передумови

1. **Telegram Bot Token**
   - Отримайте від [@BotFather](https://t.me/BotFather)
   - Команда: `/newbot`
   - Збережіть токен

2. **PostgreSQL база даних**
   - Локально: Docker Compose (автоматично)
   - Production: Railway PostgreSQL addon

## 🏃 Локальний запуск (Docker - рекомендовано)

```bash
# 1. Створити .env файл
cp .env.example.bot .env

# 2. Відредагувати .env файл
# Встановити BOT_TOKEN=ваш-токен-від-botfather
nano .env

# 3. Запустити всі сервіси
docker-compose up -d

# 4. Переглянути логи
docker-compose logs -f bot

# 5. Зупинити
docker-compose down
```

## 🏃 Локальний запуск (без Docker)

```bash
# 1. Встановити PostgreSQL
# (macOS) brew install postgresql
# (Ubuntu) sudo apt install postgresql

# 2. Створити базу даних
createdb altanka_db

# 3. Встановити Python залежності
pip install -r requirements.txt

# 4. Встановити Playwright browsers
playwright install chromium

# 5. Створити .env файл
cp .env.example.bot .env

# 6. Відредагувати .env
BOT_TOKEN=your-bot-token
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/altanka_db

# 7. Виконати міграції
alembic upgrade head

# 8. Запустити бота
python -m bot.main
```

## ☁️ Деплой на Railway

### Варіант 1: Railway Dashboard

1. Перейти на [railway.app](https://railway.app)
2. Створити новий проект
3. Додати PostgreSQL service
4. Додати новий service з GitHub
5. Вибрати репозиторій `Ivan200424/Altanka`
6. Встановити змінні оточення:
   ```
   BOT_TOKEN=ваш-токен
   DATABASE_URL=${{Postgres.DATABASE_URL}}  # автоматично
   ```
7. Railway автоматично задеплоїть

### Варіант 2: Railway CLI

```bash
# 1. Встановити Railway CLI
npm install -g @railway/cli

# 2. Увійти
railway login

# 3. Створити проект
railway init

# 4. Додати PostgreSQL
railway add

# 5. Встановити змінні
railway variables set BOT_TOKEN=ваш-токен

# 6. Задеплоїти
railway up
```

## 📱 Використання бота

1. Знайти бота в Telegram за username
2. Натиснути `/start`
3. Обрати "📍 Додати адресу"
4. Вибрати регіон
5. Ввести адресу (бот підказує варіанти)
6. Підтвердити моніторинг

Бот автоматично надсилатиме сповіщення про:
- Нові відключення
- Зміни часу
- Відновлення електроенергії

## 🧪 Тестування

```bash
# Перевірка компонентів
python test_bot.py
```

## 📊 Моніторинг

### Docker
```bash
# Логи бота
docker-compose logs -f bot

# Статус контейнерів
docker-compose ps

# Перезапуск бота
docker-compose restart bot
```

### Railway
- Логи доступні в Railway Dashboard
- Automatic deploys при push до GitHub
- Metrics та usage tracking

## 🔧 Налаштування

### Інтервал перевірок
В `.env`:
```env
CHECK_INTERVAL_MINUTES=5  # За замовчуванням 5 хвилин
```

### Рівень логування
```env
LOG_LEVEL=INFO  # DEBUG для детального логування
```

### Playwright таймаути
```env
PLAYWRIGHT_TIMEOUT=30000  # 30 секунд
```

## 📁 Структура проєкту

```
bot/
├── main.py              # Точка входу
├── config.py            # Конфігурація
├── handlers/            # Telegram команди
├── scraper/             # DTEK парсинг
├── db/                  # База даних
├── scheduler/           # Моніторинг
└── utils/               # Логування

alembic/                 # Міграції БД
Dockerfile.bot           # Docker image
docker-compose.yml       # Локальна розробка
requirements.txt         # Python залежності
```

## 🐛 Усунення проблем

### Бот не відповідає
1. Перевірити логи: `docker-compose logs bot`
2. Перевірити BOT_TOKEN в .env
3. Перевірити з'єднання з БД

### Помилки Playwright
```bash
# Переінсталювати browsers
playwright install chromium --force
```

### Помилки БД
```bash
# Перезапустити PostgreSQL
docker-compose restart postgres

# Перевірити міграції
alembic current
alembic upgrade head
```

## 📚 Додаткова інформація

- **Детальна документація**: `README.bot.md`
- **Огляд реалізації**: `BOT_IMPLEMENTATION_SUMMARY.md`
- **Існуючий API**: `README.md` (Node.js)

## 🆘 Підтримка

- GitHub Issues: [Ivan200424/Altanka/issues](https://github.com/Ivan200424/Altanka/issues)
- Документація Railway: [docs.railway.app](https://docs.railway.app)
- Telegram Bot API: [core.telegram.org/bots](https://core.telegram.org/bots)

## ✅ Чеклист запуску

- [ ] Отримано Telegram Bot Token
- [ ] Налаштовано PostgreSQL (локально або Railway)
- [ ] Створено .env файл
- [ ] Встановлено залежності
- [ ] Виконано міграції БД (якщо не Docker)
- [ ] Запущено бота
- [ ] Протестовано команду /start
- [ ] Додано тестову адресу
- [ ] Перевірено сповіщення (почекати 5 хвилин)

---

**Статус**: ✅ Бот готовий до використання!
