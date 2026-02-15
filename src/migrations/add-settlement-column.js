/**
 * Database migration: Add settlement column to dtek_alerts table
 * This migration adds support for 3-field addresses (settlement, street, house)
 * needed for regional DTEK sites
 */

const { pool } = require('../database/db');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DtekMigration');

async function migrateDatabase() {
  logger.info('Starting DTEK database migration...');
  
  const client = await pool.connect();
  
  try {
    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'dtek_alerts' 
      AND column_name = 'settlement'
    `);
    
    if (checkColumn.rows.length > 0) {
      logger.info('Settlement column already exists, skipping migration');
      return;
    }
    
    // Add settlement column
    logger.info('Adding settlement column to dtek_alerts table...');
    await client.query(`
      ALTER TABLE dtek_alerts 
      ADD COLUMN settlement TEXT
    `);
    
    logger.success('Settlement column added successfully');
    
    // Log the updated schema
    const schema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'dtek_alerts'
      ORDER BY ordinal_position
    `);
    
    logger.info('Updated dtek_alerts schema:');
    for (const row of schema.rows) {
      logger.info(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    }
    
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      logger.success('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Migration failed', { error: error.message });
      process.exit(1);
    });
}

module.exports = { migrateDatabase };
