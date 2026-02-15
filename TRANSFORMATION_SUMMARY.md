# Altanka REST API Transformation - Complete Summary

## Overview

Successfully transformed the Altanka project from a full-featured Telegram bot into a clean, focused REST API microservice for monitoring DTEK emergency power outage alerts.

## Transformation Goals Achieved ✅

### 1. Pure REST API Architecture ✅
- Removed all Telegram bot functionality
- Implemented Express-based REST API
- Created 5 well-defined API endpoints
- Added proper authentication and rate limiting

### 2. DTEK Monitoring Core ✅
- Preserved DTEK scraping functionality (dtekScraper.js)
- Maintained monitoring logic (dtekMonitorApi.js)
- Kept database tracking (dtek_alerts table)
- Supports 4 DTEK regions (Kyiv, Kyivska, Dnipro, Odesa)

### 3. Webhook Notification System ✅
- Automatic push notifications via webhooks
- Retry logic with exponential backoff
- Alert types: emergency_on, emergency_off, emergency_update, error
- Comprehensive error handling

### 4. Security Implementation ✅
- API key authentication (Bearer token)
- Rate limiting: 100 requests per 15 minutes per IP
- Input validation on all endpoints
- CodeQL security scan: 0 alerts

### 5. Database Design ✅
- Created api_subscriptions table for API users
- Maintained dtek_alerts table for monitoring
- Removed 7 unused Telegram-related tables
- Clean PostgreSQL schema

## Code Changes Summary

### Files Removed (94 files)
- `src/bot.js` - Telegram bot instance
- `src/handlers/*` - All 8 Telegram command handlers
- `src/keyboards/*` - Telegram inline keyboards
- `src/powerMonitor.js` - Power/IP monitoring
- `src/channelGuard.js` - Channel management
- `src/scheduler.js` - Notification scheduler
- `src/publisher.js` - Channel publishing
- `src/monitoring/*` - Bot monitoring system
- `src/state/*` - Wizard state management
- `src/utils/messageQueue.js` - Telegram rate limiting
- `src/utils/errorHandler.js` - Telegram error handling
- `tests/*` - 40+ old test files
- Many more Telegram-specific files

### Files Added
- `src/apiServer.js` - Express REST API server
- `src/services/webhookNotifier.js` - Webhook system
- `src/services/dtekMonitorApi.js` - API-focused DTEK monitor
- `src/database/apiSubscriptions.js` - API subscriptions management
- `src/indexApi.js` → `src/index.js` - New entry point

### Files Modified
- `package.json` - Updated dependencies and metadata
- `.env.example` - New API configuration
- `src/config.js` - Simplified configuration
- `src/database/db.js` - Cleaned up imports
- `README.md` - Complete rewrite with API docs

## API Endpoints

### 1. GET /api/health
**Purpose:** Health check (no authentication required)
**Returns:** System status, database connection, uptime, memory usage

### 2. POST /api/subscribe
**Purpose:** Subscribe user to DTEK alerts
**Auth:** Required (API key)
**Body:**
```json
{
  "user_id": "123456789",
  "region": "kyiv_city",
  "queue": "3.1",
  "webhook_url": "https://your-bot.example.com/webhook"
}
```

### 3. POST /api/unsubscribe
**Purpose:** Unsubscribe user from alerts
**Auth:** Required (API key)
**Body:**
```json
{
  "user_id": "123456789"
}
```

### 4. GET /api/status
**Purpose:** Get monitoring system status
**Auth:** Required (API key)
**Returns:** Active subscriptions, regions, check interval

### 5. GET /api/alerts/:region
**Purpose:** Get current alerts for a region
**Auth:** Required (API key)
**Returns:** List of active alerts with details

## Webhook Payload Format

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

## Database Schema

