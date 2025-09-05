import { sequelize, testConnection, logger } from '../config/database';

async function runMigrations(): Promise<void> {
  try {
    logger.info('Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      logger.error('Database connection failed');
      process.exit(1);
    }

    logger.info('Running database migrations...');
    
    await sequelize.sync({ 
      alter: {
        drop: false
      },
      force: false
    });

    logger.info('Database migrations completed successfully');

    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_trends_scraped_at ON trends(scraped_at);',
      'CREATE INDEX IF NOT EXISTS idx_trends_platform ON trends(platform);',
      'CREATE INDEX IF NOT EXISTS idx_trends_category ON trends(category);',
      'CREATE INDEX IF NOT EXISTS idx_trends_hashtag ON trends(hashtag);',
      'CREATE INDEX IF NOT EXISTS idx_trends_platform_hashtag ON trends(platform, hashtag);',
      'CREATE INDEX IF NOT EXISTS idx_trends_sentiment ON trends(sentiment);',
      'CREATE INDEX IF NOT EXISTS idx_trends_confidence ON trends(confidence);'
    ];

    for (const query of indexQueries) {
      try {
        await sequelize.query(query);
        logger.debug(`Index created: ${query.split(' ')[5]}`);
      } catch (error) {
        logger.warn(`Index creation skipped (already exists): ${query.split(' ')[5]}`);
      }
    }

    await sequelize.close();
    logger.info('Migration completed successfully');

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}

export { runMigrations };