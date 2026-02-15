const { pool } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DtekAlerts');

/**
 * Ініціалізація таблиці dtek_alerts
 */
async function initDtekAlertsTable() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dtek_alerts (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT NOT NULL UNIQUE,
        dtek_region TEXT NOT NULL,
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
      
      CREATE INDEX IF NOT EXISTS idx_dtek_alerts_telegram_id ON dtek_alerts(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_dtek_alerts_is_active ON dtek_alerts(is_active);
      CREATE INDEX IF NOT EXISTS idx_dtek_alerts_region ON dtek_alerts(dtek_region);
    `);

    logger.info('DTEK alerts table initialized');
  } catch (error) {
    logger.error('Error initializing dtek_alerts table', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Створити або оновити підписку на DTEK сповіщення
 * @param {string} telegramId - Telegram ID користувача
 * @param {string} dtekRegion - Регіон ДТЕК
 * @param {string} street - Вулиця
 * @param {string} house - Будинок
 * @returns {Promise<boolean>}
 */
async function upsertDtekSubscription(telegramId, dtekRegion, street, house) {
  try {
    await pool.query(`
      INSERT INTO dtek_alerts (telegram_id, dtek_region, street, house, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
      ON CONFLICT(telegram_id) DO UPDATE SET
        dtek_region = EXCLUDED.dtek_region,
        street = EXCLUDED.street,
        house = EXCLUDED.house,
        is_active = TRUE,
        updated_at = NOW()
    `, [telegramId, dtekRegion, street, house]);

    logger.info('DTEK subscription upserted', { telegramId, dtekRegion, street, house });
    return true;
  } catch (error) {
    logger.error('Error upserting DTEK subscription', { 
      error: error.message,
      telegramId,
      dtekRegion
    });
    return false;
  }
}

/**
 * Отримати всі активні підписки на DTEK сповіщення
 * @returns {Promise<Array>}
 */
async function getActiveDtekSubscriptions() {
  try {
    const result = await pool.query(`
      SELECT * FROM dtek_alerts 
      WHERE is_active = TRUE
      ORDER BY dtek_region, street, house
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error getting active DTEK subscriptions', { error: error.message });
    return [];
  }
}

/**
 * Отримати підписку користувача
 * @param {string} telegramId - Telegram ID користувача
 * @returns {Promise<Object|null>}
 */
async function getDtekSubscription(telegramId) {
  try {
    const result = await pool.query(`
      SELECT * FROM dtek_alerts WHERE telegram_id = $1
    `, [telegramId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error getting DTEK subscription', { 
      error: error.message,
      telegramId
    });
    return null;
  }
}

/**
 * Зберегти стан останнього повідомлення про відключення
 * @param {string} telegramId - Telegram ID користувача
 * @param {number} messageId - ID повідомлення в Telegram
 * @param {string} text - Текст повідомлення
 * @param {string} startDate - Час початку відключення
 * @param {string} endDate - Час завершення відключення
 * @param {string} updateTimestamp - Час оновлення даних
 * @returns {Promise<boolean>}
 */
async function saveDtekAlertState(telegramId, messageId, text, startDate, endDate, updateTimestamp) {
  try {
    await pool.query(`
      UPDATE dtek_alerts SET
        last_message_id = $2,
        prev_text = $3,
        prev_start_date = $4,
        prev_end_date = $5,
        prev_update_timestamp = $6,
        updated_at = NOW()
      WHERE telegram_id = $1
    `, [telegramId, messageId, text, startDate, endDate, updateTimestamp]);

    logger.debug('DTEK alert state saved', { telegramId, messageId });
    return true;
  } catch (error) {
    logger.error('Error saving DTEK alert state', { 
      error: error.message,
      telegramId
    });
    return false;
  }
}

/**
 * Очистити стан останнього повідомлення (коли відключення завершено)
 * @param {string} telegramId - Telegram ID користувача
 * @returns {Promise<boolean>}
 */
async function clearDtekAlertState(telegramId) {
  try {
    await pool.query(`
      UPDATE dtek_alerts SET
        last_message_id = NULL,
        prev_text = NULL,
        prev_start_date = NULL,
        prev_end_date = NULL,
        prev_update_timestamp = NULL,
        updated_at = NOW()
      WHERE telegram_id = $1
    `, [telegramId]);

    logger.debug('DTEK alert state cleared', { telegramId });
    return true;
  } catch (error) {
    logger.error('Error clearing DTEK alert state', { 
      error: error.message,
      telegramId
    });
    return false;
  }
}

/**
 * Деактивувати підписку користувача
 * @param {string} telegramId - Telegram ID користувача
 * @returns {Promise<boolean>}
 */
async function deactivateDtekSubscription(telegramId) {
  try {
    await pool.query(`
      UPDATE dtek_alerts SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE telegram_id = $1
    `, [telegramId]);

    logger.info('DTEK subscription deactivated', { telegramId });
    return true;
  } catch (error) {
    logger.error('Error deactivating DTEK subscription', { 
      error: error.message,
      telegramId
    });
    return false;
  }
}

module.exports = {
  initDtekAlertsTable,
  upsertDtekSubscription,
  getActiveDtekSubscriptions,
  getDtekSubscription,
  saveDtekAlertState,
  clearDtekAlertState,
  deactivateDtekSubscription
};
