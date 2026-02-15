# ⚡ Altanka API

REST API мікросервіс для моніторингу ДТЕК аварійних сповіщень про відключення електроенергії в Україні.

## 📋 Огляд

Altanka — це REST API, який моніторить аварійні відключення електроенергії на сайтах ДТЕК та відправляє сповіщення через webhooks.

### Підтримувані регіони ДТЕК:
- 🏙️ Київ (місто)
- 🌾 Київщина (обл)
- 🏭 Дніпропетровщина
- 🌊 Одещина

### Основні функції:
- ✅ Моніторинг аварійних відключень ДТЕК
- ✅ REST API для керування підписками
- ✅ Webhook сповіщення про зміни
- ✅ API Key аутентифікація
- ✅ PostgreSQL для зберігання даних

## 🚀 Швидкий старт

### Встановлення

```bash
# Клонувати репозиторій
git clone https://github.com/Ivan200424/Altanka.git
cd Altanka

# Встановити залежності
npm install

# Налаштувати змінні середовища
cp .env.example .env
# Відредагувати .env файл з вашими налаштуваннями
```

### Конфігурація (.env)

```env
# API Configuration
API_KEY=your_secret_api_key_here
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/altanka_db

# Timezone
TZ=Europe/Kyiv
```

### Запуск

```bash
# Production
npm start

# Development (з автоперезавантаженням)
npm run dev
```

API буде доступний на `http://localhost:3000`

## 📡 API Endpoints

### Health Check - GET `/api/health`

Перевірка стану API (без аутентифікації).

### Підписатися - POST `/api/subscribe`

Підписати користувача на аварійні сповіщення ДТЕК.

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": "123456789",
  "region": "kyiv_city",
  "queue": "3.1",
  "webhook_url": "https://your-bot.example.com/webhook"
}
```

### Відписатися - POST `/api/unsubscribe`

Відписати користувача від сповіщень.

### Статус - GET `/api/status`

Отримати поточний статус системи моніторингу.

### Алерти - GET `/api/alerts/:region`

Отримати поточні аварійні алерти для конкретного регіону.

## 🔔 Webhook Сповіщення

Коли Altanka виявляє аварійне відключення, вона автоматично надсилає POST запит на webhook_url:

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
    "end_date": "15.02 22:00",
    "region_name": "🏙️ Київ (місто)"
  }
}
```

### Типи алертів:
- `emergency_on` — Початок аварійного відключення
- `emergency_update` — Оновлення часу відключення
- `emergency_off` — Завершення відключення
- `error` — Помилка при перевірці

## 🔐 Аутентифікація

Всі захищені endpoints вимагають API key в заголовку:

```
Authorization: Bearer YOUR_API_KEY
```

Встановіть `API_KEY` в `.env` файлі перед запуском.

## 📚 Архітектура

```
┌─────────────────────┐                    ┌──────────────────────┐
│   Головний бот       │                    │   Altanka (API)      │
│   (інший репо)       │                    │                      │
│                     │  POST /subscribe   │ ✅ Моніторинг ДТЕК   │
│ ✅ Графіки          │ ──────────────►   │ ✅ Аварійні алерти   │
│ ✅ Фактичне світло   │                    │ ✅ Парсинг даних     │
│ ✅ IP моніторинг     │  ◄──────────────  │                      │
│ ✅ Telegram UI       │  Webhook: алерт!  │ ❌ Без Telegram UI   │
│ ✅ Користувачі       │                    │ ❌ Без графіків      │
└─────────────────────┘                    └──────────────────────┘
```

## 🛠️ Технології

- **Node.js** — Runtime environment
- **Express** — Web framework
- **PostgreSQL** — База даних
- **Playwright** — Web scraping ДТЕК сайтів
- **Axios** — HTTP клієнт для webhooks

## 📝 Ліцензія

MIT

## 📧 Контакти

GitHub: [@Ivan200424](https://github.com/Ivan200424)
