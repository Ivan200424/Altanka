const { pool } = require('./db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ApiSubscriptions');

/**
 * Ініціалізація таблиці api_subscriptions
 */
async function initApiSubscriptionsTable() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        region TEXT NOT NULL,
        queue TEXT,
        webhook_url TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_subscriptions_user_id ON api_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_subscriptions_is_active ON api_subscriptions(is_active);
      CREATE INDEX IF NOT EXISTS idx_api_subscriptions_region ON api_subscriptions(region);
    `);

    logger.info('API subscriptions table initialized');
  } catch (error) {
    logger.error('Error initializing api_subscriptions table', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Створити або оновити підписку
 * @param {string} userId - ID користувача
 * @param {string} region - Регіон
 * @param {string} queue - Черга
 * @param {string} webhookUrl - URL для webhook сповіщень
 * @returns {Promise<boolean>}
 */
async function upsertApiSubscription(userId, region, queue, webhookUrl) {
  try {
    await pool.query(`
      INSERT INTO api_subscriptions (user_id, region, queue, webhook_url, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
      ON CONFLICT(user_id) DO UPDATE SET
        region = EXCLUDED.region,
        queue = EXCLUDED.queue,
        webhook_url = EXCLUDED.webhook_url,
        is_active = TRUE,
        updated_at = NOW()
    `, [userId, region, queue, webhookUrl]);

    logger.info('API subscription upserted', { userId, region, queue });
    return true;
  } catch (error) {
    logger.error('Error upserting API subscription', { 
      error: error.message,
      userId,
      region
    });
    return false;
  }
}

/**
 * Отримати всі активні підписки
 * @returns {Promise<Array>}
 */
async function getActiveApiSubscriptions() {
  try {
    const result = await pool.query(`
      SELECT * FROM api_subscriptions 
      WHERE is_active = TRUE
      ORDER BY region, queue
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error getting active API subscriptions', { error: error.message });
    return [];
  }
}

/**
 * Отримати підписку користувача
 * @param {string} userId - ID користувача
 * @returns {Promise<Object|null>}
 */
async function getApiSubscription(userId) {
  try {
    const result = await pool.query(`
      SELECT * FROM api_subscriptions WHERE user_id = $1
    `, [userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error getting API subscription', { 
      error: error.message,
      userId
    });
    return null;
  }
}

/**
 * Деактивувати підписку користувача
 * @param {string} userId - ID користувача
 * @returns {Promise<boolean>}
 */
async function deactivateApiSubscription(userId) {
  try {
    await pool.query(`
      UPDATE api_subscriptions SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE user_id = $1
    `, [userId]);

    logger.info('API subscription deactivated', { userId });
    return true;
  } catch (error) {
    logger.error('Error deactivating API subscription', { 
      error: error.message,
      userId
    });
    return false;
  }
}

/**
 * Отримати підписки по регіону та черзі
 * @param {string} region - Регіон
 * @param {string} queue - Черга
 * @returns {Promise<Array>}
 */
async function getSubscriptionsByRegionQueue(region, queue) {
  try {
    const result = await pool.query(`
      SELECT * FROM api_subscriptions 
      WHERE region = $1 AND queue = $2 AND is_active = TRUE
    `, [region, queue]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting subscriptions by region/queue', { 
      error: error.message,
      region,
      queue
    });
    return [];
  }
}

module.exports = {
  initApiSubscriptionsTable,
  upsertApiSubscription,
  getActiveApiSubscriptions,
  getApiSubscription,
  deactivateApiSubscription,
  getSubscriptionsByRegionQueue
};
