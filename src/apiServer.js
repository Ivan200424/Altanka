const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { createLogger } = require('./utils/logger');
const { 
  upsertApiSubscription, 
  deactivateApiSubscription,
  getApiSubscription,
  getActiveApiSubscriptions
} = require('./database/apiSubscriptions');
const {
  getActiveDtekSubscriptions,
  getDtekSubscription
} = require('./database/dtekAlerts');
const { DTEK_REGIONS } = require('./services/dtekScraper');
const { pool } = require('./database/db');

const logger = createLogger('ApiServer');

/**
 * Створити та налаштувати Express сервер
 */
function createApiServer() {
  const app = express();

  // Middleware для парсингу JSON
  app.use(express.json());

  // Rate limiting - 100 requests per 15 minutes per IP
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

  // Apply rate limiter to all routes
  app.use(limiter);

  // Middleware для логування запитів
  app.use((req, res, next) => {
    logger.debug('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });

  // Middleware для аутентифікації API key
  const authenticateApiKey = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header'
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '
    
    if (apiKey !== config.apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
    }

    next();
  };

  // Health check endpoint (без аутентифікації)
  app.get('/api/health', async (req, res) => {
    try {
      // Перевірка підключення до бази даних
      const dbResult = await pool.query('SELECT NOW()');
      const dbConnected = dbResult.rows.length > 0;

      // Підрахунок активних підписок
      const subscriptionsResult = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM api_subscriptions WHERE is_active = TRUE) as api_subs,
          (SELECT COUNT(*) FROM dtek_alerts WHERE is_active = TRUE) as dtek_subs
      `);

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbConnected,
          timestamp: dbResult.rows[0].now
        },
        subscriptions: {
          api: subscriptionsResult.rows[0].api_subs,
          dtek: subscriptionsResult.rows[0].dtek_subs
        },
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
      });
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // POST /api/subscribe - Підписати користувача на сповіщення
  app.post('/api/subscribe', authenticateApiKey, async (req, res) => {
    try {
      const { user_id, region, queue, webhook_url } = req.body;

      // Валідація вхідних даних
      if (!user_id || !region || !webhook_url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: user_id, region, webhook_url'
        });
      }

      // Валідація URL
      try {
        new URL(webhook_url);
      } catch (e) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid webhook_url format'
        });
      }

      // Створення підписки
      const success = await upsertApiSubscription(user_id, region, queue, webhook_url);

      if (success) {
        logger.info('User subscribed', { userId: user_id, region, queue });
        res.json({
          success: true,
          message: 'Subscription created successfully',
          subscription: {
            user_id,
            region,
            queue,
            webhook_url
          }
        });
      } else {
        throw new Error('Failed to create subscription');
      }
    } catch (error) {
      logger.error('Error creating subscription', { error: error.message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create subscription'
      });
    }
  });

  // POST /api/unsubscribe - Відписати користувача
  app.post('/api/unsubscribe', authenticateApiKey, async (req, res) => {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required field: user_id'
        });
      }

      const success = await deactivateApiSubscription(user_id);

      if (success) {
        logger.info('User unsubscribed', { userId: user_id });
        res.json({
          success: true,
          message: 'Subscription removed successfully'
        });
      } else {
        throw new Error('Failed to remove subscription');
      }
    } catch (error) {
      logger.error('Error removing subscription', { error: error.message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to remove subscription'
      });
    }
  });

  // GET /api/status - Статус моніторингу ДТЕК
  app.get('/api/status', authenticateApiKey, async (req, res) => {
    try {
      const dtekSubs = await getActiveDtekSubscriptions();
      const apiSubs = await getActiveApiSubscriptions();

      // Групування по регіонах
      const regionStats = {};
      for (const sub of dtekSubs) {
        const region = sub.dtek_region;
        if (!regionStats[region]) {
          regionStats[region] = { subscribers: 0, active_alerts: 0 };
        }
        regionStats[region].subscribers++;
        if (sub.last_message_id) {
          regionStats[region].active_alerts++;
        }
      }

      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        monitoring: {
          dtek_subscriptions: dtekSubs.length,
          api_subscriptions: apiSubs.length,
          check_interval: '5 minutes'
        },
        regions: regionStats,
        available_regions: Object.keys(DTEK_REGIONS).map(key => ({
          key,
          name: DTEK_REGIONS[key].name
        }))
      });
    } catch (error) {
      logger.error('Error getting status', { error: error.message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get status'
      });
    }
  });

  // GET /api/alerts/:region - Отримати алерти по регіону
  app.get('/api/alerts/:region', authenticateApiKey, async (req, res) => {
    try {
      const { region } = req.params;

      // Перевірка чи регіон існує
      if (!DTEK_REGIONS[region]) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Region '${region}' not found`,
          available_regions: Object.keys(DTEK_REGIONS)
        });
      }

      // Отримання активних алертів для регіону
      const result = await pool.query(`
        SELECT 
          telegram_id as user_id,
          settlement,
          street,
          house,
          prev_start_date as start_date,
          prev_end_date as end_date,
          prev_update_timestamp as last_update
        FROM dtek_alerts
        WHERE dtek_region = $1 
          AND is_active = TRUE 
          AND last_message_id IS NOT NULL
        ORDER BY updated_at DESC
      `, [region]);

      res.json({
        region: region,
        region_name: DTEK_REGIONS[region].name,
        alerts_count: result.rows.length,
        alerts: result.rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting alerts', { error: error.message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get alerts'
      });
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'Endpoint not found',
      available_endpoints: [
        'GET /api/health',
        'POST /api/subscribe',
        'POST /api/unsubscribe',
        'GET /api/status',
        'GET /api/alerts/:region'
      ]
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  });

  return app;
}

/**
 * Запустити API сервер
 */
function startApiServer() {
  const app = createApiServer();
  
  const server = app.listen(config.port, () => {
    logger.success(`API Server started on port ${config.port}`);
    logger.info('Available endpoints:', {
      health: `http://localhost:${config.port}/api/health`,
      subscribe: `http://localhost:${config.port}/api/subscribe`,
      unsubscribe: `http://localhost:${config.port}/api/unsubscribe`,
      status: `http://localhost:${config.port}/api/status`,
      alerts: `http://localhost:${config.port}/api/alerts/:region`
    });
  });

  return server;
}

/**
 * Зупинити API сервер
 */
function stopApiServer(server) {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        logger.error('Error stopping API server', { error: err.message });
        reject(err);
      } else {
        logger.info('API server stopped');
        resolve();
      }
    });
  });
}

module.exports = {
  createApiServer,
  startApiServer,
  stopApiServer
};
