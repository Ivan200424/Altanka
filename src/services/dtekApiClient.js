const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DtekApiClient');

// Конфігурація регіонів ДТЕК з API ендпоінтами
const DTEK_API_REGIONS = {
  kyiv_city: {
    name: '🏙️ Київ (місто)',
    domain: 'www.dtek-kem.com.ua',
    baseUrl: 'https://www.dtek-kem.com.ua',
    ajaxUrl: 'https://www.dtek-kem.com.ua/ua/ajax',
    shutdownsUrl: 'https://www.dtek-kem.com.ua/ua/shutdowns',
    hasSettlement: false
  },
  kyiv_oblast: {
    name: '🌾 Київщина (обл)',
    domain: 'www.dtek-krem.com.ua',
    baseUrl: 'https://www.dtek-krem.com.ua',
    ajaxUrl: 'https://www.dtek-krem.com.ua/ua/ajax',
    shutdownsUrl: 'https://www.dtek-krem.com.ua/ua/shutdowns',
    hasSettlement: true
  },
  dnipro: {
    name: '🏭 Дніпропетровщина',
    domain: 'www.dtek-dnem.com.ua',
    baseUrl: 'https://www.dtek-dnem.com.ua',
    ajaxUrl: 'https://www.dtek-dnem.com.ua/ua/ajax',
    shutdownsUrl: 'https://www.dtek-dnem.com.ua/ua/shutdowns',
    hasSettlement: true
  },
  odesa: {
    name: '🌊 Одещина',
    domain: 'www.dtek-oem.com.ua',
    baseUrl: 'https://www.dtek-oem.com.ua',
    ajaxUrl: 'https://www.dtek-oem.com.ua/ua/ajax',
    shutdownsUrl: 'https://www.dtek-oem.com.ua/ua/shutdowns',
    hasSettlement: true
  }
};

// HTTP заголовки для імітації браузера
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'X-Requested-With': 'XMLHttpRequest',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

// Таймаут HTTP запитів
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Клієнт для прямого доступу до ДТЕК API
 * Замість Playwright браузера використовує HTTP запити до внутрішнього AJAX API
 */
class DtekApiClient {
  constructor() {
    this.cookieJar = new Map();
  }

  /**
   * Отримати інформацію про регіон
   * @param {string} regionKey - Ключ регіону
   * @returns {Object|null}
   */
  getRegion(regionKey) {
    return DTEK_API_REGIONS[regionKey] || null;
  }

  /**
   * Отримати список доступних регіонів
   * @returns {Array}
   */
  getAvailableRegions() {
    return Object.entries(DTEK_API_REGIONS).map(([key, value]) => ({
      key,
      name: value.name
    }));
  }

  /**
   * Ініціалізувати сесію - отримати cookies з головної сторінки
   * @param {string} regionKey - Ключ регіону
   * @returns {Promise<Object>} - cookies та headers для наступних запитів
   */
  async _initSession(regionKey) {
    const region = this.getRegion(regionKey);
    if (!region) {
      throw new Error(`Unknown region: ${regionKey}`);
    }

    logger.debug('Initializing session', { regionKey, url: region.shutdownsUrl });

    try {
      const response = await axios.get(region.shutdownsUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'X-Requested-With': undefined
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      // Збираємо cookies з відповіді
      const cookies = {};
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        for (const cookieStr of cookieArray) {
          const match = cookieStr.match(/^([^=]+)=([^;]*)/);
          if (match) {
            cookies[match[1]] = match[2];
          }
        }
      }

      this.cookieJar.set(regionKey, cookies);

      logger.debug('Session initialized', {
        regionKey,
        status: response.status,
        cookiesCount: Object.keys(cookies).length
      });

      return cookies;
    } catch (error) {
      logger.warn('Failed to initialize session', {
        regionKey,
        error: error.message
      });
      return {};
    }
  }

