#!/usr/bin/env node

/**
 * Тест для перевірки функціоналу ДТЕК моніторингу
 * Запуск: node test-dtek.js
 */

console.log('🧪 Тест ДТЕК моніторингу\n');

// Тест 1: Перевірка імпортів
console.log('1️⃣ Перевірка імпортів...');
try {
  const { DtekScraper, getDtekScraper, DTEK_REGIONS } = require('./src/services/dtekScraper');
  const { DtekApiClient, getDtekApiClient, DTEK_API_REGIONS } = require('./src/services/dtekApiClient');
  const dtekAlerts = require('./src/database/dtekAlerts');
  const dtekMonitor = require('./src/services/dtekMonitor');
  const dtekHandler = require('./src/handlers/dtek');
  
  console.log('   ✅ Всі модулі імпортовано успішно');
  
  // Тест 2: Перевірка структури DTEK_REGIONS
  console.log('\n2️⃣ Перевірка структури DTEK_REGIONS...');
  const expectedRegions = ['kyiv_city', 'kyiv_oblast', 'dnipro', 'odesa'];
  const actualRegions = Object.keys(DTEK_REGIONS);
  
  if (actualRegions.length !== expectedRegions.length) {
    throw new Error(`Очікувалося ${expectedRegions.length} регіонів, знайдено ${actualRegions.length}`);
  }
  
  for (const region of expectedRegions) {
    if (!DTEK_REGIONS[region]) {
      throw new Error(`Регіон ${region} не знайдено`);
    }
    
    const regionData = DTEK_REGIONS[region];
    if (!regionData.name || !regionData.domain || !regionData.url) {
      throw new Error(`Неповні дані для регіону ${region}`);
    }
  }
  
  console.log('   ✅ Структура DTEK_REGIONS коректна');
  console.log(`   📍 Знайдено ${actualRegions.length} регіонів:`);
  for (const [key, value] of Object.entries(DTEK_REGIONS)) {
    console.log(`      - ${key}: ${value.name}`);
  }
  
  // Тест 3: Перевірка методів скрапера
  console.log('\n3️⃣ Перевірка методів скрапера...');
  const scraper = getDtekScraper();
  
  if (typeof scraper.getRegion !== 'function') {
    throw new Error('Метод getRegion не знайдено');
  }
  
  if (typeof scraper.getAvailableRegions !== 'function') {
    throw new Error('Метод getAvailableRegions не знайдено');
  }
  
  if (typeof scraper.scrapCurrentOutage !== 'function') {
    throw new Error('Метод scrapCurrentOutage не знайдено');
  }
  
  const availableRegions = scraper.getAvailableRegions();
  if (!Array.isArray(availableRegions) || availableRegions.length !== 4) {
    throw new Error('getAvailableRegions повертає некоректний результат');
  }
  
  console.log('   ✅ Всі методи скрапера присутні та працюють');
  
  // Тест 3.5: Перевірка API клієнта
  console.log('\n3️⃣.5️⃣ Перевірка API клієнта...');
  const apiClient = getDtekApiClient();
  
  if (typeof apiClient.getRegion !== 'function') {
    throw new Error('Метод getRegion не знайдено в API клієнті');
  }
  
  if (typeof apiClient.getAvailableRegions !== 'function') {
    throw new Error('Метод getAvailableRegions не знайдено в API клієнті');
  }
  
  if (typeof apiClient.fetchOutage !== 'function') {
    throw new Error('Метод fetchOutage не знайдено в API клієнті');
  }
  
  if (typeof apiClient._initSession !== 'function') {
    throw new Error('Метод _initSession не знайдено в API клієнті');
  }
  
  if (typeof apiClient._parseApiResponse !== 'function') {
    throw new Error('Метод _parseApiResponse не знайдено в API клієнті');
  }
  
  if (typeof apiClient._isAntiBot !== 'function') {
    throw new Error('Метод _isAntiBot не знайдено в API клієнті');
  }
  
  // Перевірка регіонів API
  const apiRegions = apiClient.getAvailableRegions();
  if (!Array.isArray(apiRegions) || apiRegions.length !== 4) {
    throw new Error('getAvailableRegions API клієнта повертає некоректний результат');
  }
  
  // Перевірка структури DTEK_API_REGIONS
  const expectedApiRegions = ['kyiv_city', 'kyiv_oblast', 'dnipro', 'odesa'];
  for (const region of expectedApiRegions) {
    if (!DTEK_API_REGIONS[region]) {
      throw new Error(`API регіон ${region} не знайдено`);
    }
    const regionData = DTEK_API_REGIONS[region];
    if (!regionData.ajaxUrl || !regionData.baseUrl || !regionData.shutdownsUrl) {
      throw new Error(`Неповні API дані для регіону ${region}`);
    }
  }
  
  // Перевірка парсингу API відповіді
  const testAjaxDataWithOutage = {
    updateTimestamp: '14:30 15.02.2026',
    showCurOutageParam: true,
    data: {
      '10': {
        start_date: '14:00 15.02.2026',
        end_date: '18:00 15.02.2026',
        sub_type: 'Екстрене відключення',
        type: 2
      }
    }
  };
  
  const parsedOutage = apiClient._parseApiResponse(testAjaxDataWithOutage, '10');
  if (!parsedOutage) {
    throw new Error('_parseApiResponse повертає null для валідних даних');
  }
  if (parsedOutage.startDate !== '14:00 15.02.2026') {
    throw new Error('_parseApiResponse некоректно парсить startDate');
  }
  if (parsedOutage.endDate !== '18:00 15.02.2026') {
    throw new Error('_parseApiResponse некоректно парсить endDate');
  }
  if (parsedOutage.subType !== 'Екстрене відключення') {
    throw new Error('_parseApiResponse некоректно парсить subType');
  }
  
  // Перевірка парсингу без відключення
  const testAjaxNoOutage = {
    updateTimestamp: '14:30 15.02.2026',
    showCurOutageParam: false,
    data: {}
  };
  
  const parsedNoOutage = apiClient._parseApiResponse(testAjaxNoOutage, '10');
  if (parsedNoOutage !== null) {
    throw new Error('_parseApiResponse має повертати null якщо showCurOutageParam === false');
  }
  
  // Перевірка парсингу з null
  const parsedNull = apiClient._parseApiResponse(null, '10');
  if (parsedNull !== null) {
    throw new Error('_parseApiResponse має повертати null для null даних');
  }
  
  // Перевірка _isAntiBot
  const antiBotError403 = { response: { status: 403, data: '', headers: {} } };
  if (!apiClient._isAntiBot(antiBotError403)) {
    throw new Error('_isAntiBot має розпізнавати 403 як анти-бот');
  }
  
  const antiBotErrorIncapsula = { 
    response: { status: 200, data: '<html>_Incapsula_Resource</html>', headers: {} } 
  };
  if (!apiClient._isAntiBot(antiBotErrorIncapsula)) {
    throw new Error('_isAntiBot має розпізнавати Incapsula відповідь');
  }
  
  const normalError = { message: 'timeout' };
  if (apiClient._isAntiBot(normalError)) {
    throw new Error('_isAntiBot не повинен позначати звичайну помилку як анти-бот');
  }
  
  console.log('   ✅ API клієнт працює коректно');
  console.log(`   📡 API регіонів: ${apiRegions.length}`);
  for (const region of apiRegions) {
    console.log(`      - ${region.key}: ${region.name}`);
  }
  
  // Тест 4: Перевірка функцій бази даних
  console.log('\n4️⃣ Перевірка функцій бази даних...');
  const dbFunctions = [
    'initDtekAlertsTable',
    'upsertDtekSubscription',
    'getActiveDtekSubscriptions',
    'getDtekSubscription',
    'saveDtekAlertState',
    'clearDtekAlertState',
    'deactivateDtekSubscription'
  ];
  
  for (const funcName of dbFunctions) {
    if (typeof dtekAlerts[funcName] !== 'function') {
      throw new Error(`Функція ${funcName} не знайдена`);
    }
  }
  
  console.log('   ✅ Всі функції бази даних присутні');
  
  // Тест 5: Перевірка функцій моніторингу
  console.log('\n5️⃣ Перевірка функцій моніторингу...');
  const monitorFunctions = [
    'startDtekMonitoring',
    'stopDtekMonitoring',
    'checkAllSubscriptions'
  ];
  
  for (const funcName of monitorFunctions) {
    if (typeof dtekMonitor[funcName] !== 'function') {
      throw new Error(`Функція ${funcName} не знайдена`);
    }
  }
  
  console.log('   ✅ Всі функції моніторингу присутні');
  
  // Тест 6: Перевірка хендлерів
  console.log('\n6️⃣ Перевірка хендлерів...');
  const handlerFunctions = [
    'handleDtek',
    'handleDtekCallback',
    'handleDtekAddressInput',
    'isInDtekWizard'
  ];
  
  for (const funcName of handlerFunctions) {
    if (typeof dtekHandler[funcName] !== 'function') {
      throw new Error(`Функція ${funcName} не знайдена`);
    }
  }
  
  console.log('   ✅ Всі хендлери присутні');
  
  // Фінал
  console.log('\n✅ Всі тести пройдено успішно!');
  console.log('\n📝 Примітки:');
  console.log('   - Для реального тестування скрапінгу потрібне підключення до інтернету');
  console.log('   - Для тестування бази даних потрібне підключення до PostgreSQL');
  console.log('   - Playwright Chromium має бути встановлений: npx playwright install chromium');
  
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Тест провалено:', error.message);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
}
