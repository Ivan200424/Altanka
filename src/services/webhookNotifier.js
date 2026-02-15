const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WebhookNotifier');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 10000;

/**
 * Відправити webhook сповіщення
 * @param {string} webhookUrl - URL для відправки webhook
 * @param {Object} payload - Дані для відправки
 * @param {number} retryCount - Кількість спроб (для рекурсії)
 * @returns {Promise<boolean>}
 */
async function sendWebhook(webhookUrl, payload, retryCount = 0) {
  try {
    logger.debug('Sending webhook', { 
      url: webhookUrl, 
      type: payload.type,
      attempt: retryCount + 1 
    });

    const response = await axios.post(webhookUrl, payload, {
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Altanka-API/2.0'
      }
    });

    if (response.status >= 200 && response.status < 300) {
      logger.info('Webhook sent successfully', { 
        url: webhookUrl,
        status: response.status,
        type: payload.type
      });
      return true;
    } else {
      logger.warn('Webhook returned non-2xx status', { 
        url: webhookUrl,
        status: response.status
      });
      return false;
    }
  } catch (error) {
    logger.error('Error sending webhook', {
      url: webhookUrl,
      error: error.message,
      attempt: retryCount + 1
    });

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
      logger.info(`Retrying webhook in ${delay}ms`, { attempt: retryCount + 2 });
      
      await sleep(delay);
      return sendWebhook(webhookUrl, payload, retryCount + 1);
    }

    logger.error('Webhook failed after all retries', { 
      url: webhookUrl,
      maxRetries: MAX_RETRIES
    });
    return false;
  }
}

/**
 * Відправити webhook про аварійне відключення ДТЕК
 * @param {string} webhookUrl - URL для відправки webhook
 * @param {string} userId - ID користувача
 * @param {string} region - Регіон
 * @param {string} queue - Черга
 * @param {string} alertType - Тип алерту (emergency_on, emergency_off, emergency_update)
 * @param {Object} data - Додаткові дані про відключення
 * @returns {Promise<boolean>}
 */
async function sendDtekAlert(webhookUrl, userId, region, queue, alertType, data = {}) {
  const payload = {
    type: 'dtek_alert',
    user_id: userId,
    region: region,
    queue: queue,
    alert_type: alertType,
    timestamp: new Date().toISOString(),
    data: data
  };

  return sendWebhook(webhookUrl, payload);
}

/**
 * Затримка
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  sendWebhook,
  sendDtekAlert
};
