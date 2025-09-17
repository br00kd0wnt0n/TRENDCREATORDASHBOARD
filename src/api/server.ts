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
  crossOriginEmbedderPolicy: false,
  frameguard: false // Disable X-Frame-Options to allow iframe embedding
}));

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://trendcreatordashboard.up.railway.app',
    'https://ralphlovestrends-production.up.railway.app'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../../public')));

import { progressManager } from '../utils/progress-manager';
import { AIEnrichmentService } from '../services/ai-enrichment';

const scraper = new TrendScraper();
const aiService = new AIEnrichmentService();

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
      limit = 100, // Increased default limit
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
      order: [['scrapedAt', 'DESC'], ['platform', 'ASC']], // Mix platforms with same timestamp
      limit: Math.min(parseInt(limit as string), 200), // Allow up to 200 trends
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

app.get('/api/trends/narrative', async (_req, res) => {
  try {
    // Get comprehensive stats for AI analysis
    const totalTrends = await Trend.count();
    const recentTrends = await Trend.count({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    const highConfidenceTrends = await Trend.count({
      where: {
        confidence: {
          [Op.gte]: 0.7
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

    // Get recent trends for context (lowered confidence threshold)
    const topTrends = await Trend.findAll({
      where: {
        confidence: {
          [Op.gte]: 0.1
        }
      },
      order: [
        ['confidence', 'DESC'],
        ['scrapedAt', 'DESC']
      ],
      limit: 10,
      raw: true
    });

    // Get all recent trends to analyze content patterns
    const allRecentTrends = await Trend.findAll({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      order: [['scrapedAt', 'DESC']],
      limit: 30,
      raw: true
    });

    const statsForAI = {
      totalTrends,
      recentTrends,
      highConfidenceTrends,
      platformStats,
      sentimentStats,
      topTrends: topTrends.map(t => ({
        hashtag: t.hashtag,
        platform: t.platform,
        sentiment: t.sentiment,
        confidence: t.confidence,
        aiInsights: t.aiInsights
      })),
      trendingContent: allRecentTrends.map(t => ({
        hashtag: t.hashtag,
        platform: t.platform,
        category: t.category,
        confidence: t.confidence
      }))
    };

    // Generate AI narrative
    const narrative = await aiService.generateDashboardNarrative(statsForAI);
    
    // Include top 10 trends for display
    const responseData = {
      ...narrative,
      topTrends: topTrends.slice(0, 10).map(t => ({
        hashtag: t.hashtag,
        platform: t.platform,
        category: t.category || 'General',
        confidence: t.confidence,
        sentiment: t.sentiment || 'neutral'
      }))
    };
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Failed to generate dashboard narrative:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate narrative' 
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

// Progress tracking is now handled by the ProgressManager singleton

app.post('/api/scrape', async (_req, res) => {
  try {
    const currentStatus = progressManager.getStatus();
    if (currentStatus.isRunning) {
      res.json({ 
        success: false, 
        message: 'Scraping already in progress',
        status: currentStatus
      });
      return;
    }

    logger.info('Manual scraping initiated via API');
    
    // Initialize scraping progress
    progressManager.initializeScraping();
    
    res.json({ 
      success: true, 
      message: 'Scraping started successfully',
      status: progressManager.getStatus()
    });

    // Run scraping asynchronously
    const result = await scraper.scrapeAllSources();
    
    // Update final status
    progressManager.completeScraping(result.trends);
    
    logger.info(`Manual scraping completed: ${result.trends.length} trends`);
  } catch (error) {
    logger.error('Manual scraping failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    progressManager.addError(errorMessage);
    progressManager.completeScraping([]);
  }
});

app.get('/api/scrape/status', (_req, res) => {
  res.json({
    success: true,
    data: progressManager.getStatus()
  });
});

// AI question/follow-up endpoint
app.post('/api/trends/ask', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      res.status(400).json({
        success: false,
        error: 'Question is required'
      });
      return;
    }

    // Get recent trending content for context
    const recentTrends = await Trend.findAll({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      order: [['confidence', 'DESC'], ['scrapedAt', 'DESC']],
      limit: 20,
      raw: true
    });

    const trendContext = recentTrends.map(t => ({
      hashtag: t.hashtag,
      platform: t.platform,
      category: t.category,
      confidence: t.confidence
    }));

    // Use AI service to answer the question with trend context
    const prompt = `Based on these current trending hashtags and topics:

${JSON.stringify(trendContext, null, 2)}

User asks: "${question}"

Provide a thoughtful, data-driven response that references specific hashtags and trends from the data above. Be insightful and actionable.`;

    const answer = await aiService.analyzeContent(prompt);

    res.json({
      success: true,
      data: {
        question: question,
        answer: answer || 'Unable to analyze the question at this time.',
        trendContext: trendContext.slice(0, 10) // Include top 10 trends for reference
      }
    });
  } catch (error) {
    logger.error('Failed to process AI question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process question'
    });
  }
});

// Scrape history endpoint
app.get('/api/scrape/history', async (_req, res) => {
  try {
    // Get scrape history by grouping trends by scrapedAt date/time
    const scrapeHistory = await Trend.findAll({
      attributes: [
        // Group by 15-minute intervals to capture sequential scraper runs as single session
        [Trend.sequelize!.literal("DATE_TRUNC('minute', \"scrapedAt\") - INTERVAL '1 minute' * (EXTRACT(minute FROM \"scrapedAt\")::int % 15)"), 'scrapeTime'],
        [Trend.sequelize!.fn('COUNT', '*'), 'totalTrends'],
        [Trend.sequelize!.fn('COUNT', Trend.sequelize!.literal("CASE WHEN platform = 'TikTok' THEN 1 END")), 'tiktokTrends'],
        [Trend.sequelize!.fn('COUNT', Trend.sequelize!.literal("CASE WHEN platform = 'Pinterest' THEN 1 END")), 'pinterestTrends'],
        [Trend.sequelize!.fn('COUNT', Trend.sequelize!.literal("CASE WHEN platform = 'X (Twitter)' THEN 1 END")), 'twitterTrends'],
        [Trend.sequelize!.fn('AVG', Trend.sequelize!.col('confidence')), 'avgConfidence']
      ],
      group: ['scrapeTime'],
      order: [['scrapeTime', 'DESC']],
      limit: 20,
      raw: true
    });

    const formattedHistory = scrapeHistory.map((entry: any) => ({
      scrapeTime: entry.scrapeTime,
      totalTrends: parseInt(entry.totalTrends),
      tiktokTrends: parseInt(entry.tiktokTrends) || 0,
      pinterestTrends: parseInt(entry.pinterestTrends) || 0,
      twitterTrends: parseInt(entry.twitterTrends) || 0,
      avgConfidence: parseFloat(entry.avgConfidence) || 0
    }));

    res.json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    logger.error('Failed to fetch scrape history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch scrape history' 
    });
  }
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
    // Get count before deletion
    const countBefore = await Trend.count();

    // Delete all records
    await Trend.truncate({ cascade: true });

    const deletedCount = countBefore;

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