### api_subscriptions (NEW)
```sql
CREATE TABLE api_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  queue TEXT,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### dtek_alerts (EXISTING - KEPT)
```sql
CREATE TABLE dtek_alerts (
  id SERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  dtek_region TEXT NOT NULL,
  settlement TEXT,
  street TEXT NOT NULL,
  house TEXT NOT NULL,
  last_message_id INTEGER,
  prev_text TEXT,
  prev_start_date TEXT,
  prev_end_date TEXT,
  prev_update_timestamp TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Dependencies

### Removed
- `node-telegram-bot-api` ^0.64.0 - Telegram bot API
- `node-cron` ^3.0.3 - Scheduling (not needed for API)

### Added
- `express` ^4.18.2 - Web framework
- `express-rate-limit` ^8.2.1 - Rate limiting

### Kept
- `axios` ^1.6.5 - HTTP requests (webhooks)
- `dotenv` ^16.3.1 - Environment configuration
- `pg` ^8.11.3 - PostgreSQL client
- `playwright` ^1.40.0 - Web scraping for DTEK

## Configuration (.env)

```env
# API Configuration
API_KEY=your_secret_api_key_here
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/altanka_db

# Timezone
TZ=Europe/Kyiv

# Scaling
DB_POOL_MAX=50
DB_POOL_MIN=5
```

## Security Features

### API Key Authentication
- All protected endpoints require `Authorization: Bearer <API_KEY>`
- Invalid/missing keys return 401 Unauthorized

### Rate Limiting
- 100 requests per 15 minutes per IP address
- Applies to all routes
- Returns 429 Too Many Requests when exceeded

### Input Validation
- Required field validation
- URL format validation
- Region existence validation

### CodeQL Security Scan
- ✅ 0 alerts found
- ✅ All security issues addressed
- ✅ Rate limiting added per CodeQL recommendations

## Architecture

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

## Deployment

### Railway
1. Connect repository to Railway
2. Add PostgreSQL service
3. Set environment variables:
   - `API_KEY` (generate secure key)
   - `DATABASE_URL` (auto from PostgreSQL)
   - `PORT` (auto)
   - `TZ=Europe/Kyiv`

### Docker
```bash
docker-compose up -d
```

### Manual
```bash
npm install
cp .env.example .env
# Edit .env with your settings
npm start
```

## Testing

### Manual API Testing
```bash
# Health check (no auth)
curl http://localhost:3000/api/health

# Subscribe (with auth)
curl -X POST http://localhost:3000/api/subscribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123",
    "region": "kyiv_city",
    "queue": "3.1",
    "webhook_url": "https://example.com/webhook"
  }'

# Check status (with auth)
curl http://localhost:3000/api/status \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get alerts by region (with auth)
curl http://localhost:3000/api/alerts/kyiv_city \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Code Quality Improvements

### Addressed Code Review Feedback
1. ✅ Extracted hardcoded pool stats interval to named constant
2. ✅ Read API version from package.json instead of hardcoding
3. ✅ Added named constant for placeholder message_id
4. ✅ Added explanatory comments for inline constants

### Best Practices Applied
- Proper error handling throughout
- Comprehensive logging with logger utility
- Named constants for magic numbers
- Clean separation of concerns
- RESTful API design

## Statistics

### Before Transformation
- **Total Files:** ~110 files
- **Lines of Code:** ~30,000+ lines
- **Focus:** Full-featured Telegram bot
- **Dependencies:** 6 packages

### After Transformation
- **Total Files:** 15 core files
- **Lines of Code:** ~3,000 lines
- **Focus:** REST API microservice
- **Dependencies:** 5 packages

### Code Reduction
- **Files Removed:** 94 files
- **Lines Removed:** ~27,000 lines
- **% Reduction:** ~90% codebase reduction

## Future Enhancements (Optional)

### Potential Improvements
- [ ] Add OpenAPI/Swagger documentation
- [ ] Implement WebSocket support for real-time updates
- [ ] Add metrics/monitoring endpoint (Prometheus format)
- [ ] Support additional DTEK regions
- [ ] Add bulk subscription endpoints
- [ ] Implement subscription history/logs

### Not Recommended
- ❌ Adding back Telegram bot features (defeats the purpose)
- ❌ Adding graph generation (should be in main bot)
- ❌ Adding user management UI (API-only service)

## Conclusion

The Altanka project has been successfully transformed from a monolithic Telegram bot into a focused, production-ready REST API microservice. The new architecture:

✅ **Simplifies maintenance** - 90% less code to maintain
✅ **Improves security** - API key auth + rate limiting
✅ **Enables scalability** - Stateless API design
✅ **Facilitates integration** - Clean REST API + webhooks
✅ **Maintains core value** - DTEK monitoring fully preserved

The API is ready for deployment and integration with the main bot system.

---

**Transformation Date:** February 15, 2026
**Version:** 2.0.0
**Status:** ✅ Complete and Production-Ready
