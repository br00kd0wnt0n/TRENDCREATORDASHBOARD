import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import { TrendScraper } from '../scrapers/TrendScraper';
import Trend from '../models/Trend';
import { logger } from '../config/database';
import { Op } from 'sequelize';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 30003;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../../public')));

const scraper = new TrendScraper();

// Health check endpoints
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Ralph Loves Trends API',
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Railway health check
app.get('/healthz', (_req, res) => {
  res.status(200).send('OK');
});

// API Routes
app.get('/api/trends', async (_req, res) => {
  try {
    const { 
      platform, 
      category, 
      limit = 50, 
      offset = 0,
      sentiment,
      since 
    } = _req.query;

    const whereClause: any = {};
    
    if (platform) whereClause.platform = platform;
    if (category) whereClause.category = category;
    if (sentiment) whereClause.sentiment = sentiment;
    if (since) {
      whereClause.scrapedAt = {
        [Op.gte]: new Date(since as string)
      };
    }

    const trends = await Trend.findAndCountAll({
      where: whereClause,
      order: [['scrapedAt', 'DESC']],
      limit: Math.min(parseInt(limit as string), 100),
      offset: parseInt(offset as string),
      raw: true
    });

    res.json({
      success: true,
      data: trends.rows,
      pagination: {
        total: trends.count,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: trends.count > parseInt(offset as string) + parseInt(limit as string)
      }
    });
  } catch (error) {
    logger.error('Failed to fetch trends:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch trends' 
    });
  }
});

app.get('/api/trends/stats', async (_req, res) => {
  try {
    const totalTrends = await Trend.count();
    const recentTrends = await Trend.count({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    const platformStats = await Trend.findAll({
      attributes: [
        'platform',
        [Trend.sequelize!.fn('COUNT', '*'), 'count']
      ],
      group: 'platform',
      raw: true
    });

    const sentimentStats = await Trend.findAll({
      attributes: [
        'sentiment',
        [Trend.sequelize!.fn('COUNT', '*'), 'count']
      ],
      group: 'sentiment',
      raw: true
    });

    res.json({
      success: true,
      data: {
        totalTrends,
        recentTrends,
        platformStats,
        sentimentStats
      }
    });
  } catch (error) {
    logger.error('Failed to fetch trend stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics' 
    });
  }
});

app.get('/api/trends/search', async (_req, res) => {
  try {
    const { q, limit = 20 } = _req.query;
    
    if (!q) {
      res.status(400).json({ 
        success: false, 
        error: 'Search query required' 
      });
      return;
    }

    const trends = await Trend.findAll({
      where: {
        [Op.or]: [
          { hashtag: { [Op.iLike]: `%${q}%` } },
          { category: { [Op.iLike]: `%${q}%` } },
          { aiInsights: { [Op.iLike]: `%${q}%` } }
        ]
      },
      order: [['scrapedAt', 'DESC']],
      limit: Math.min(parseInt(limit as string), 50),
      raw: true
    });

    res.json({
      success: true,
      data: trends,
      query: q
    });
  } catch (error) {
    logger.error('Search failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Search failed' 
    });
  }
});

app.post('/api/scrape', async (_req, res) => {
  try {
    logger.info('Manual scraping initiated via API');
    
    res.json({ 
      success: true, 
      message: 'Scraping started. Check /api/scrape/status for progress.' 
    });

    const result = await scraper.scrapeAllSources();
    logger.info(`Manual scraping completed: ${result.trends.length} trends`);
  } catch (error) {
    logger.error('Manual scraping failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Scraping failed' 
    });
  }
});

app.get('/api/trending/top', async (_req, res) => {
  try {
    const { platform, timeframe = '24h', limit = 10 } = _req.query;
    
    let since = new Date();
    if (timeframe === '24h') {
      since.setDate(since.getDate() - 1);
    } else if (timeframe === '7d') {
      since.setDate(since.getDate() - 7);
    } else if (timeframe === '30d') {
      since.setDate(since.getDate() - 30);
    }

    const whereClause: any = {
      scrapedAt: { [Op.gte]: since }
    };
    
    if (platform && platform !== 'all') {
      whereClause.platform = platform;
    }

    const topTrends = await Trend.findAll({
      where: whereClause,
      order: [
        ['confidence', 'DESC'],
        ['scrapedAt', 'DESC']
      ],
      limit: parseInt(limit as string),
      raw: true
    });

    res.json({
      success: true,
      data: topTrends,
      timeframe,
      platform: platform || 'all'
    });
  } catch (error) {
    logger.error('Failed to fetch top trends:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch top trends' 
    });
  }
});

// Serve dashboard HTML
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('API Error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

async function startServer() {
  try {
    await scraper.initialize();
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Ralph Loves Trends API server running on port ${PORT}`);
      logger.info(`📊 Dashboard available at http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

export { app, startServer };