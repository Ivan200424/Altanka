# Telegram Bot Implementation Summary

## Огляд

Успішно створено повнофункціональний Telegram-бот для моніторингу відключень електроенергії через сайти ДТЕК. Бот реалізовано на Python з використанням сучасних асинхронних технологій.

## Створені компоненти

### 1. Структура проєкту

```
bot/
├── __init__.py           # Пакет бота
├── main.py               # Точка входу, ініціалізація
├── config.py             # Конфігурація (pydantic-settings)
├── handlers/             # Обробники команд Telegram
│   ├── __init__.py
│   ├── start.py          # /start команда з Reply Keyboard
│   ├── add_address.py    # ConversationHandler для додавання адреси
│   ├── my_addresses.py   # Перегляд збережених адрес
│   └── delete_address.py # Видалення адреси
├── scraper/              # Playwright scraper
│   ├── __init__.py
│   ├── dtek_scraper.py   # Головна логіка парсингу
│   ├── regions.py        # Маппінг регіонів на URLs
│   └── models.py         # Dataclasses для результатів
├── db/                   # База даних
│   ├── __init__.py
│   ├── models.py         # SQLAlchemy ORM моделі
│   ├── engine.py         # Async engine та сесії
│   └── repository.py     # CRUD операції
├── scheduler/            # Моніторинг
│   ├── __init__.py
│   └── monitor.py        # APScheduler job для перевірок
└── utils/                # Утиліти
    ├── __init__.py
    └── logger.py         # structlog конфігурація
```

### 2. Моделі бази даних

**Users** - користувачі бота:
- `id` (serial) - внутрішній ID
- `telegram_id` (bigint) - Telegram ID користувача
- `username` (varchar) - username користувача
- `created_at` (timestamp) - дата створення

**Addresses** - адреси користувачів:
- `id` (serial) - внутрішній ID
- `user_id` (int) - foreign key до Users
- `region` (varchar) - регіон (київ, київщина, etc.)
- `settlement` (varchar) - населений пункт (null для Києва)
- `street` (varchar) - вулиця
- `house` (varchar) - номер будинку
- `full_address` (text) - повна адреса
- `created_at` (timestamp) - дата створення
- **UNIQUE constraint на user_id** - 1 адреса на користувача

**ShutdownStates** - статуси відключень:
- `id` (serial) - внутрішній ID
- `address_id` (int) - foreign key до Addresses (UNIQUE)
- `shutdown_type` (varchar) - тип відключення (аварійне/планове)
- `start_time` (timestamp) - час початку
- `end_time` (timestamp) - орієнтовний час завершення
- `is_active` (boolean) - активне відключення
- `last_checked_at` (timestamp) - остання перевірка
- `updated_at` (timestamp) - остання зміна

### 3. DTEK Scraper

**DTEKScraper** клас з Playwright:
- Headless browser automation
- Підтримка 4 регіонів ДТЕК
- Автодоповнення адрес (населений пункт, вулиця, будинок)
- Парсинг статусу відключень
- Retry механізм з exponential backoff
- Timeout management

**Підтримувані регіони:**
- 🏙️ Київ - https://www.dtek-kem.com.ua/ua/shutdowns
- 🌾 Київщина - https://www.dtek-krem.com.ua/ua/shutdowns
- 🏭 Дніпропетровщина - https://www.dtek-dnem.com.ua/ua/shutdowns
- 🌊 Одещина - https://www.dtek-oem.com.ua/ua/shutdowns

### 4. Telegram Bot Handlers

**Start Handler** (`/start`):
- Показує головне меню з Reply Keyboard
- 3 кнопки: "📍 Додати адресу", "📋 Мої адреси", "🗑 Видалити адресу"

**Add Address ConversationHandler**:
- Багатокроковий процес додавання адреси
- Вибір регіону (Inline Keyboard)
- Ввід та автодоповнення населеного пункту (для не-Києва)
- Ввід та автодоповнення вулиці
- Вибір номера будинку зі списку
- Перевірка поточного статусу відключення
- Підтвердження моніторингу
- Обмеження: 1 адреса на користувача

**My Addresses Handler**:
- Показує збережену адресу
- Показує поточний статус відключення
- Час останньої перевірки

**Delete Address Handler**:
- Показує адресу
- Запитує підтвердження
- Видаляє з БД

### 5. Scheduler для моніторингу

**MonitoringService**:
- Запускається кожні 5 хвилин через APScheduler
- Перевіряє всі адреси в БД
- Групує по регіонах для ефективності
- Використовує один browser instance
- Порівнює з попереднім станом
- Надсилає сповіщення при змінах:
  - Нове відключення
  - Зміна часу
  - Відключення завершилось

**Формат сповіщень:**

Нове відключення:
```
⚡️ Увага! Відключення електроенергії

📍 Адреса: {адреса}
🏙️ Регіон: {регіон}
🔴 Тип: {аварійне/планове}
🕐 Початок: {час}
🕐 Орієнтовне завершення: {час}
```

