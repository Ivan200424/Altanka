require('dotenv').config();

const config = {
  // API Configuration
  apiKey: process.env.API_KEY,
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Database Configuration
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '50', 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '5', 10),
  
  // Application Settings
  timezone: process.env.TZ || 'Europe/Kyiv',
  
  // DTEK Monitoring
  dtekCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
  dtekDelayBetweenScrapesMs: 5 * 1000, // 5 seconds
};

// Валідація обов'язкових параметрів
if (!config.apiKey) {
  console.error('❌ Помилка: API_KEY не встановлений в .env файлі');
  process.exit(1);
}

// Validate numeric values
for (const [key, value] of Object.entries(config)) {
  if (typeof value === 'number' && (isNaN(value) || value < 0)) {
    console.error(`❌ Invalid config value for ${key}: ${value}`);
    process.exit(1);
  }
}

module.exports = config;
