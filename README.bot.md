# ⚡ Altanka - Моніторинг відключень електроенергії ДТЕК

Комплексний сервіс для моніторингу відключень електроенергії в Україні, що складається з двох компонентів:

1. **REST API** (Node.js) — мікросервіс для моніторингу аварійних сповіщень ДТЕК
2. **Telegram Bot** (Python) — бот для моніторингу відключень з персональними підписками

---

## 📱 Telegram Bot (Python)

### Про бота

Telegram-бот для моніторингу відключень електроенергії через сайти ДТЕК. Бот використовує headless browser automation (Playwright) для парсингу сайтів ДТЕК, зберігає адреси користувачів у PostgreSQL, та надсилає сповіщення при змінах статусу відключень.

### Основні можливості

✅ Підтримка 4 регіонів ДТЕК:
- 🏙️ Київ (місто)
- 🌾 Київщина (область)
- 🏭 Дніпропетровщина
- 🌊 Одещина

✅ Функціонал:
- Додавання адреси з автодоповненням (населений пункт, вулиця, будинок)
- Перегляд поточного статусу відключень
- Автоматичні сповіщення про зміни статусу
- 1 адреса на користувача
- Моніторинг кожні 5 хвилин

✅ Типи відключень:
- ⚡ Аварійні відключення
- 🔧 Планові відключення
- ✅ Відсутність відключень

### Технології

- **Python 3.11+**
- **python-telegram-bot v20+** (async)
- **Playwright** (headless browser automation)
- **PostgreSQL + asyncpg + SQLAlchemy 2.0**
- **Alembic** (міграції БД)
- **APScheduler** (періодичні перевірки)
- **structlog** (структуроване логування)
- **pydantic-settings** (конфігурація)
- **Docker** (контейнеризація)

### Встановлення та запуск

#### Локальна розробка

1. **Клонувати репозиторій**
```bash
git clone https://github.com/Ivan200424/Altanka.git
cd Altanka
```

2. **Створити .env файл**
```bash
cp .env.example.bot .env
```

Відредагуйте `.env` файл:
```env
BOT_TOKEN=your-telegram-bot-token-here
DATABASE_URL=postgresql+asyncpg://altanka:altanka_password@localhost:5432/altanka_db
LOG_LEVEL=INFO
CHECK_INTERVAL_MINUTES=5
```

3. **Встановити залежності**
```bash
pip install -r requirements.txt
playwright install chromium
```

4. **Запустити базу даних (Docker)**
```bash
docker-compose up -d postgres
```

5. **Виконати міграції**
```bash
alembic upgrade head
```

6. **Запустити бота**
```bash
python -m bot.main
```

#### Docker Compose (повний стек)

Запуск API + Bot + PostgreSQL:

```bash
docker-compose up -d
```

Перевірка логів:
```bash
docker-compose logs -f bot
```

### Використання бота

1. **Запустити бота** — `/start`
2. **Додати адресу** — натисніть "📍 Додати адресу"
   - Оберіть регіон
   - Введіть населений пункт (якщо не Київ)
   - Оберіть вулицю зі списку
   - Оберіть номер будинку
   - Підтвердіть моніторинг
3. **Переглянути адресу** — натисніть "📋 Мої адреси"
4. **Видалити адресу** — натисніть "🗑 Видалити адресу"

### Формат сповіщень

**Нове відключення:**
```
⚡️ Увага! Відключення електроенергії

📍 Адреса: вул. Хрещатик, 1
🏙️ Регіон: 🏙️ Київ
🔴 Тип: Аварійне відключення
🕐 Початок: 15.02 18:00
🕐 Орієнтовне завершення: 15.02 22:00
```

**Відключення завершилось:**
```
✅ Електроенергію відновлено!

📍 Адреса: вул. Хрещатик, 1
🏙️ Регіон: 🏙️ Київ
```

### Структура проєкту

