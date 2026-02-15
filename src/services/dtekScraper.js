const { chromium } = require('playwright');
const { createLogger } = require('../utils/logger');
const { getDtekApiClient } = require('./dtekApiClient');

const logger = createLogger('DtekScraper');

// Конфігурація регіонів ДТЕК
const DTEK_REGIONS = {
  kyiv_city: {
    name: '🏙️ Київ (місто)',
    domain: 'www.dtek-kem.com.ua',
    url: 'https://www.dtek-kem.com.ua/ua/shutdowns',
    hasSettlement: false
  },
  kyiv_oblast: {
    name: '🌾 Київщина (обл)',
    domain: 'www.dtek-krem.com.ua',
    url: 'https://www.dtek-krem.com.ua/ua/shutdowns',
    hasSettlement: true
  },
  dnipro: {
    name: '🏭 Дніпропетровщина',
    domain: 'www.dtek-dnem.com.ua',
    url: 'https://www.dtek-dnem.com.ua/ua/shutdowns',
    hasSettlement: true
  },
  odesa: {
    name: '🌊 Одещина',
    domain: 'www.dtek-oem.com.ua',
    url: 'https://www.dtek-oem.com.ua/ua/shutdowns',
    hasSettlement: true
  }
};

/**
 * Скрапер для отримання інформації про відключення з сайтів ДТЕК
 */
class DtekScraper {
  constructor() {
    this.browser = null;
  }

  /**
   * Отримати інформацію про регіон
   * @param {string} regionKey - Ключ регіону
   * @returns {Object|null} - Інформація про регіон
   */
  getRegion(regionKey) {
    return DTEK_REGIONS[regionKey] || null;
  }

  /**
   * Отримати список доступних регіонів
   * @returns {Array} - Масив регіонів з ключами та назвами
   */
  getAvailableRegions() {
    return Object.entries(DTEK_REGIONS).map(([key, value]) => ({
      key,
      name: value.name
    }));
  }

  /**
   * Скрапити поточні відключення для адреси
   * Спочатку спробує прямий API запит, якщо не вдається — фолбек на браузер
   * @param {string} regionKey - Ключ регіону (kyiv_city, kyiv_oblast, dnipro, odesa)
   * @param {string} street - Назва вулиці
   * @param {string} house - Номер будинку
   * @param {string} settlement - Населений пункт (опціонально, для обласних регіонів)
   * @returns {Promise<Object>} - { outage, screenshot, source }
   */
  async scrapCurrentOutage(regionKey, street, house, settlement = null) {
    const region = this.getRegion(regionKey);
    if (!region) {
      throw new Error(`Unknown region: ${regionKey}`);
    }

    logger.info(`Checking ${region.name} - ${settlement ? settlement + ', ' : ''}${street} ${house}`);

    // Спробуємо спочатку прямий API запит (швидше та легше)
    try {
      const apiClient = getDtekApiClient();
      const result = await apiClient.fetchOutage(regionKey, street, house, settlement);
      logger.info('Data fetched via direct API', { regionKey, hasOutage: !!result.outage });
      return result;
    } catch (apiError) {
      logger.warn('Direct API failed, falling back to browser scraping', {
        regionKey,
        error: apiError.message
      });
    }

    // Фолбек: використовуємо Playwright браузер
    return this._scrapWithBrowser(regionKey, street, house, settlement);
  }

  /**
   * Скрапити відключення через Playwright браузер (фолбек)
   * @param {string} regionKey - Ключ регіону
   * @param {string} street - Назва вулиці
   * @param {string} house - Номер будинку
   * @param {string} settlement - Населений пункт
   * @returns {Promise<Object>} - { outage, screenshot, source }
   */
  async _scrapWithBrowser(regionKey, street, house, settlement = null) {
    const region = this.getRegion(regionKey);

    logger.info(`Browser scraping ${region.name} - ${settlement ? settlement + ', ' : ''}${street} ${house}`);

    let browser = null;
    let context = null;
    
    try {
      // Запускаємо браузер
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // Створюємо контекст з налаштуваннями
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'uk-UA',
        timezoneId: 'Europe/Kyiv',
        viewport: { width: 1280, height: 720 }
      });

      const page = await context.newPage();

      // Змінна для зберігання AJAX відповіді
      let ajaxData = null;