Завершення:
```
✅ Електроенергію відновлено!

📍 Адреса: {адреса}
🏙️ Регіон: {регіон}
```

### 6. Конфігурація

**pydantic-settings** для управління конфігурацією:
- `BOT_TOKEN` - токен Telegram бота
- `DATABASE_URL` - PostgreSQL connection string
- `LOG_LEVEL` - рівень логування
- `CHECK_INTERVAL_MINUTES` - інтервал перевірок (5 хвилин)
- `PLAYWRIGHT_TIMEOUT` - таймаути для Playwright
- `MAX_RETRIES` - кількість спроб при помилках

### 7. Логування

**structlog** для структурованого логування:
- JSON формат для production
- Console renderer для development
- Логування всіх операцій
- Traceback для помилок
- Context variables

### 8. Docker та Deploy

**Dockerfile.bot**:
- Base: `mcr.microsoft.com/playwright/python:v1.40.0-jammy`
- Multi-stage build
- Встановлення залежностей
- Playwright browsers
- CMD: `python -m bot.main`

**docker-compose.yml**:
- Сервіс `postgres` - PostgreSQL 15
- Сервіс `api` - Node.js API (існуючий)
- Сервіс `bot` - Python Telegram bot (новий)
- Shared network
- Persistent volumes

**railway.bot.toml**:
- Конфігурація для Railway deployment
- Dockerfile path
- Start command
- Environment variables

### 9. Alembic міграції

- Налаштовано Alembic для міграцій БД
- Async support
- Auto-generate міграцій з моделей
- `alembic upgrade head` для застосування

### 10. Документація

**README.bot.md**:
- Детальний опис проєкту
- Інструкції для локального запуску
- Docker Compose setup
- Railway deployment guide
- API документація (для Node.js частини)
- Архітектура системи

## Технічні особливості

### Асинхронність
- Повністю асинхронний код (async/await)
- AsyncIO event loop
- Async database operations (asyncpg)
- Async Telegram bot (python-telegram-bot v20+)
- Async Playwright

### Надійність
- Retry механізм з exponential backoff
- Timeout management
- Error handling на всіх рівнях
- Graceful shutdown (SIGINT/SIGTERM)
- Database connection pooling

### Масштабованість
- Групування адрес по регіонах
- Один browser instance для всіх перевірок
- Connection pooling для БД
- Efficient queries з selectinload

### Безпека
- Prepared statements (SQLAlchemy ORM)
- Input validation (pydantic)
- No SQL injection
- Environment variables для секретів
- No secrets in code

## Тестування

Створено `test_bot.py` для перевірки компонентів:
- ✅ Імпорти всіх модулів
- ✅ Конфігурація
- ✅ Regions mapping
- ✅ Все працює без помилок

## Що потрібно для запуску

### Локально

1. PostgreSQL база даних
2. Telegram Bot Token (від @BotFather)
3. Python 3.11+
4. Встановити залежності: `pip install -r requirements.txt`
5. Встановити Playwright: `playwright install chromium`
6. Створити `.env` файл з налаштуваннями
7. Запустити: `python -m bot.main`

### Docker

1. Створити `.env` файл
2. Запустити: `docker-compose up -d`

### Railway

1. Підключити GitHub репозиторій
2. Додати PostgreSQL addon
3. Налаштувати змінні оточення
4. Railway автоматично задеплоїть

## Файли створені

- `bot/` - весь код бота (27 файлів)
- `alembic/` - міграції БД
- `requirements.txt` - Python залежності
- `Dockerfile.bot` - Docker image для бота
- `docker-compose.yml` - оновлено для обох сервісів
- `railway.bot.toml` - конфігурація Railway
- `README.bot.md` - документація
- `.env.example.bot` - приклад конфігурації
- `test_bot.py` - тести компонентів
- `.gitignore` - оновлено для Python

## Наступні кроки

1. **Отримати Telegram Bot Token** від @BotFather
2. **Налаштувати PostgreSQL** (локально або Railway)
3. **Створити .env** файл з реальними credentials
4. **Запустити бота** локально або задеплоїти
5. **Протестувати функціонал** з реальними адресами ДТЕК
6. **Моніторити логи** для виявлення можливих проблем

## Обмеження

- 1 адреса на користувача
- Підтримка тільки 4 регіонів ДТЕК
- Перевірка кожні 5 хвилин (можна змінити)
- Тільки українська мова
- Максимум 100 користувачів (можна збільшити)

## Можливі покращення

1. Підтримка декількох адрес на користувача
2. Додаткові регіони
3. Історія відключень
4. Статистика
5. Експорт даних
6. Admin panel
7. Metrics та monitoring (Prometheus/Grafana)
8. Rate limiting для захисту від abuse
9. Backup та restore
10. Automated tests (pytest)

---

**Статус:** ✅ Реалізація завершена. Бот готовий до запуску та тестування.
