# DTEK Regional Sites Support - Migration Guide

## Overview
This update adds support for regional DTEK sites (Kyiv Oblast, Dnipro, Odesa) that require 3-field addresses (settlement, street, house) instead of the 2-field format (street, house) used by city sites.

## Database Changes

### New Column
A new nullable `settlement` column has been added to the `dtek_alerts` table:

```sql
ALTER TABLE dtek_alerts ADD COLUMN settlement TEXT;
```

### Migration
Run the migration script to update your database:

```bash
node src/migrations/add-settlement-column.js
```

This script is **idempotent** - it can be run multiple times safely. It will skip the migration if the column already exists.

## User-Facing Changes

### Regional Sites (3-field format)
- **Kyiv Oblast** (Київщина обл)
- **Dnipro** (Дніпропетровщина)
- **Odesa** (Одещина)

Users must provide address in format: `settlement, street, house`

**Examples:**
- `Нижча Дубечня, Деснянська, 1`
- `Бориспіль, Київський Шлях, 5А`
- `Вишневе, вул. Європейська, 10-Б`

### City Sites (2-field format)
- **Kyiv City** (Київ місто)

Users provide address in format: `street house`

**Examples:**
- `Хрещатик 10`
- `вул. Січових Стрільців 5А`

## Technical Details

### Modified Files
1. **src/database/dtekAlerts.js**
   - Added `settlement` column to table schema
   - Updated `upsertDtekSubscription()` to accept optional settlement parameter
   - All queries now handle settlement field

2. **src/services/dtekScraper.js**
   - Added `hasSettlement` flag to DTEK_REGIONS config
   - Updated `scrapCurrentOutage()` to accept optional settlement parameter
   - Implemented form filling logic for 3-field input
   - Tries multiple field selectors for settlement: `#city`, `#settlement`, `#locality`

3. **src/handlers/dtek.js**
   - Detects region type and shows appropriate input format
   - Updated address parsing regex to support 3-field format
   - Regex now supports both Latin and Cyrillic characters in house numbers
   - Updated example messages

4. **src/services/dtekMonitor.js**
   - Updated address grouping to include settlement
   - Passes settlement to scraper when checking subscriptions
   - Updated message formatting to show settlement

### Backward Compatibility
- ✅ Existing city subscriptions (2-field) continue to work
- ✅ Settlement column is nullable - no data migration needed
- ✅ Old subscriptions automatically work with new code

## Testing

### Manual Testing
1. For city site (Kyiv):
   - Use format: `Хрещатик 10`
   - Should work as before

2. For regional site (Kyiv Oblast):
   - Use format: `Нижча Дубечня, Деснянська, 1`
   - Should now work correctly

### Known Limitations
- DTEK sites may use different field IDs than expected
- Settlement field selectors are: `#city`, `#settlement`, `#locality`
- If real sites use different IDs, update selectors in `dtekScraper.js` line 135-145

## Deployment Checklist

- [ ] Run database migration: `node src/migrations/add-settlement-column.js`
- [ ] Verify migration completed successfully
- [ ] Deploy updated code
- [ ] Test with both city and regional addresses
- [ ] Monitor logs for any scraping errors
- [ ] If needed, adjust settlement field selectors based on actual site structure

## Troubleshooting

### "Не вдалося знайти або заповнити поле населеного пункту"
The settlement field selector may be incorrect. Check the actual DTEK site HTML and update selectors in `dtekScraper.js`.

### Migration Fails
Ensure DATABASE_URL is set and database is accessible. Check that you have ALTER TABLE permissions.

### Address Parsing Errors
Verify users are entering addresses in the correct format for their region type. Error messages will guide them to the correct format.