```
bot/
├── main.py              # Точка входу
├── config.py            # Конфігурація (pydantic-settings)
├── handlers/            # Обробники команд Telegram
│   ├── start.py         # /start команда
│   ├── add_address.py   # ConversationHandler для додавання адреси
│   ├── my_addresses.py  # Перегляд адрес
│   └── delete_address.py# Видалення адреси
├── scraper/             # Playwright scraper для ДТЕК
│   ├── dtek_scraper.py  # Логіка парсингу
│   ├── regions.py       # Маппінг регіонів
│   └── models.py        # Моделі даних
├── db/                  # База даних
│   ├── models.py        # SQLAlchemy моделі
│   ├── engine.py        # Async engine
│   └── repository.py    # CRUD операції
├── scheduler/           # Моніторинг
│   └── monitor.py       # APScheduler job
└── utils/               # Утиліти
    └── logger.py        # structlog конфігурація
```

### Деплой на Railway

1. **Створити новий проект** на Railway
2. **Додати PostgreSQL addon**
3. **Налаштувати змінні оточення:**
   - `BOT_TOKEN` — токен Telegram бота
   - `DATABASE_URL` — автоматично з PostgreSQL addon
   - `LOG_LEVEL` — INFO
   - `CHECK_INTERVAL_MINUTES` — 5

4. **Задеплоїти з GitHub:**
   - Підключити репозиторій
   - Railway автоматично виявить `Dockerfile.bot`
   - Або вказати `railway.bot.toml`

5. **Перевірити логи** в Railway dashboard

---

## 🌐 REST API (Node.js)

### Про API

REST API мікросервіс для моніторингу аварійних сповіщень про відключення електроенергії ДТЕК та відправки webhook-сповіщень.

### Основні можливості

- ✅ Моніторинг аварійних відключень ДТЕК
- ✅ REST API для керування підписками
- ✅ Webhook сповіщення про зміни
- ✅ API Key аутентифікація
- ✅ PostgreSQL для зберігання даних

### Технології

- **Node.js 20+**
- **Express** (web framework)
- **PostgreSQL** (база даних)
- **Playwright** (web scraping)
- **Axios** (HTTP клієнт)

### API Endpoints

#### Health Check - `GET /api/health`
Перевірка стану API (без аутентифікації).

#### Підписатися - `POST /api/subscribe`
```bash
curl -X POST https://your-api.com/api/subscribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123456789",
    "region": "kyiv_city",
    "queue": "3.1",
    "webhook_url": "https://your-bot.example.com/webhook"
  }'
```

#### Відписатися - `POST /api/unsubscribe`
```bash
curl -X POST https://your-api.com/api/unsubscribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123456789"
  }'
```

#### Статус - `GET /api/status`
Отримати поточний статус системи моніторингу.

#### Алерти - `GET /api/alerts/:region`
Отримати поточні аварійні алерти для конкретного регіону.

### Webhook Сповіщення

Коли виявляється аварійне відключення, API надсилає POST запит на webhook_url:

```json
{
  "type": "dtek_alert",
  "user_id": "123456789",
  "region": "kyiv_city",
  "queue": "3.1",
  "alert_type": "emergency_on",
  "timestamp": "2026-02-15T21:00:00.000Z",
  "data": {
    "description": "Аварійне відключення",
    "address": {
      "settlement": null,
      "street": "Хрещатик",
      "house": "1"
    },
    "start_date": "15.02 18:00",
    "end_date": "15.02 22:00"
  }
}
```

### Встановлення API

```bash
# Встановити залежності
npm install

# Налаштувати .env
cp .env.example .env

# Запустити
npm start
```

---

## 🗂 База даних

Обидва сервіси використовують одну PostgreSQL базу даних.

### Schema для Telegram Bot

```sql
-- Користувачі
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Адреси
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    region VARCHAR(50) NOT NULL,
    settlement VARCHAR(255),
    street VARCHAR(255) NOT NULL,
    house VARCHAR(50) NOT NULL,
    full_address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Статуси відключень
CREATE TABLE shutdown_states (
    id SERIAL PRIMARY KEY,
    address_id INTEGER REFERENCES addresses(id) ON DELETE CASCADE UNIQUE,
    shutdown_type VARCHAR(50),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT FALSE,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 🔐 Безпека

- ✅ API Key аутентифікація для REST API
- ✅ PostgreSQL з підготовленими запитами (захист від SQL injection)
- ✅ Retry механізм з exponential backoff
- ✅ Обробка помилок та логування
- ✅ Health checks для моніторингу

---

## 📝 Ліцензія

MIT

---

## 📧 Контакти

GitHub: [@Ivan200424](https://github.com/Ivan200424)
