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
const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '30003');

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

// Functions to update scraping progress
export function updateSourceProgress(sourceName: string, status: 'running' | 'completed' | 'failed', progress: number, trends: number, details?: string, error?: string) {
  const sourceIndex = scrapingStatus.sources.findIndex(s => s.name.includes(sourceName.split(' ')[0]));
  if (sourceIndex !== -1) {
    scrapingStatus.sources[sourceIndex] = {
      ...scrapingStatus.sources[sourceIndex],
      status,
      progress,
      trends,
      details,
      error,
      ...(status === 'running' ? { startTime: new Date() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedTime: new Date() } : {})
    };
    
    scrapingStatus.currentSource = status === 'running' ? sourceName : null;
    scrapingStatus.completedSources = scrapingStatus.sources.filter(s => s.status === 'completed' || s.status === 'failed').length;
    scrapingStatus.progress = (scrapingStatus.completedSources / scrapingStatus.totalSources) * 100;
    scrapingStatus.lastUpdate = new Date();
    
    logger.info(`📊 Source progress: ${sourceName} - ${status} (${progress}%) - ${trends} trends - ${details || ''}`);
  }
}

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

// Global scraping status tracking
interface SourceProgress {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  trends: number;
  error?: string;
  startTime?: Date;
  completedTime?: Date;
  details?: string;
}

interface ScrapingStatus {
  isRunning: boolean;
  currentSource: string | null;
  progress: number;
  totalSources: number;
  completedSources: number;
  trends: any[];
  errors: string[];
  startTime: Date | null;
  lastUpdate: Date | null;
  sources: SourceProgress[];
}

let scrapingStatus: ScrapingStatus = {
  isRunning: false,
  currentSource: null,
  progress: 0,
  totalSources: 0,
  completedSources: 0,
  trends: [],
  errors: [],
  startTime: null,
  lastUpdate: null,
  sources: []
};

app.post('/api/scrape', async (_req, res) => {
  try {
    if (scrapingStatus.isRunning) {
      res.json({ 
        success: false, 
        message: 'Scraping already in progress',
        status: scrapingStatus
      });
      return;
    }

    logger.info('Manual scraping initiated via API');
    
    // Reset status
    scrapingStatus = {
      isRunning: true,
      currentSource: null,
      progress: 0,
      totalSources: 3, // TikTok, Pinterest, Trends24
      completedSources: 0,
      trends: [],
      errors: [],
      startTime: new Date(),
      lastUpdate: new Date(),
      sources: [
        { name: 'TikTok Creative Center', status: 'pending', progress: 0, trends: 0, details: 'Waiting to start...' },
        { name: 'Pinterest Trends', status: 'pending', progress: 0, trends: 0, details: 'Waiting to start...' },
        { name: 'Trends24 (X/Twitter US)', status: 'pending', progress: 0, trends: 0, details: 'Waiting to start...' }
      ]
    };
    
    res.json({ 
      success: true, 
      message: 'Scraping started successfully',
      status: scrapingStatus
    });

    // Run scraping asynchronously
    const result = await scraper.scrapeAllSources();
    
    // Update final status
    scrapingStatus.isRunning = false;
    scrapingStatus.progress = 100;
    scrapingStatus.trends = result.trends;
    scrapingStatus.lastUpdate = new Date();
    
    logger.info(`Manual scraping completed: ${result.trends.length} trends`);
  } catch (error) {
    logger.error('Manual scraping failed:', error);
    scrapingStatus.isRunning = false;
    scrapingStatus.errors.push(error instanceof Error ? error.message : 'Unknown error');
    scrapingStatus.lastUpdate = new Date();
  }
});

app.get('/api/scrape/status', (_req, res) => {
  res.json({
    success: true,
    data: scrapingStatus
  });
});

// Debug endpoint to see current database entries
app.get('/api/debug/trends', async (_req, res) => {
  try {
    const recentTrends = await Trend.findAll({
      order: [['scrapedAt', 'DESC']],
      limit: 10,
      raw: true
    });
    
    res.json({
      success: true,
      data: recentTrends,
      count: recentTrends.length
    });
  } catch (error) {
    logger.error('Debug trends failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch debug trends' 
    });
  }
});

// Debug endpoint to clear all trends
app.delete('/api/debug/trends', async (_req, res) => {
  try {
    const deletedCount = await Trend.destroy({
      where: {},
      truncate: true
    });
    
    logger.info(`🗑️ Cleared ${deletedCount} trends from database`);
    res.json({
      success: true,
      message: `Cleared ${deletedCount} trends from database`
    });
  } catch (error) {
    logger.error('Clear trends failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear trends' 
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