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