      // Перехоплення AJAX відповіді
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/ua/ajax') && response.status() === 200) {
          try {
            const json = await response.json();
            ajaxData = json;
            logger.debug('AJAX response captured', { data: json });
          } catch (err) {
            logger.warn('Failed to parse AJAX response', { error: err.message });
          }
        }
      });

      // Переходимо на сторінку
      await page.goto(region.url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Закрити модальне вікно якщо є
      try {
        const modal = await page.locator('div#modal-attention.is-open').first();
        if (await modal.isVisible({ timeout: 2000 })) {
          const closeButton = await modal.locator('button.modal__close').first();
          await closeButton.click();
          await page.waitForTimeout(500);
          logger.debug('Closed modal window');
        }
      } catch (err) {
        // Модальне вікно не знайдено або вже закрите
        logger.debug('No modal window to close');
      }

      // Для обласних регіонів спочатку вводимо населений пункт
      if (region.hasSettlement && settlement) {
        logger.debug('Filling settlement field', { settlement });
        
        // Пробуємо різні можливі селектори для поля населеного пункту
        const settlementSelectors = ['input#city', 'input#settlement', 'input#locality'];
        let settlementFilled = false;
        
        for (const selector of settlementSelectors) {
          try {
            const settlementInput = await page.locator(selector).first();
            if (await settlementInput.isVisible({ timeout: 1000 })) {
              await settlementInput.fill(settlement);
              await page.waitForTimeout(1000);
              
              // Вибрати населений пункт зі списку
              try {
                const inputId = await settlementInput.getAttribute('id');
                const settlementList = await page.locator(`div#${inputId}autocomplete-list`).first();
                await settlementList.waitFor({ state: 'visible', timeout: 3000 });
                const firstOption = await settlementList.locator('div').first();
                await firstOption.click();
                await page.waitForTimeout(500);
                logger.debug('Selected settlement from autocomplete');
                settlementFilled = true;
                break;
              } catch (err) {
                logger.warn('Failed to select settlement from autocomplete', { error: err.message });
              }
            }
          } catch (err) {
            // Спробувати наступний селектор
            continue;
          }
        }
        
        if (!settlementFilled) {
          throw new Error('Не вдалося знайти або заповнити поле населеного пункту');
        }
      }

      // Ввести вулицю
      const streetInput = await page.locator('input#street').first();
      await streetInput.fill(street);
      await page.waitForTimeout(1000); // Чекаємо на autocomplete

      // Вибрати вулицю зі списку
      try {
        const streetList = await page.locator('div#streetautocomplete-list').first();
        await streetList.waitFor({ state: 'visible', timeout: 3000 });
        const firstOption = await streetList.locator('div').first();
        await firstOption.click();
        await page.waitForTimeout(500);
        logger.debug('Selected street from autocomplete');
      } catch (err) {
        logger.warn('Failed to select street from autocomplete', { error: err.message });
        throw new Error('Не вдалося знайти вулицю в списку');
      }

      // Ввести будинок
      const houseInput = await page.locator('input#house_num').first();
      await houseInput.fill(house);
      await page.waitForTimeout(1000); // Чекаємо на autocomplete

      // Вибрати будинок зі списку
      try {
        const houseList = await page.locator('div#house_numautocomplete-list').first();
        await houseList.waitFor({ state: 'visible', timeout: 3000 });
        const firstOption = await houseList.locator('div').first();
        await firstOption.click();
        await page.waitForTimeout(1500); // Чекаємо на завантаження даних
        logger.debug('Selected house from autocomplete');
      } catch (err) {
        logger.warn('Failed to select house from autocomplete', { error: err.message });
        throw new Error('Не вдалося знайти будинок в списку');
      }

      // Чекаємо на AJAX відповідь
      await page.waitForTimeout(1000);

      if (!ajaxData) {
        logger.warn('No AJAX data captured');
        return {
          outage: null,
          screenshot: null,
          source: 'browser'
        };
      }

      // Перевірити наявність картки відключення
      let screenshot = null;
      try {
        const card = await page.locator('div#showCurOutage.active').first();
        if (await card.isVisible({ timeout: 2000 })) {
          screenshot = await card.screenshot({ type: 'png' });
          logger.debug('Screenshot captured');
        }
      } catch (err) {
        logger.debug('No active outage card to screenshot');
      }

      // Парсимо дані з AJAX
      const outage = this._parseAjaxData(ajaxData);

      logger.info('Scraping completed successfully', { 
        hasOutage: !!outage,
        hasScreenshot: !!screenshot 
      });

      return {
        outage,
        screenshot,
        source: 'browser'
      };

    } catch (error) {
      logger.error('Scraping error', { 
        error: error.message, 
        stack: error.stack,
        regionKey,
        street,
        house
      });
      throw error;
    } finally {
      // Завжди закриваємо браузер
      if (context) {
        await context.close().catch(err => 
          logger.error('Error closing context', { error: err.message })
        );
      }
      if (browser) {
        await browser.close().catch(err => 
          logger.error('Error closing browser', { error: err.message })
        );
      }
    }
  }

  /**
   * Парсити дані з AJAX відповіді
   * @param {Object} ajaxData - Дані з AJAX
   * @returns {Object|null} - Розпарсені дані відключення
   * @private
   */
  _parseAjaxData(ajaxData) {
    if (!ajaxData || !ajaxData.data) {
      return null;
    }

    const { updateTimestamp, showCurOutageParam, data } = ajaxData;

    // Якщо немає активного відключення
    if (!showCurOutageParam) {
      return null;
    }

    // Знайти перший будинок з даними
    const houseKeys = Object.keys(data);
    if (houseKeys.length === 0) {
      return null;
    }

    const firstHouseData = data[houseKeys[0]];
    if (!firstHouseData) {
      return null;
    }

    return {
      updateTimestamp: updateTimestamp || null,
      showCurOutageParam: showCurOutageParam || false,
      startDate: firstHouseData.start_date || null,
      endDate: firstHouseData.end_date || null,
      subType: firstHouseData.sub_type || null,
      type: firstHouseData.type || null
    };
  }
}

// Singleton instance
let scraperInstance = null;

/**
 * Отримати singleton instance скрапера
 * @returns {DtekScraper}
 */
function getDtekScraper() {
  if (!scraperInstance) {
    scraperInstance = new DtekScraper();
  }
  return scraperInstance;
}

module.exports = {
  DtekScraper,
  getDtekScraper,
  DTEK_REGIONS
};
