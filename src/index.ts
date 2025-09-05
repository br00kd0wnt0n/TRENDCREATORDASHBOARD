#!/usr/bin/env node

import dotenv from 'dotenv';
import { TrendScraper } from './scrapers/TrendScraper';
import { startServer } from './api/server';
import { testConnection, logger } from './config/database';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';

dotenv.config();

interface CLIOptions {
  scrape?: boolean;
  server?: boolean;
  migrate?: boolean;
  seed?: boolean;
  schedule?: boolean;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    switch (arg) {
      case '--scrape':
      case '-s':
        options.scrape = true;
        break;
      case '--server':
      case '--api':
        options.server = true;
        break;
      case '--migrate':
      case '-m':
        options.migrate = true;
        break;
      case '--seed':
        options.seed = true;
        break;
      case '--schedule':
        options.schedule = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  });

  if (Object.keys(options).length === 0) {
    options.server = true;
  }

  return options;
}

function showHelp() {
  console.log(`
🔥 Ralph Loves Trends - AI-Powered Trend Scraping System

Usage: npm run [command] or tsx src/index.ts [options]

Commands:
  npm run dev          Start in development mode with hot reload
  npm run build        Build the TypeScript project
  npm run start        Start the production server
  npm run scrape       Run a one-time scraping operation
  npm run db:migrate   Run database migrations
  npm run db:seed      Seed database with sample data
  npm run docker:up    Start PostgreSQL with Docker

Options:
  --scrape, -s         Run scraping operation once
  --server, --api      Start the API server and dashboard
  --migrate, -m        Run database migrations
  --seed              Seed the database with sample data
  --schedule          Start scraping with scheduled intervals
  --help, -h          Show this help message

Examples:
  tsx src/index.ts --scrape           # Run scraping once
  tsx src/index.ts --server           # Start API server
  tsx src/index.ts --migrate --seed   # Setup database
  tsx src/index.ts --schedule         # Run with scheduled scraping

Environment Variables:
  POSTGRES_HOST        Database host (default: localhost)
  POSTGRES_PORT        Database port (default: 5432)
  POSTGRES_DATABASE    Database name (default: trend_tracker)
  POSTGRES_USER        Database user (default: postgres)
  POSTGRES_PASSWORD    Database password
  ANTHROPIC_API_KEY    Claude AI API key (required)
  DASHBOARD_PORT       Dashboard port (default: 3001)
  LOG_LEVEL           Logging level (default: info)

🚀 Get started:
1. cp .env.example .env
2. Edit .env with your database and API credentials
3. npm run docker:up
4. npm run db:migrate
5. npm run db:seed
6. npm run dev
`);
}

async function runScraper() {
  const scraper = new TrendScraper();
  
  try {
    logger.info('🕷️  Starting trend scraping operation...');
    await scraper.initialize();
    
    const result = await scraper.scrapeAllSources();
    
    logger.info(`✅ Scraping completed successfully!`);
    logger.info(`📊 Collected ${result.trends.length} trends`);
    logger.info(`🧠 AI Report Generated: ${result.report.length} characters`);
    
    if (result.report) {
      logger.info('📋 AI Analysis Summary:');
      console.log(result.report.substring(0, 500) + '...');
    }
    
  } catch (error) {
    logger.error('❌ Scraping operation failed:', error);
    process.exit(1);
  } finally {
    await scraper.shutdown();
  }
}

async function runScheduledScraper() {
  const scraper = new TrendScraper();
  
  try {
    logger.info('⏰ Starting scheduled trend scraper...');
    await scraper.initialize();
    
    const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '12');
    await scraper.schedulePeriodicScraping(intervalHours);
    
    logger.info(`🔄 Scheduled scraping every ${intervalHours} hours`);
    logger.info('Press Ctrl+C to stop...');
    
    process.on('SIGINT', async () => {
      logger.info('🛑 Shutting down scheduled scraper...');
      await scraper.shutdown();
      process.exit(0);
    });
    
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
  } catch (error) {
    logger.error('❌ Scheduled scraper failed:', error);
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  try {
    logger.info('🚀 Ralph Loves Trends - Initializing...');
    
    const connected = await testConnection();
    if (!connected) {
      logger.error('❌ Database connection failed. Please check your configuration.');
      logger.info('💡 Tip: Run "npm run docker:up" to start PostgreSQL');
      process.exit(1);
    }

    if (options.migrate) {
      logger.info('📦 Running database migrations...');
      await runMigrations();
    }

    if (options.seed) {
      logger.info('🌱 Seeding database...');
      await seedDatabase();
    }

    if (options.scrape) {
      await runScraper();
    }

    if (options.schedule) {
      await runScheduledScraper();
    }

    if (options.server) {
      logger.info('🌐 Starting API server and dashboard...');
      await startServer();
    }

  } catch (error) {
    logger.error('💥 Application startup failed:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main, runScraper, runScheduledScraper };