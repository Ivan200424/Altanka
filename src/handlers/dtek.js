const { DTEK_REGIONS } = require('../services/dtekScraper');
const { 
  upsertDtekSubscription, 
  getDtekSubscription, 
  deactivateDtekSubscription,
  clearDtekAlertState
} = require('../database/dtekAlerts');
const { createLogger } = require('../utils/logger');
const { safeSendMessage, safeEditMessageText, safeAnswerCallbackQuery } = require('../utils/errorHandler');

const logger = createLogger('DtekHandler');

// Map для зберігання wizard станів
const dtekWizardStates = new Map();

// Час очищення старих станів (30 хвилин)
const WIZARD_STATE_TIMEOUT = 30 * 60 * 1000;

// Періодична очистка старих станів
setInterval(() => {
  const now = Date.now();
  for (const [userId, state] of dtekWizardStates.entries()) {
    if (now - state.timestamp > WIZARD_STATE_TIMEOUT) {
      dtekWizardStates.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Кожні 5 хвилин

/**
 * Перевірити чи користувач в wizard стані
 * @param {string} userId - Telegram ID користувача
 * @returns {boolean}
 */
function isInDtekWizard(userId) {
  return dtekWizardStates.has(String(userId));
}

/**
 * Встановити wizard стан
 */
function setDtekWizardState(userId, regionKey) {
  dtekWizardStates.set(String(userId), {
    regionKey,
    timestamp: Date.now()
  });
}

/**
 * Отримати wizard стан
 */
function getDtekWizardState(userId) {
  return dtekWizardStates.get(String(userId));
}

/**
 * Очистити wizard стан
 */
function clearDtekWizardState(userId) {
  dtekWizardStates.delete(String(userId));
}

/**
 * Обробити команду /dtek
 * @param {Object} bot - Інстанс бота
 * @param {Object} msg - Повідомлення від користувача
 */
async function handleDtek(bot, msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  try {
    // Перевіряємо чи є у користувача активна підписка
    const subscription = await getDtekSubscription(userId);

    let message = '<b>⚡ ДТЕК Екстрені Відключення</b>\n\n';
    message += 'Моніторинг екстрених відключень електроенергії з сайтів ДТЕК.\n\n';
    message += 'Оберіть ваш регіон для налаштування сповіщень:';

    const keyboard = createRegionKeyboard(subscription);

    await safeSendMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    logger.info('DTEK command handled', { userId });

  } catch (error) {
    logger.error('Error handling /dtek command', {
      error: error.message,
      userId
    });

    await safeSendMessage(bot, chatId, '❌ Помилка при обробці команди. Спробуйте ще раз.', {
      parse_mode: 'HTML'
    });
  }
}

/**
 * Створити клавіатуру для вибору регіону
 */
function createRegionKeyboard(subscription) {
  const buttons = [];

  // Кнопки регіонів по 2 в ряд
  const regions = Object.entries(DTEK_REGIONS);
  for (let i = 0; i < regions.length; i += 2) {
    const row = [];
    
    row.push({
      text: regions[i][1].name,
      callback_data: `dtek_region_${regions[i][0]}`
    });
    
    if (i + 1 < regions.length) {
      row.push({
        text: regions[i + 1][1].name,
        callback_data: `dtek_region_${regions[i + 1][0]}`
      });
    }
    
    buttons.push(row);
  }

  // Якщо є активна підписка - додаємо кнопку зупинки
  if (subscription && subscription.is_active) {
    buttons.push([{
      text: '🛑 Зупинити сповіщення',
      callback_data: 'dtek_stop'
    }]);
  }

  buttons.push([{
    text: '← Назад',
    callback_data: 'dtek_back'
  }]);

  return { inline_keyboard: buttons };
}

/**
 * Обробити callback запити DTEK
 * @param {Object} bot - Інстанс бота
 * @param {Object} query - Callback query
 */
async function handleDtekCallback(bot, query) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);

  try {
    // Вибір регіону
    if (data.startsWith('dtek_region_')) {
      const regionKey = data.replace('dtek_region_', '');
      const region = DTEK_REGIONS[regionKey];

      if (!region) {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: '❌ Невідомий регіон',
          show_alert: true
        });
        return;
      }

      // Зберігаємо стан wizard
      setDtekWizardState(userId, regionKey);

      // Відповідаємо на callback
      await bot.answerCallbackQuery(query.id).catch(() => {});

      // Запитуємо адресу з відповідним форматом
      let message = `<b>📍 ${region.name}</b>\n\n`;
      
      if (region.hasSettlement) {
        // Для обласних регіонів: 3 поля
        message += `Введіть адресу у форматі:\n`;
        message += `<code>населений_пункт, вулиця, номер_будинку</code>\n\n`;
        message += `Наприклад:\n`;
        message += `<code>Нижча Дубечня, Деснянська, 1</code>\n`;
        message += `<code>Бориспіль, Київський Шлях, 5А</code>`;
      } else {
        // Для міських регіонів: 2 поля
        message += `Введіть адресу у форматі:\n`;
        message += `<code>вулиця номер_будинку</code>\n\n`;
        message += `Наприклад:\n`;
        message += `<code>Хрещатик 10</code>\n`;
        message += `<code>вул. Січових Стрільців 5А</code>`;
      }

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Назад', callback_data: 'dtek_setup' }]
          ]
        }
      });

      logger.info('Region selected, waiting for address', { userId, regionKey });
      return;
    }

    // Зупинити сповіщення
    if (data === 'dtek_stop') {
      await bot.answerCallbackQuery(query.id).catch(() => {});

      const subscription = await getDtekSubscription(userId);
      
      if (!subscription || !subscription.is_active) {
        await safeAnswerCallbackQuery(bot, query.id, {
          text: 'У вас немає активної підписки',
          show_alert: true
        });
        return;
      }

      // Деактивуємо підписку
      await deactivateDtekSubscription(userId);
      await clearDtekAlertState(userId);

      const message = 
        '<b>✅ Сповіщення зупинено</b>\n\n' +
        'Ви більше не отримуватимете сповіщення про екстрені відключення.\n\n' +
        'Ви можете налаштувати сповіщення знову в будь-який час.';

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚙️ Налаштувати знову', callback_data: 'dtek_setup' }],
            [{ text: '← Назад', callback_data: 'dtek_back' }]
          ]
        }
      });

      logger.info('Subscription stopped', { userId });
      return;
    }

    // Повернутися до налаштування
    if (data === 'dtek_setup') {
      await bot.answerCallbackQuery(query.id).catch(() => {});

      // Очищаємо wizard стан
      clearDtekWizardState(userId);

      // Показуємо меню вибору регіону
      const subscription = await getDtekSubscription(userId);

      let message = '<b>⚡ ДТЕК Екстрені Відключення</b>\n\n';
      message += 'Моніторинг екстрених відключень електроенергії з сайтів ДТЕК.\n\n';
      message += 'Оберіть ваш регіон для налаштування сповіщень:';

      const keyboard = createRegionKeyboard(subscription);

      await safeEditMessageText(bot, message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

      return;
    }

    // Назад до головного меню (якщо потрібно)
    if (data === 'dtek_back') {
      await bot.answerCallbackQuery(query.id).catch(() => {});

      // Очищаємо wizard стан
      clearDtekWizardState(userId);

      // Видаляємо повідомлення
      await bot.deleteMessage(chatId, messageId).catch(() => {});

      logger.info('Returned from DTEK menu', { userId });
      return;
    }

  } catch (error) {
    logger.error('Error handling DTEK callback', {
      error: error.message,
      data,
      userId
    });

    await safeAnswerCallbackQuery(bot, query.id, {
      text: '❌ Помилка обробки. Спробуйте ще раз.',
      show_alert: true
    });
  }
}