  /**
   * Сформувати рядок cookies для запиту
   * @param {string} regionKey - Ключ регіону
   * @returns {string}
   */
  _getCookieString(regionKey) {
    const cookies = this.cookieJar.get(regionKey) || {};
    return Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  /**
   * Викликати AJAX API ДТЕК для отримання даних про відключення
   * @param {string} regionKey - Ключ регіону
   * @param {string} street - Назва вулиці
   * @param {string} house - Номер будинку
   * @param {string} settlement - Населений пункт (для обласних регіонів)
   * @returns {Promise<Object>} - { outage, source: 'api' }
   */
  async fetchOutage(regionKey, street, house, settlement = null) {
    const region = this.getRegion(regionKey);
    if (!region) {
      throw new Error(`Unknown region: ${regionKey}`);
    }

    logger.info(`API request to ${region.name}`, {
      settlement: settlement || undefined,
      street,
      house
    });

    // Ініціалізуємо сесію для отримання cookies
    await this._initSession(regionKey);

    // Формуємо параметри запиту
    const params = {
      street,
      house_num: house
    };

    if (region.hasSettlement && settlement) {
      params.city = settlement;
    }

    try {
      const response = await axios({
        method: 'POST',
        url: region.ajaxUrl,
        headers: {
          ...DEFAULT_HEADERS,
          'Referer': region.shutdownsUrl,
          'Origin': region.baseUrl,
          'Cookie': this._getCookieString(regionKey),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        data: new URLSearchParams(params).toString(),
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        logger.warn('API returned non-200 status', {
          regionKey,
          status: response.status
        });
        throw new Error(`API returned status ${response.status}`);
      }

      const ajaxData = response.data;

      if (!ajaxData || typeof ajaxData !== 'object') {
        logger.warn('API returned non-JSON response', { regionKey });
        throw new Error('API returned non-JSON response');
      }

      logger.debug('API response received', {
        regionKey,
        hasData: !!ajaxData.data,
        hasUpdateTimestamp: !!ajaxData.updateTimestamp
      });

      // Парсимо відповідь
      const outage = this._parseApiResponse(ajaxData, house);

      logger.info('API request completed', {
        regionKey,
        hasOutage: !!outage,
        source: 'api'
      });

      return {
        outage,
        screenshot: null,
        source: 'api'
      };

    } catch (error) {
      // Перевіряємо чи це анти-бот захист
      if (this._isAntiBot(error)) {
        logger.warn('Anti-bot protection detected, API access blocked', {
          regionKey,
          error: error.message
        });
        throw new Error('ANTI_BOT_BLOCKED');
      }

      logger.error('API request failed', {
        regionKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Перевірити чи помилка пов'язана з анти-бот захистом
   * @param {Error} error - Помилка
   * @returns {boolean}
   */
  _isAntiBot(error) {
    if (error.response) {
      const { status, data, headers } = error.response;

      // Imperva/Incapsula повертає 403 або сторінку-челендж
      if (status === 403 || status === 429) {
        return true;
      }

      // Перевіряємо характерні заголовки Incapsula
      const serverHeader = headers && (headers['x-cdn'] || headers['x-iinfo']);
      if (serverHeader) {
        return true;
      }

      // Перевіряємо HTML відповідь замість JSON (challenge page)
      if (typeof data === 'string' && (
        data.includes('_Incapsula_') ||
        data.includes('incapsula') ||
        data.includes('Request unsuccessful')
      )) {
        return true;
      }
    }

    return false;
  }

  /**
   * Парсити відповідь API
   * @param {Object} ajaxData - Дані з API
   * @param {string} house - Номер будинку для пошуку в даних
   * @returns {Object|null}
   */
  _parseApiResponse(ajaxData, house) {
    if (!ajaxData || !ajaxData.data) {
      return null;
    }

    const { updateTimestamp, showCurOutageParam, data } = ajaxData;

    if (!showCurOutageParam) {
      return null;
    }

    // Шукаємо дані для конкретного будинку або беремо перший
    let houseData = data[house] || null;
    if (!houseData) {
      const houseKeys = Object.keys(data);
      if (houseKeys.length === 0) {
        return null;
      }
      houseData = data[houseKeys[0]];
    }

    if (!houseData) {
      return null;
    }

    return {
      updateTimestamp: updateTimestamp || null,
      showCurOutageParam: showCurOutageParam || false,
      startDate: houseData.start_date || null,
      endDate: houseData.end_date || null,
      subType: houseData.sub_type || null,
      type: houseData.type || null
    };
  }
}

// Singleton instance
let apiClientInstance = null;

/**
 * Отримати singleton instance API клієнта
 * @returns {DtekApiClient}
 */
function getDtekApiClient() {
  if (!apiClientInstance) {
    apiClientInstance = new DtekApiClient();
  }
  return apiClientInstance;
}

module.exports = {
  DtekApiClient,
  getDtekApiClient,
  DTEK_API_REGIONS
};
