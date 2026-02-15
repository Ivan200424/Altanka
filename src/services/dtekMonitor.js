const { getDtekScraper, DTEK_REGIONS } = require('./dtekScraper');
const { 
  getActiveDtekSubscriptions, 
  saveDtekAlertState, 
  clearDtekAlertState 
} = require('../database/dtekAlerts');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DtekMonitor');

// Інтервал перевірки - 5 хвилин
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Пауза між скрапінгом різних адрес - 5 секунд
const DELAY_BETWEEN_SCRAPES_MS = 5 * 1000;

let monitoringInterval = null;
let botInstance = null;
let isRunning = false;

/**
 * Запустити моніторинг ДТЕК
 * @param {Object} bot - Інстанс Telegram бота
 */
async function startDtekMonitoring(bot) {
  if (isRunning) {
    logger.warn('DTEK monitoring is already running');
    return;
  }

  botInstance = bot;
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
  if (!isRunning || !botInstance) {
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

    // Групування підписників по адресі (region|street|house)
    const addressGroups = new Map();
    
    for (const sub of subscriptions) {
      const addressKey = `${sub.dtek_region}|${sub.street}|${sub.house}`;
      
      if (!addressGroups.has(addressKey)) {
        addressGroups.set(addressKey, []);
      }
      
      addressGroups.get(addressKey).push(sub);
    }

    logger.info(`Grouped into ${addressGroups.size} unique addresses`);

    // Обробляємо кожну унікальну адресу
    let index = 0;
    for (const [addressKey, subs] of addressGroups.entries()) {
      const [regionKey, street, house] = addressKey.split('|');
      
      try {
        logger.info(`Checking address ${index + 1}/${addressGroups.size}`, {
          region: regionKey,
          street,
          house,
          subscribers: subs.length
        });

        // Скрапимо дані один раз для цієї адреси
        const scraper = getDtekScraper();
        const { outage, screenshot } = await scraper.scrapCurrentOutage(regionKey, street, house);

        // Розсилаємо результат всім підписникам з цією адресою
        for (const sub of subs) {
          await processSubscription(sub, outage, screenshot, regionKey);
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
 * @param {Buffer|null} screenshot - Скріншот картки
 * @param {string} regionKey - Ключ регіону
 */
async function processSubscription(subscription, outage, screenshot, regionKey) {
  const { telegram_id, last_message_id, prev_start_date, prev_end_date } = subscription;
  const region = DTEK_REGIONS[regionKey];

  try {
    // Якщо немає відключення
    if (!outage || !outage.showCurOutageParam) {
      // Якщо було активне повідомлення - відмічаємо як завершене
      if (last_message_id) {
        await notifyOutageEnded(telegram_id, last_message_id, subscription);
        await clearDtekAlertState(telegram_id);
      }
      return;
    }

    // Є активне відключення
    const { startDate, endDate, subType, updateTimestamp } = outage;

    // Формуємо текст повідомлення
    const messageText = formatOutageMessage(region.name, subscription, outage);

    // Перевіряємо чи це нове відключення або оновлення
    if (!last_message_id) {
      // Нове відключення - відправляємо з фото
      await sendNewOutage(telegram_id, screenshot, messageText, outage, subscription);
    } else {
      // Перевіряємо чи змінилися дати
      const datesChanged = (prev_start_date !== startDate) || (prev_end_date !== endDate);
      
      if (datesChanged) {
        // Зміна дат - закреслюємо старе, відправляємо нове
        await updateOutageWithChanges(telegram_id, last_message_id, screenshot, messageText, outage, subscription);
      } else {
        // Той самий період - просто оновлюємо повідомлення
        await updateOutageMessage(telegram_id, last_message_id, screenshot, messageText, outage, subscription);
      }
    }

  } catch (error) {
    logger.error('Error processing subscription', {
      error: error.message,
      telegramId: telegram_id
    });
  }
}

/**
 * Відправити нове повідомлення про відключення
 */
async function sendNewOutage(telegramId, screenshot, messageText, outage, subscription) {
  try {
    let sentMessage;
    
    if (screenshot) {
      sentMessage = await botInstance.sendPhoto(telegramId, screenshot, {
        caption: messageText,
        parse_mode: 'HTML'
      });
    } else {
      sentMessage = await botInstance.sendMessage(telegramId, messageText, {
        parse_mode: 'HTML'
      });
    }

    // Зберігаємо стан
    await saveDtekAlertState(
      telegramId,
      sentMessage.message_id,
      messageText,
      outage.startDate,
      outage.endDate,
      outage.updateTimestamp
    );

    logger.info('Sent new outage notification', { telegramId });

  } catch (error) {
    logger.error('Error sending new outage', {
      error: error.message,
      telegramId
    });
  }
}

/**
 * Оновити повідомлення про відключення
 */
async function updateOutageMessage(telegramId, messageId, screenshot, messageText, outage, subscription) {
  try {
    if (screenshot) {
      // Оновлюємо медіа
      await botInstance.editMessageMedia(
        {
          type: 'photo',
          media: screenshot,
          caption: messageText,
          parse_mode: 'HTML'
        },
        {
          chat_id: telegramId,
          message_id: messageId
        }
      ).catch(async (error) => {
        // Якщо не вдалося оновити медіа, спробуємо caption
        if (error.message.includes('media')) {
          await botInstance.editMessageCaption(messageText, {
            chat_id: telegramId,
            message_id: messageId,
            parse_mode: 'HTML'
          });
        }
      });
    } else {
      // Оновлюємо тільки текст
      await botInstance.editMessageText(messageText, {
        chat_id: telegramId,
        message_id: messageId,
        parse_mode: 'HTML'
      });
    }

    // Оновлюємо стан
    await saveDtekAlertState(
      telegramId,
      messageId,
      messageText,
      outage.startDate,
      outage.endDate,
      outage.updateTimestamp
    );

    logger.debug('Updated outage message', { telegramId });

  } catch (error) {
    // Якщо повідомлення не змінилося - ігноруємо помилку
    if (!error.message.includes('message is not modified')) {
      logger.error('Error updating outage message', {
        error: error.message,
        telegramId
      });
    }
  }
}

/**
 * Оновити повідомлення зі зміною дат
 */
async function updateOutageWithChanges(telegramId, messageId, screenshot, messageText, outage, subscription) {
  try {
    // Закреслюємо старе повідомлення
    const oldText = subscription.prev_text || '';
    const cleanText = stripHtml(oldText);
    const strikethroughText = `<del>${cleanText}</del>\n\n⚠️ <b>Час змінено!</b>`;
    
    await botInstance.editMessageCaption(strikethroughText, {
      chat_id: telegramId,
      message_id: messageId,
      parse_mode: 'HTML'
    }).catch(() => {
      // Якщо не вдалося змінити caption, пробуємо text
      botInstance.editMessageText(strikethroughText, {
        chat_id: telegramId,
        message_id: messageId,
        parse_mode: 'HTML'
      }).catch(e => logger.warn('Failed to edit old message', { error: e.message }));
    });

    // Відправляємо нове повідомлення
    await sendNewOutage(telegramId, screenshot, messageText, outage, subscription);

    logger.info('Updated outage with date changes', { telegramId });

  } catch (error) {
    logger.error('Error updating outage with changes', {
      error: error.message,
      telegramId
    });
  }
}

/**
 * Видалити HTML теги з тексту
 * @param {string} html - Текст з HTML тегами
 * @returns {string} - Текст без HTML тегів
 */
function stripHtml(html) {
  if (!html) return '';
  // Замінюємо HTML теги пробілами, потім очищаємо зайві пробіли
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Повідомити про завершення відключення
 */
async function notifyOutageEnded(telegramId, messageId, subscription) {
  try {
    const oldText = subscription.prev_text || '';
    const cleanText = stripHtml(oldText);
    const endedText = `<del>${cleanText}</del>\n\n✅ <b>Відключення завершено</b>`;
    
    await botInstance.editMessageCaption(endedText, {
      chat_id: telegramId,
      message_id: messageId,
      parse_mode: 'HTML'
    }).catch(() => {
      // Якщо не вдалося змінити caption, пробуємо text
      botInstance.editMessageText(endedText, {
        chat_id: telegramId,
        message_id: messageId,
        parse_mode: 'HTML'
      }).catch(e => logger.warn('Failed to mark outage as ended', { error: e.message }));
    });

    logger.info('Notified outage ended', { telegramId });

  } catch (error) {
    logger.error('Error notifying outage ended', {
      error: error.message,
      telegramId
    });
  }
}

/**
 * Повідомити підписника про помилку
 */
async function notifySubscriberError(subscription, error) {
  try {
    const errorText = 
      '⚠️ <b>Помилка при перевірці відключення</b>\n\n' +
      `Не вдалося отримати дані для адреси:\n` +
      `${subscription.street} ${subscription.house}\n\n` +
      `Спробуємо ще раз через кілька хвилин.`;

    await botInstance.sendMessage(subscription.telegram_id, errorText, {
      parse_mode: 'HTML'
    });

  } catch (err) {
    logger.error('Error notifying subscriber about error', {
      error: err.message,
      telegramId: subscription.telegram_id
    });
  }
}

/**
 * Форматувати повідомлення про відключення
 */
function formatOutageMessage(regionName, subscription, outage) {
  const { street, house } = subscription;
  const { startDate, endDate, subType, updateTimestamp } = outage;

  let message = `<b>⚡ Екстрене відключення — ${regionName}</b>\n\n`;
  message += `<blockquote>📍 ${street} ${house}</blockquote>\n\n`;
  
  if (subType) {
    message += `⚠️ Тип: ${subType}\n`;
  }
  
  if (startDate && endDate) {
    message += `🕐 Період: <b>${startDate} — ${endDate}</b>\n`;
  } else if (startDate) {
    message += `🕐 Початок: <b>${startDate}</b>\n`;
  }
  
  if (updateTimestamp) {
    message += `\n🔄 Оновлено: ${updateTimestamp}`;
  }

  return message;
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
