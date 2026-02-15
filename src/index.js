#!/usr/bin/env node

const config = require('./config');
const { initializeDatabase, runMigrations, checkPoolHealth, startPoolMetricsLogging, stopPoolMetricsLogging, closeDatabase } = require('./database/db');
const { initDtekAlertsTable } = require('./database/dtekAlerts');
const { initApiSubscriptionsTable } = require('./database/apiSubscriptions');
const { startDtekMonitoring, stopDtekMonitoring } = require('./services/dtekMonitorApi');
const { startApiServer, stopApiServer } = require('./apiServer');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Main');

// Флаг для запобігання подвійного завершення
let isShuttingDown = false;
let apiServer = null;

// Головна async функція для запуску
async function main() {
  logger.info('🚀 Запуск Altanka API...');
  logger.info(`📍 Timezone: ${config.timezone}`);
  
  // КРИТИЧНО: Ініціалізація та міграція бази даних перед запуском
  await initializeDatabase();
  await runMigrations();
  
  // Ініціалізація таблиць
  await initDtekAlertsTable();
  await initApiSubscriptionsTable();
  
  logger.info(`💾 База даних: PostgreSQL`);
  
  // Перевірка здоров'я пулу підключень
  await checkPoolHealth();
  
  // Запуск логування метрик пулу
  startPoolMetricsLogging();

  // Запуск API сервера
  logger.info('🌐 Запуск API сервера...');
  apiServer = startApiServer();
  logger.success('✅ API сервер запущено');

  // Запуск моніторингу ДТЕК
  logger.info('⚡ Запуск моніторингу ДТЕК...');
  await startDtekMonitoring();
  logger.success('✅ Моніторинг ДТЕК запущено');
  
  logger.success('✨ Altanka API успішно запущено та готовий до роботи!');
  logger.info(`🔗 API доступний на http://localhost:${config.port}`);
}

// Запуск з обробкою помилок
main().catch(error => {
  logger.error('❌ Критична помилка запуску:', error);
  process.exit(1);
});

// Graceful shutdown з захистом від подвійного виклику
const SHUTDOWN_TIMEOUT_MS = 15000; // Force-kill after 15 seconds

const shutdown = async (signal) => {
  if (isShuttingDown) {
    logger.info('⏳ Завершення вже виконується...');
    return;
  }
  isShuttingDown = true;
  
  logger.info(`\n⏳ Отримано ${signal}, завершую роботу...`);
  
  // Force-kill timeout to prevent hanging shutdown
  const forceKillTimer = setTimeout(() => {
    logger.error('❌ Shutdown timed out, force exiting...');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceKillTimer.unref(); // Don't keep process alive just for this timer
  
  try {
    // 1. Зупиняємо API сервер
    if (apiServer) {
      await stopApiServer(apiServer);
      logger.success('✅ API сервер зупинено');
    }
    
    // 2. Зупиняємо моніторинг ДТЕК
    stopDtekMonitoring();
    logger.success('✅ Моніторинг ДТЕК зупинено');
    
    // 3. Зупиняємо pool metrics logging
    stopPoolMetricsLogging();
    logger.success('✅ Pool metrics logging зупинено');
    
    // 4. Закриваємо базу даних коректно
    await closeDatabase();
    logger.success('✅ База даних закрита');
    
    clearTimeout(forceKillTimer);
    logger.info('👋 Altanka API завершив роботу');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Помилка при завершенні:', error);
    clearTimeout(forceKillTimer);
    process.exit(1);
  }
};

// Обробка сигналів завершення
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Обробка необроблених помилок
process.on('uncaughtException', (error) => {
  logger.error('❌ Необроблена помилка:', error);
  // Log the error but don't shutdown - API should keep running
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Необроблене відхилення промісу:', reason);
  // Log the error but don't shutdown - API should keep running
});
