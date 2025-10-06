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
import { scoreTrends } from '../services/crossover';
import { CreatorFinderService } from '../services/creator-finder';
import { fetchInstagramRelatedHashtags } from '../services/related-hashtags';
import { fetchTikTokHashtagStatsClockworks } from '../services/tiktok-hashtag-stats';

const scraper = new TrendScraper();
const aiService = new AIEnrichmentService();
const creatorFinder = new CreatorFinderService();

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

// Stats endpoint - available at both paths for proxy compatibility
app.get(['/api/trends/stats', '/api/stats'], async (_req, res) => {
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

// TikTok hashtag stats via Clockworks actor (or configurable)
app.post('/api/tiktok/hashtag-stats', async (req, res) => {
  try {
    const { hashtags = [], resultsPerPage = 20 } = req.body || {};
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      res.status(400).json({ success: false, error: 'Provide hashtags: string[]' });
      return;
    }
    const { summaries } = await fetchTikTokHashtagStatsClockworks(hashtags.map((h: string) => h.replace('#','')), Math.min(100, Math.max(5, parseInt(resultsPerPage))))
    res.json({ success: true, data: summaries });
  } catch (error) {
    logger.error('Failed to fetch TikTok hashtag stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch TikTok hashtag stats' });
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

    logger.info(`📊 Narrative endpoint: totalTrends=${totalTrends}, recentTrends=${recentTrends}`);

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

    // Get top trends with platform diversity (5 from each major platform)
    // If no recent trends, fallback to wider timeframes: 7d, 30d, or all-time
    let lookbackDays = 1; // Start with 24h
    if (recentTrends === 0) {
      // Try progressively longer lookbacks
      const sevenDayCount = await Trend.count({
        where: { scrapedAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      });
      if (sevenDayCount > 0) {
        lookbackDays = 7;
      } else {
        const thirtyDayCount = await Trend.count({
          where: { scrapedAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        });
        lookbackDays = thirtyDayCount > 0 ? 30 : 365; // 30 days or all-time
      }
    }
    const lookbackTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    logger.info(`📊 Using ${lookbackDays}-day lookback for trends`);

    const tiktokTrends = await Trend.findAll({
      where: {
        platform: 'TikTok',
        confidence: { [Op.gte]: 0.1 },
        scrapedAt: { [Op.gte]: lookbackTime }
      },
      order: [['confidence', 'DESC'], ['scrapedAt', 'DESC']],
      limit: 10, // Get up to 10 from each platform
      raw: true
    });

    const twitterTrends = await Trend.findAll({
      where: {
        platform: 'X (Twitter)',
        confidence: { [Op.gte]: 0.1 },
        scrapedAt: { [Op.gte]: lookbackTime }
      },
      order: [['confidence', 'DESC'], ['scrapedAt', 'DESC']],
      limit: 10, // Get up to 10 from each platform
      raw: true
    });

    // Combine and sort by confidence, ensuring we get top 10 overall
    // This ensures we get 10 trends even if one platform has fewer results
    const topTrends = [...tiktokTrends, ...twitterTrends]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 10);

    logger.info(`📊 Found ${topTrends.length} top trends (TikTok: ${tiktokTrends.length}, Twitter: ${twitterTrends.length})`);

    // Get all recent trends to analyze content patterns
    const allRecentTrends = await Trend.findAll({
      where: {
        scrapedAt: {
          [Op.gte]: lookbackTime
        }
      },
      order: [['scrapedAt', 'DESC']],
      limit: 30,
      raw: true
    });

    logger.info(`📊 Found ${allRecentTrends.length} recent trends for analysis`);

    const statsForAI = {
      totalTrends,
      recentTrends: allRecentTrends.length, // Use actual count for AI
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
    logger.info('🤖 Calling AI service to generate narrative...');
    const narrative = await aiService.generateDashboardNarrative(statsForAI);
    logger.info('✅ AI narrative generated successfully');

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

app.post('/api/scrape', async (req, res) => {
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

    // Extract platform filter from request body
    const { platforms } = req.body || {};
    console.log('🎯 API: Received request body:', req.body);
    console.log('🎯 API: Extracted platforms:', platforms);
    logger.info('Manual scraping initiated via API', { platforms });

    // Initialize scraping progress
    progressManager.initializeScraping();

    res.json({
      success: true,
      message: 'Scraping started successfully',
      status: progressManager.getStatus()
    });

    // Run scraping asynchronously with platform filter
    const result = await scraper.scrapeAllSources(platforms);
    
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

// Export trends (last scrape or recent DB) as JSON/CSV, optional crossover scoring
app.get('/api/scrape/export', async (req, res) => {
  try {
    const format = ((req.query.format as string) || 'json').toLowerCase();
    const source = ((req.query.source as string) || 'last').toLowerCase(); // 'last' | 'db'
    const timeframe = (req.query.timeframe as string) || '24h';
    const platforms = ((req.query.platforms as string) || '').split(',').map(s => s.trim()).filter(Boolean);
    const includeScore = ((req.query.score as string) || 'false').toLowerCase() === 'true';

    let items: any[] = [];

    if (source === 'last') {
      const s = progressManager.getStatus();
      if (Array.isArray(s.trends) && s.trends.length) {
        items = s.trends as any[];
      }
      // Fallback to recent DB if empty
      if (!items.length) {
        const since = new Date();
        since.setDate(since.getDate() - 1);
        const where: any = { scrapedAt: { [Op.gte]: since } };
        if (platforms.length) where.platform = { [Op.in]: platforms };
        items = await Trend.findAll({ where, order: [['scrapedAt', 'DESC']], limit: 1000, raw: true });
      }
    } else {
      // From DB by timeframe
      const since = new Date();
      if (timeframe === '24h') since.setDate(since.getDate() - 1);
      else if (timeframe === '7d') since.setDate(since.getDate() - 7);
      else if (timeframe === '30d') since.setDate(since.getDate() - 30);
      else since.setDate(since.getDate() - 1);
      const where: any = { scrapedAt: { [Op.gte]: since } };
      if (platforms.length) where.platform = { [Op.in]: platforms };
      items = await Trend.findAll({ where, order: [['scrapedAt', 'DESC']], limit: 2000, raw: true });
    }

    // Optionally include crossover score/signals (preserves fields by spreading)
    let out: any[] = items;
    if (includeScore) {
      try {
        out = scoreTrends(items as any) as any[];
      } catch (e) {
        logger.warn('Crossover scoring failed during export; returning unscored data');
      }
    }

    // Enrich with metrics (volume/rate/growth) similar to top-with-metrics
    function extractVolume(t: any): number | null {
      const md = t.metadata || {};
      if (t.platform === 'Instagram') {
        if (typeof md.posts_count === 'number') return md.posts_count;
        const m = String(t.popularity || '').match(/([0-9,.]+)\s*([KkMmBb])?/);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          const unit = (m[2] || '').toUpperCase();
          const mul = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
          return Math.round(n * mul);
        }
      } else if (t.platform === 'TikTok') {
        const od = md.original_data || {};
        if (typeof od.video_views === 'number') return od.video_views;
        if (typeof od.publish_cnt === 'number') return od.publish_cnt;
        const m = String(t.popularity || '').match(/([0-9,.]+)\s*([KkMmBb])?/);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          const unit = (m[2] || '').toUpperCase();
          const mul = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
          return Math.round(n * mul);
        }
      }
      return null;
    }
    function extractRatePerDay(t: any): number | null {
      const md = t.metadata || {};
      if (t.platform === 'Instagram' && typeof md.posts_per_day === 'number') return md.posts_per_day;
      const od = md.original_data || {};
      if (typeof od.daily_posts === 'number') return od.daily_posts;
      if (typeof md.posts_per_day === 'number') return md.posts_per_day;
      return null;
    }
    function formatCompact(n: number | null): string {
      if (!n && n !== 0) return '';
      const abs = Math.abs(n as number);
      if (abs >= 1e9) return `${(abs/1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `${(abs/1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${Math.round(abs/1e3)}K`;
      return String(abs);
    }

    const enriched: any[] = [];
    for (const t of out) {
      const vol = extractVolume(t);
      const prev = await Trend.findOne({
        where: {
          hashtag: t.hashtag,
          platform: t.platform,
          scrapedAt: { [Op.lt]: t.scrapedAt || new Date() }
        },
        order: [[ 'scrapedAt', 'DESC' ]],
        raw: true
      });
      const prevVol = prev ? extractVolume(prev) : null;
      let growth: number | null = null;
      if (prevVol && vol && prevVol > 0) growth = (vol - prevVol) / prevVol;
      const ratePerDay = extractRatePerDay(t);
      enriched.push({
        ...t,
        volume: vol,
        volumeDisplay: formatCompact(vol),
        ratePerDay,
        rateDisplay: ratePerDay == null ? '' : `${Math.round(ratePerDay)}/d`,
        growth,
        growthDisplay: growth === null ? '' : `${(growth*100).toFixed(growth > -0.1 && growth < 0.1 ? 1 : 0)}%`
      });
    }
    out = enriched;

    // Prepare filename
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `trends_export_${source}_${ts}`;

    if (format === 'csv') {
      // Flatten records for CSV
      const rows = out.map((r: any) => ({
        hashtag: r.hashtag || '',
        platform: r.platform || '',
        category: r.category || '',
        sentiment: r.sentiment || '',
        confidence: typeof r.confidence === 'number' ? r.confidence : '',
        crossoverScore: typeof r.crossoverScore === 'number' ? r.crossoverScore : '',
        westCoast: r.signals?.westCoast ?? '',
        indiaAffinity: r.signals?.indiaAffinity ?? '',
        memeability: r.signals?.memeability ?? '',
        scrapedAt: r.scrapedAt ? new Date(r.scrapedAt).toISOString() : '',
        volume: r.volume ?? '',
        volumeDisplay: r.volumeDisplay ?? '',
        ratePerDay: r.ratePerDay ?? '',
        rateDisplay: r.rateDisplay ?? '',
        growth: r.growth ?? '',
        growthDisplay: r.growthDisplay ?? '',
        popularity: r.popularity || '',
        aiInsights: (r.aiInsights || '').toString().replace(/\n/g, ' ')
      }));

      const headers = Object.keys(rows[0] || { hashtag: '', platform: '', category: '', sentiment: '', confidence: '', crossoverScore: '', westCoast: '', indiaAffinity: '', memeability: '', scrapedAt: '', volume: '', volumeDisplay: '', ratePerDay: '', rateDisplay: '', growth: '', growthDisplay: '', popularity: '', aiInsights: '' });
      const csv = [headers.join(',')]
        .concat(rows.map(r => headers.map(h => {
          const v = (r as any)[h];
          if (v === null || v === undefined) return '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        }).join(',')))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.send(csv);
      return;
    }

    // JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    res.send(JSON.stringify(out, null, 2));
  } catch (error) {
    logger.error('Failed to export trends:', error);
    res.status(500).json({ success: false, error: 'Failed to export trends' });
  }
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

// Top trends with volume and simple growth estimate vs previous record
app.get('/api/trending/top-with-metrics', async (req, res) => {
  try {
    const { platform, timeframe = '24h', limit = 10 } = req.query as any;

    let since = new Date();
    if (timeframe === '24h') since.setDate(since.getDate() - 1);
    else if (timeframe === '7d') since.setDate(since.getDate() - 7);
    else if (timeframe === '30d') since.setDate(since.getDate() - 30);

    const whereClause: any = { scrapedAt: { [Op.gte]: since } };
    if (platform && platform !== 'all') whereClause.platform = platform;

    const topTrends = await Trend.findAll({
      where: whereClause,
      order: [[ 'confidence', 'DESC' ], [ 'scrapedAt', 'DESC' ]],
      limit: parseInt(limit as string),
      raw: true
    });

    function extractVolume(t: any): number | null {
      // Instagram: metadata.posts_count; TikTok: metadata.original_data.video_views or publish_cnt
      const md = t.metadata || {};
      if (t.platform === 'Instagram') {
        if (typeof md.posts_count === 'number') return md.posts_count;
        // Fallback: parse popularity like "1.4M posts"
        const m = String(t.popularity || '').match(/([0-9,.]+)\s*([KkMmBb])?/);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          const unit = (m[2] || '').toUpperCase();
          const mul = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
          return Math.round(n * mul);
        }
      } else if (t.platform === 'TikTok') {
        const od = md.original_data || {};
        if (typeof od.video_views === 'number') return od.video_views;
        if (typeof od.publish_cnt === 'number') return od.publish_cnt;
        // Parse popularity string if present
        const m = String(t.popularity || '').match(/([0-9,.]+)\s*([KkMmBb])?/);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          const unit = (m[2] || '').toUpperCase();
          const mul = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
          return Math.round(n * mul);
        }
      }
      return null;
    }

    function extractRatePerDay(t: any): number | null {
      const md = t.metadata || {};
      // Instagram actor provides posts_per_day
      if (t.platform === 'Instagram' && typeof md.posts_per_day === 'number') return md.posts_per_day;
      // TikTok: if future actor provides daily_posts or posts_per_day
      const od = md.original_data || {};
      if (typeof od.daily_posts === 'number') return od.daily_posts;
      if (typeof md.posts_per_day === 'number') return md.posts_per_day;
      return null;
    }

    function formatCompact(n: number | null): string {
      if (!n && n !== 0) return '';
      const abs = Math.abs(n as number);
      if (abs >= 1e9) return `${(abs/1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `${(abs/1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${Math.round(abs/1e3)}K`;
      return String(abs);
    }

    const withMetrics = [] as any[];
    for (const t of topTrends) {
      const vol = extractVolume(t);
      // Find previous record for same hashtag/platform
      const prev = await Trend.findOne({
        where: {
          hashtag: t.hashtag,
          platform: t.platform,
          scrapedAt: { [Op.lt]: t.scrapedAt }
        },
        order: [[ 'scrapedAt', 'DESC' ]],
        raw: true
      });
      const prevVol = prev ? extractVolume(prev) : null;
      const ratePerDay = extractRatePerDay(t);
      let growth: number | null = null;
      if (prevVol && vol && prevVol > 0) {
        growth = (vol - prevVol) / prevVol; // fraction
      }
      withMetrics.push({
        ...t,
        volume: vol,
        volumeDisplay: formatCompact(vol),
        growth,
        growthDisplay: growth === null ? '' : `${(growth*100).toFixed(growth > -0.1 && growth < 0.1 ? 1 : 0)}%`,
        ratePerDay,
        rateDisplay: ratePerDay == null ? '' : `${Math.round(ratePerDay)}/d`
      });
    }

    res.json({ success: true, data: withMetrics, timeframe, platform: platform || 'all' });
  } catch (error) {
    logger.error('Failed to fetch top trends with metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top trends with metrics' });
  }
});

// Crossover scoring endpoint: score provided trends for West-Coast -> India resonance
app.post('/api/crossover/score', async (req, res) => {
  try {
    const { trends } = req.body || {};
    if (!Array.isArray(trends)) {
      res.status(400).json({ success: false, error: 'Body must include trends: TrendLike[]' });
      return;
    }
    const scored = scoreTrends(trends);
    res.json({ success: true, data: scored });
  } catch (error) {
    logger.error('Failed to score crossover trends:', error);
    res.status(500).json({ success: false, error: 'Failed to score trends' });
  }
});

// Creator search endpoint: find creators by platform + query
app.get('/api/creators/search', async (req, res) => {
  try {
    const platform = (req.query.platform as string || '').toLowerCase();
    const q = (req.query.q as string || '').trim();
    const limit = parseInt((req.query.limit as string) || '10');
    const minFollowers = parseInt((req.query.minFollowers as string) || '0');
    const includeUnknown = ((req.query.includeUnknown as string) || 'false').toLowerCase() === 'true';
    logger.info(`[Creators/Search] platform=${platform} q="${q}" limit=${limit} minFollowers=${minFollowers}`);
    // ensure visibility even if logger level is high
    console.log('[Creators/Search]', { platform, q, limit, minFollowers, serpapi: !!process.env.SERPAPI_API_KEY, apify: !!(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY) });

    if (!platform) {
      res.status(400).json({ success: false, error: 'platform required (instagram|tiktok|both)' });
      return;
    }
    if (!q) {
      res.status(400).json({ success: false, error: 'q (query) is required' });
      return;
    }

    if (platform === 'both' || platform === 'all') {
      const [ig, tt] = await Promise.all([
        creatorFinder.searchCreators({ platform: 'instagram', query: q, limit: Math.min(limit, 25), minFollowers, includeUnknown, regionHint: req.query.region as string | undefined }),
        creatorFinder.searchCreators({ platform: 'tiktok', query: q, limit: Math.min(limit, 25), minFollowers, includeUnknown, regionHint: req.query.region as string | undefined })
      ]);
      const merged = [...ig, ...tt];
      logger.info(`[Creators/Search] results both: IG=${ig.length} TT=${tt.length} total=${merged.length}`);
      console.log('[Creators/Search] results both', { ig: ig.length, tt: tt.length, total: merged.length });
      res.json({ success: true, data: merged, meta: { ig: ig.length, tt: tt.length } });
      return;
    }

    if (!['instagram','tiktok'].includes(platform)) {
      res.status(400).json({ success: false, error: 'platform must be instagram or tiktok or both' });
      return;
    }

    const creators = await creatorFinder.searchCreators({ platform: platform as 'instagram' | 'tiktok', query: q, limit: Math.min(limit, 25), minFollowers, includeUnknown, regionHint: req.query.region as string | undefined });
    logger.info(`[Creators/Search] results ${platform}: ${creators.length}`);
    console.log('[Creators/Search] results', platform, creators.length);
    res.json({ success: true, data: creators, meta: { [platform]: creators.length } });
  } catch (error) {
    logger.error('Failed to search creators:', error);
    console.error('[Creators/Search] error', error);
    res.status(500).json({ success: false, error: 'Failed to search creators' });
  }
});

// Creator providers status (for debugging UI)
app.get('/api/creators/providers', (_req, res) => {
  try {
    const apify = !!(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY);
    const serpapi = !!process.env.SERPAPI_API_KEY;
    res.json({ success: true, data: { apify, serpapi } });
  } catch (error) {
    res.json({ success: true, data: { apify: false, serpapi: false } });
  }
});

// Simple test endpoint to verify request path and logging
app.get('/api/creators/test', (req, res) => {
  const q = (req.query.q as string) || '';
  console.log('[Creators/Test] received', { q });
  res.json({ success: true, data: { q, ts: new Date().toISOString() } });
});

// Discover creators from current trend seeds (via creator search fallback over seeds)
app.post('/api/creators/discover', async (req, res) => {
  try {
    const { platforms = ['instagram','tiktok'], seeds = [], perPlatform = 10, minFollowers = 0, includeUnknown = false } = req.body || {};
    logger.info(`[Creators/Discover] platforms=${platforms.join('+')} seeds=${seeds.length} minFollowers=${minFollowers}`);
    if (!Array.isArray(seeds) || seeds.length === 0) {
      res.status(400).json({ success: false, error: 'Provide seeds: string[] (hashtags/keywords)' });
      return;
    }

    const targetPlatforms: Array<'instagram'|'tiktok'> = (Array.isArray(platforms) ? platforms : []).filter((p: string) => ['instagram','tiktok'].includes((p||'').toLowerCase())).map((p: string) => p.toLowerCase() as 'instagram'|'tiktok');
    if (!targetPlatforms.length) {
      res.status(400).json({ success: false, error: 'platforms must include instagram and/or tiktok' });
      return;
    }

    const out: Record<string, any[]> = {};

    // Optionally expand Instagram seeds via related hashtags
    let igSeeds = seeds;
    try {
      if (targetPlatforms.includes('instagram')) {
        const expanded = await fetchInstagramRelatedHashtags(seeds, 20);
        igSeeds = Array.from(new Set([...seeds, ...expanded.map(e => e.hashtag.replace('#',''))]));
      }
    } catch (e) {
      logger.warn('Seed expansion failed, continuing with original seeds');
    }

    for (const plat of targetPlatforms) {
      const uniq = new Map<string, any>();
      const useSeeds = plat === 'instagram' ? igSeeds : seeds;
      for (const s of useSeeds) {
        const q = s.toString().replace(/^#/, '');
        const creators = await creatorFinder.searchCreators({ platform: plat, query: q, limit: Math.max(5, perPlatform), minFollowers, includeUnknown });
        for (const c of creators) {
          const key = `${c.platform}:${(c.handle||'').toLowerCase()}`;
          if (!uniq.has(key)) uniq.set(key, c);
          if (uniq.size >= perPlatform) break;
        }
        if (uniq.size >= perPlatform) break;
      }
      out[plat] = Array.from(uniq.values());
    }

    const igCount = (out.instagram || []).length; const ttCount = (out.tiktok || []).length;
    logger.info(`[Creators/Discover] results IG=${igCount} TT=${ttCount}`);
    res.json({ success: true, data: out, meta: { ig: igCount, tt: ttCount } });
  } catch (error) {
    logger.error('Failed to discover creators from trends:', error);
    res.status(500).json({ success: false, error: 'Failed to discover creators' });
  }
});

// Related hashtags from seed trends/keywords
app.post('/api/hashtags/related', async (req, res) => {
  try {
    const { platform = 'instagram', hashtags = [], limit = 12, timeframe = '7d' } = req.body || {};
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      res.status(400).json({ success: false, error: 'Provide hashtags: string[]' });
      return;
    }

    if (platform === 'instagram') {
      const out = await fetchInstagramRelatedHashtags(hashtags, Math.min(30, Math.max(3, parseInt(limit))));
      res.json({ success: true, data: out });
      return;
    }

    if (platform === 'tiktok') {
      // Fallback related suggestion: use recent TikTok trends from DB and filter by seed fragments
      let since = new Date();
      if (timeframe === '24h') since.setDate(since.getDate() - 1);
      else if (timeframe === '30d') since.setDate(since.getDate() - 30);
      else since.setDate(since.getDate() - 7);

      const recent = await Trend.findAll({
        where: {
          platform: 'TikTok',
          scrapedAt: { [Op.gte]: since }
        },
        order: [[ 'confidence', 'DESC' ], [ 'scrapedAt', 'DESC' ]],
        limit: 200,
        raw: true
      });

      const seedTerms = (hashtags as string[])
        .map(h => h.toString().toLowerCase().replace(/[#\s]/g, ''))
        .filter(Boolean);

      const seen = new Set<string>();
      const matched: any[] = [];
      const others: any[] = [];

      for (const r of recent) {
        const tag = (r.hashtag || '').toString();
        if (!tag) continue;
        const norm = tag.toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        const match = seedTerms.some(s => norm.includes(s));
        const item = { hashtag: tag, popularity: undefined as any, source: match ? 'seed_match' : 'trending_db' };
        if (typeof r.popularity === 'string') item.popularity = r.popularity;
        (match ? matched : others).push(item);
      }

      const out = [...matched, ...others].slice(0, Math.min(30, Math.max(3, parseInt(limit))));
      res.json({ success: true, data: out });
      return;
    }

    res.status(400).json({ success: false, error: 'platform must be instagram or tiktok' });
  } catch (error) {
    logger.error('Failed to fetch related hashtags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch related hashtags' });
  }
});

// AI Intel Briefing Endpoints for Unified Dashboard Integration
// These endpoints allow the unified dashboard to properly wait for and retrieve AI insights

// Check if AI Intel briefing is ready/loading
app.get('/api/intel/status', async (_req, res) => {
  try {
    // Check if we have recent trends and AI analysis
    // Extended to 7 days to be more flexible with "recent" definition
    const recentTrends = await Trend.count({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days instead of 24 hours
        }
      }
    });

    const trendsWithAI = await Trend.count({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days instead of 24 hours
        },
        aiInsights: {
          [Op.ne]: ''
        }
      }
    });

    // Also get total trends as fallback info
    const totalTrends = await Trend.count();

    const isReady = recentTrends > 0 && trendsWithAI > 0;
    const lastUpdate = await Trend.findOne({
      order: [['scrapedAt', 'DESC']],
      attributes: ['scrapedAt'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        isReady,
        isLoading: false, // We'll implement real-time loading status later
        recentTrends,
        totalTrends,
        trendsWithAI,
        aiCoverage: recentTrends > 0 ? (trendsWithAI / recentTrends) : 0,
        lastUpdate: lastUpdate?.scrapedAt,
        status: isReady ? 'ready' : (totalTrends > 0 ? 'trends_need_ai' : 'insufficient_data')
      }
    });
  } catch (error) {
    logger.error('Failed to check intel status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check intel status'
    });
  }
});

// Get AI Intel briefing (Strategic Insights + Top 10 trends)
app.get('/api/intel/briefing', async (_req, res) => {
  try {
    // This is similar to narrative but formatted specifically for crossover analysis
    const briefingData = await generateIntelBriefing();

    res.json({
      success: true,
      data: briefingData
    });
  } catch (error) {
    logger.error('Failed to generate intel briefing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate intel briefing'
    });
  }
});

// Get Strategic Insights and Top 10 trends in crossover-ready format
app.get('/api/strategic-insights', async (_req, res) => {
  try {
    const briefing = await generateIntelBriefing();

    // Format specifically for crossover analysis
    const strategicData = {
      strategicInsights: briefing.narrative,
      topTrends: briefing.topTrends,
      marketContext: briefing.marketContext,
      generatedAt: new Date().toISOString(),
      confidence: briefing.confidence,
      analysisDepth: 'comprehensive'
    };

    res.json({
      success: true,
      data: strategicData
    });
  } catch (error) {
    logger.error('Failed to get strategic insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get strategic insights'
    });
  }
});

// Trigger AI analysis if needed (for manual refresh)
app.post('/api/intel/trigger', async (_req, res) => {
  try {
    // Get recent trends that might need AI analysis
    const allRecentTrends = await Trend.findAll({
      where: {
        scrapedAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      limit: 20,
      order: [['scrapedAt', 'DESC']]
    });

    // Filter for trends that need AI analysis
    const trendsNeedingAI = allRecentTrends.filter(t =>
      !t.aiInsights || t.aiInsights.trim() === ''
    );

    if (trendsNeedingAI.length > 0) {
      // Trigger AI analysis for these trends
      const analyses = await aiService.analyzeTrends(trendsNeedingAI.map(t => ({
        hashtag: t.hashtag,
        platform: t.platform,
        category: t.category,
        content: (t as any).content || '',
        metadata: t.metadata as any
      })));

      // Update trends with AI insights
      for (const trend of trendsNeedingAI) {
        const key = `${trend.hashtag}_${trend.platform}`;
        const analysis = analyses.get(key);
        if (analysis) {
          await trend.update({
            aiInsights: analysis.insights,
            sentiment: analysis.sentiment,
            confidence: analysis.confidence
          });
        }
      }

      res.json({
        success: true,
        data: {
          message: 'AI analysis triggered',
          trendsAnalyzed: trendsNeedingAI.length,
          status: 'processing'
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          message: 'No trends need AI analysis',
          status: 'up_to_date'
        }
      });
    }
  } catch (error) {
    logger.error('Failed to trigger AI analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger AI analysis'
    });
  }
});

// Helper function to generate comprehensive intel briefing
async function generateIntelBriefing() {
  // Get top trends with platform diversity
  const tiktokTrends = await Trend.findAll({
    where: {
      platform: 'TikTok',
      confidence: { [Op.gte]: 0.1 }
    },
    order: [['confidence', 'DESC'], ['scrapedAt', 'DESC']],
    limit: 5,
    raw: true
  });

  const twitterTrends = await Trend.findAll({
    where: {
      platform: 'X (Twitter)',
      confidence: { [Op.gte]: 0.1 }
    },
    order: [['confidence', 'DESC'], ['scrapedAt', 'DESC']],
    limit: 5,
    raw: true
  });

  // Combine for top 10 with diversity
  const topTrends = [...tiktokTrends, ...twitterTrends]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 10);

  // Get comprehensive stats for AI analysis
  const recentTrends = await Trend.findAll({
    where: {
      scrapedAt: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    },
    order: [['scrapedAt', 'DESC']],
    limit: 30,
    raw: true
  });

  const platformStats = await Trend.findAll({
    attributes: [
      'platform',
      [Trend.sequelize!.fn('COUNT', '*'), 'count']
    ],
    group: 'platform',
    raw: true
  });

  const statsForAI = {
    topTrends: topTrends.map(t => ({
      hashtag: t.hashtag,
      platform: t.platform,
      sentiment: t.sentiment,
      confidence: t.confidence,
      aiInsights: t.aiInsights,
      category: t.category
    })),
    recentTrends: recentTrends.map(t => ({
      hashtag: t.hashtag,
      platform: t.platform,
      category: t.category,
      confidence: t.confidence,
      aiInsights: t.aiInsights
    })),
    platformStats
  };

  // Generate AI narrative focused on strategic insights
  const narrative = await aiService.generateDashboardNarrative(statsForAI);

  return {
    narrative,
    topTrends: topTrends.map(t => ({
      hashtag: t.hashtag,
      platform: t.platform,
      category: t.category || 'General',
      confidence: t.confidence,
      sentiment: t.sentiment || 'neutral',
      aiInsights: t.aiInsights,
      scrapedAt: t.scrapedAt
    })),
    marketContext: {
      totalActiveTrends: recentTrends.length,
      platformDistribution: platformStats,
      averageConfidence: topTrends.reduce((acc, t) => acc + (t.confidence || 0), 0) / topTrends.length,
      lastUpdated: new Date().toISOString()
    },
    confidence: topTrends.length >= 5 ? 'high' : topTrends.length >= 2 ? 'medium' : 'low'
  };
}

// Serve dashboard HTML
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Serve Amazon Prime India extension UI
app.get(['/prime-india', '/extension/prime-india'], (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/prime-india.html'));
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