/**
 * Обробити введення адреси
 * @param {Object} bot - Інстанс бота
 * @param {Object} msg - Повідомлення від користувача
 * @returns {Promise<boolean>} - true якщо повідомлення оброблено
 */
async function handleDtekAddressInput(bot, msg) {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!isInDtekWizard(userId) || !text) {
    return false;
  }

  try {
    const wizardState = getDtekWizardState(userId);
    const { regionKey } = wizardState;
    const region = DTEK_REGIONS[regionKey];

    let settlement = null;
    let street = null;
    let house = null;

    // Парсимо адресу залежно від типу регіону
    if (region.hasSettlement) {
      // Для обласних регіонів: "населений_пункт, вулиця, номер_будинку"
      // Підтримувані формати номерів: 10, 10А, 10-А, 5/7, 10а/2
      const addressMatch = text.match(/^([^,]+),\s*([^,]+),\s*([\d]+[а-яіїєґА-ЯІЇЄҐA-Za-z\d\-\/]*)$/i);

      if (!addressMatch) {
        await safeSendMessage(bot, chatId, 
          '❌ Невірний формат адреси.\n\n' +
          'Введіть адресу у форматі:\n' +
          '<code>населений_пункт, вулиця, номер_будинку</code>\n\n' +
          'Наприклад: <code>Нижча Дубечня, Деснянська, 1</code>',
          { parse_mode: 'HTML' }
        );
        return true;
      }

      settlement = addressMatch[1].trim();
      street = addressMatch[2].trim();
      house = addressMatch[3].trim();
    } else {
      // Для міських регіонів: "вулиця номер"
      const addressMatch = text.match(/^(.+)\s+([\d]+[а-яіїєґА-ЯІЇЄҐA-Za-z\d\-\/]*)$/i);

      if (!addressMatch) {
        await safeSendMessage(bot, chatId, 
          '❌ Невірний формат адреси.\n\n' +
          'Введіть адресу у форматі:\n' +
          '<code>вулиця номер_будинку</code>\n\n' +
          'Наприклад: <code>Хрещатик 10</code>',
          { parse_mode: 'HTML' }
        );
        return true;
      }

      street = addressMatch[1].trim();
      house = addressMatch[2].trim();
    }

    // Видаляємо префікс "вул." якщо є
    const cleanStreet = street.replace(/^(вул\.|вулиця)\s*/i, '').trim();

    logger.info('Address parsed', { userId, settlement, street: cleanStreet, house, regionKey });

    // Показуємо повідомлення про обробку
    const processingMsg = await safeSendMessage(bot, chatId,
      '⏳ <b>Перевіряю адресу...</b>\n\n' +
      `📍 ${region.name}\n` +
      `🏠 ${settlement ? settlement + ', ' : ''}${cleanStreet} ${house}\n\n` +
      'Це може зайняти до 30 секунд.',
      { parse_mode: 'HTML' }
    );

    try {
      // Тестуємо скрапінг для цієї адреси
      const { getDtekScraper } = require('../services/dtekScraper');
      const scraper = getDtekScraper();
      
      await scraper.scrapCurrentOutage(regionKey, cleanStreet, house, settlement);

      // Зберігаємо підписку
      await upsertDtekSubscription(userId, regionKey, cleanStreet, house, settlement);

      // Очищаємо wizard стан
      clearDtekWizardState(userId);

      // Відправляємо підтвердження
      await bot.editMessageText(
        '✅ <b>Сповіщення налаштовано!</b>\n\n' +
        `📍 Регіон: ${region.name}\n` +
        `🏠 Адреса: ${settlement ? settlement + ', ' : ''}${cleanStreet} ${house}\n\n` +
        'Ви отримуватимете сповіщення про екстрені відключення електроенергії на цій адресі.\n\n' +
        '🔄 Перевірка кожні 5 хвилин.',
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚙️ Змінити налаштування', callback_data: 'dtek_setup' }]
            ]
          }
        }
      );

      logger.success('DTEK subscription created', { userId, regionKey, settlement, street: cleanStreet, house });

    } catch (error) {
      logger.error('Error setting up DTEK subscription', {
        error: error.message,
        userId,
        regionKey,
        street: cleanStreet,
        house
      });

      await bot.editMessageText(
        '❌ <b>Помилка налаштування</b>\n\n' +
        'Не вдалося знайти вказану адресу на сайті ДТЕК.\n\n' +
        'Перевірте правильність адреси та спробуйте ще раз.\n\n' +
        `Формат: <code>вулиця номер_будинку</code>`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Спробувати ще раз', callback_data: `dtek_region_${regionKey}` }],
              [{ text: '← Назад', callback_data: 'dtek_setup' }]
            ]
          }
        }
      );
    }

    return true;

  } catch (error) {
    logger.error('Error handling DTEK address input', {
      error: error.message,
      userId
    });

    await safeSendMessage(bot, chatId, 
      '❌ Помилка обробки адреси. Спробуйте ще раз.',
      { parse_mode: 'HTML' }
    );

    return true;
  }
}

module.exports = {
  handleDtek,
  handleDtekCallback,
  handleDtekAddressInput,
  isInDtekWizard
};
