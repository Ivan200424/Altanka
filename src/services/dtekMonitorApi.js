const { getDtekScraper, DTEK_REGIONS } = require('./dtekScraper');
const { 
  getActiveDtekSubscriptions, 
  saveDtekAlertState, 
  clearDtekAlertState 
} = require('../database/dtekAlerts');
const { getApiSubscription } = require('../database/apiSubscriptions');
const { sendDtekAlert } = require('./webhookNotifier');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DtekMonitorApi');

// Інтервал перевірки - 5 хвилин
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Пауза між скрапінгом різних адрес - 5 секунд
const DELAY_BETWEEN_SCRAPES_MS = 5 * 1000;

// Placeholder message ID для API підписок (не використовується Telegram)
const API_PLACEHOLDER_MESSAGE_ID = 1;

let monitoringInterval = null;
let isRunning = false;

/**
 * Запустити моніторинг ДТЕК
 */
async function startDtekMonitoring() {
  if (isRunning) {
    logger.warn('DTEK monitoring is already running');
    return;
  }

  isRunning = true;

  logger.info('Starting DTEK monitoring', { 
    checkInterval: `${CHECK_INTERVAL_MS / 1000 / 60} minutes`,
    delayBetweenScrapes: `${DELAY_BETWEEN_SCRAPES_MS / 1000} seconds`
  });

  // Запускаємо перевірку одразу
  setTimeout(() => checkAllSubscriptions(), 5000);

  // Запускаємо періодичну перевірку
  monitoringInterval = setInterval(() => {
    checkAllSubscriptions();
  }, CHECK_INTERVAL_MS);

  logger.success('DTEK monitoring started');
}

/**
 * Зупинити моніторинг ДТЕК
 */
function stopDtekMonitoring() {
  if (!isRunning) {
    return;
  }

  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }

  isRunning = false;
  logger.info('DTEK monitoring stopped');
}

/**
 * Перевірити всі підписки
 */
async function checkAllSubscriptions() {
  if (!isRunning) {
    return;
  }

  logger.info('Checking all DTEK subscriptions');

  try {
    const subscriptions = await getActiveDtekSubscriptions();
    
    if (subscriptions.length === 0) {
      logger.info('No active subscriptions');
      return;
    }

    logger.info(`Found ${subscriptions.length} active subscriptions`);

    // Групування підписників по адресі (region|settlement|street|house)
    const addressGroups = new Map();
    
    for (const sub of subscriptions) {
      const addressKey = `${sub.dtek_region}|${sub.settlement || ''}|${sub.street}|${sub.house}`;
      
      if (!addressGroups.has(addressKey)) {
        addressGroups.set(addressKey, []);
      }
      
      addressGroups.get(addressKey).push(sub);
    }

    logger.info(`Grouped into ${addressGroups.size} unique addresses`);

    // Обробляємо кожну унікальну адресу
    let index = 0;
    for (const [addressKey, subs] of addressGroups.entries()) {
      const [regionKey, settlement, street, house] = addressKey.split('|');
      
      try {
        logger.info(`Checking address ${index + 1}/${addressGroups.size}`, {
          region: regionKey,
          settlement: settlement || undefined,
          street,
          house,
          subscribers: subs.length
        });

        // Скрапимо дані один раз для цієї адреси
        const scraper = getDtekScraper();
        const { outage, screenshot } = await scraper.scrapCurrentOutage(
          regionKey, 
          street, 
          house,
          settlement || null
        );

        // Розсилаємо результат всім підписникам з цією адресою
        for (const sub of subs) {
          await processSubscription(sub, outage, regionKey);
        }

      } catch (error) {
        logger.error('Error checking address', {
          error: error.message,
          addressKey
        });
        
        // У випадку помилки, повідомляємо підписникам
        for (const sub of subs) {
          await notifySubscriberError(sub, error);
        }
      }

      // Пауза між різними адресами
      index++;
      if (index < addressGroups.size) {
        await sleep(DELAY_BETWEEN_SCRAPES_MS);
      }
    }

    logger.success('Finished checking all subscriptions');

  } catch (error) {
    logger.error('Error in checkAllSubscriptions', { error: error.message });
  }
}

/**
 * Обробити підписку
 * @param {Object} subscription - Підписка з БД
 * @param {Object|null} outage - Дані про відключення
 * @param {string} regionKey - Ключ регіону
 */
async function processSubscription(subscription, outage, regionKey) {
  const { telegram_id, last_message_id, prev_start_date, prev_end_date } = subscription;
  const region = DTEK_REGIONS[regionKey];

  try {
    // Отримуємо API підписку для цього користувача
    const apiSub = await getApiSubscription(telegram_id);
    
    if (!apiSub || !apiSub.webhook_url) {
      logger.debug('No API subscription or webhook URL for user', { userId: telegram_id });
      return;
    }

    // Якщо немає відключення
    if (!outage || !outage.showCurOutageParam) {
      // Якщо було активне повідомлення - відмічаємо як завершене
      if (last_message_id) {
        await notifyOutageEnded(apiSub, subscription);
        await clearDtekAlertState(telegram_id);
      }
      return;
    }

    // Є активне відключення
    const { startDate, endDate, subType, updateTimestamp } = outage;

    // Перевіряємо чи це нове відключення або оновлення
    if (!last_message_id) {
      // Нове відключення
      await sendNewOutage(apiSub, subscription, outage, region);
    } else {
      // Перевіряємо чи змінилися дати
      const datesChanged = (prev_start_date !== startDate) || (prev_end_date !== endDate);
      
      if (datesChanged) {
        // Зміна дат - відправляємо оновлення
        await sendOutageUpdate(apiSub, subscription, outage, region);
      }
      // Якщо дати не змінилися - нічого не робимо (щоб не спамити)
    }

  } catch (error) {
    logger.error('Error processing subscription', {
      error: error.message,
      userId: telegram_id
    });
  }
}

/**
 * Відправити повідомлення про нове відключення
 */
async function sendNewOutage(apiSub, subscription, outage, region) {
  try {
    const { telegram_id } = subscription;
    const { startDate, endDate, subType } = outage;

    const alertData = {
      description: subType || 'Аварійне відключення',
      address: {
        settlement: subscription.settlement,
        street: subscription.street,
        house: subscription.house
      },
      start_date: startDate,
      end_date: endDate,
      region_name: region.name
    };

    // Відправляємо webhook
    await sendDtekAlert(
      apiSub.webhook_url,
      telegram_id,
      subscription.dtek_region,
      null, // queue - не використовується для DTEK
      'emergency_on',
      alertData
    );

    // Зберігаємо стан (використовуємо placeholder message_id для API)
    await saveDtekAlertState(
      telegram_id,
      API_PLACEHOLDER_MESSAGE_ID,
      JSON.stringify(alertData),
      startDate,
      endDate,
      outage.updateTimestamp
    );

    logger.info('Sent new outage notification via webhook', { userId: telegram_id });

  } catch (error) {
    logger.error('Error sending new outage', {
      error: error.message,
      userId: subscription.telegram_id
    });
  }
}

/**
 * Відправити оновлення про відключення
 */
async function sendOutageUpdate(apiSub, subscription, outage, region) {
  try {
    const { telegram_id } = subscription;
    const { startDate, endDate, subType } = outage;

    const alertData = {
      description: subType || 'Аварійне відключення',
      address: {
        settlement: subscription.settlement,
        street: subscription.street,
        house: subscription.house
      },
      start_date: startDate,
      end_date: endDate,
      region_name: region.name,
      previous_dates: {
        start: subscription.prev_start_date,
        end: subscription.prev_end_date
      }
    };

    // Відправляємо webhook
    await sendDtekAlert(
      apiSub.webhook_url,
      telegram_id,
      subscription.dtek_region,
      null,
      'emergency_update',
      alertData
    );

    // Оновлюємо стан
    await saveDtekAlertState(
      telegram_id,
      API_PLACEHOLDER_MESSAGE_ID,
      JSON.stringify(alertData),
      startDate,
      endDate,
      outage.updateTimestamp
    );

    logger.info('Sent outage update via webhook', { userId: telegram_id });

  } catch (error) {
    logger.error('Error sending outage update', {
      error: error.message,
      userId: subscription.telegram_id
    });
  }
}

/**
 * Повідомити про завершення відключення
 */
async function notifyOutageEnded(apiSub, subscription) {
  try {
    const { telegram_id } = subscription;

    const alertData = {
      description: 'Відключення завершено',
      address: {
        settlement: subscription.settlement,
        street: subscription.street,
        house: subscription.house
      }
    };

    // Відправляємо webhook
    await sendDtekAlert(
      apiSub.webhook_url,
      telegram_id,
      subscription.dtek_region,
      null,
      'emergency_off',
      alertData
    );

    logger.info('Notified outage ended via webhook', { userId: telegram_id });

  } catch (error) {
    logger.error('Error notifying outage ended', {
      error: error.message,
      userId: subscription.telegram_id
    });
  }
}

/**
 * Повідомити підписника про помилку
 */
async function notifySubscriberError(subscription, error) {
  try {
    const apiSub = await getApiSubscription(subscription.telegram_id);
    
    if (!apiSub || !apiSub.webhook_url) {
      return;
    }

    const alertData = {
      description: 'Помилка при перевірці відключення',
      error: error.message,
      address: {
        settlement: subscription.settlement,
        street: subscription.street,
        house: subscription.house
      }
    };

    await sendDtekAlert(
      apiSub.webhook_url,
      subscription.telegram_id,
      subscription.dtek_region,
      null,
      'error',
      alertData
    );

  } catch (err) {
    logger.error('Error notifying subscriber about error', {
      error: err.message,
      userId: subscription.telegram_id
    });
  }
}

/**
 * Затримка
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startDtekMonitoring,
  stopDtekMonitoring,
  checkAllSubscriptions
};
