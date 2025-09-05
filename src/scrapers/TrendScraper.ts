import { BrowserManager } from '../utils/browser';
import { AIEnrichmentService } from '../services/ai-enrichment';
import { TrendSource, TrendData } from '../types';
import { TikTokSource } from './sources/tiktok';
import { PinterestSource } from './sources/pinterest';
import { TwitterSource } from './sources/twitter';
import Trend from '../models/Trend';
import { logger } from '../config/database';
import axios from 'axios';
import cron from 'node-cron';

export class TrendScraper {
  private browserManager: BrowserManager;
  private aiService: AIEnrichmentService;
  private sources: TrendSource[];
  private isRunning = false;

  constructor() {
    this.browserManager = new BrowserManager();
    this.aiService = new AIEnrichmentService();
    this.sources = [
      TikTokSource,
      PinterestSource,
      TwitterSource
    ];
  }

  async initialize(): Promise<void> {
    try {
      await Trend.sync({ alter: true });
      logger.info('TrendScraper initialized successfully');
    } catch (error) {
      logger.error('TrendScraper initialization failed:', error);
      throw error;
    }
  }

  async scrapeAllSources(): Promise<{ trends: any[], report: string }> {
    if (this.isRunning) {
      logger.warn('Scraping already in progress');
      return { trends: [], report: 'Scraping already in progress' };
    }

    this.isRunning = true;
    const allTrends: any[] = [];

    try {
      logger.info('Starting comprehensive trend scraping...');

      for (const source of this.sources) {
        try {
          logger.info(`Scraping ${source.name}...`);
          const trends = await this.scrapeSource(source);
          
          if (trends.length > 0) {
            const aiAnalyses = await this.aiService.analyzeTrends(trends);
            const enrichedTrends = await this.saveEnrichedTrends(trends, aiAnalyses, source);
            allTrends.push(...enrichedTrends);
            logger.info(`Successfully scraped ${enrichedTrends.length} trends from ${source.name}`);
          } else {
            logger.warn(`No trends found for ${source.name}`);
          }

        } catch (sourceError) {
          logger.error(`Failed to scrape ${source.name}:`, sourceError);
          continue;
        }

        const delay = this.browserManager.getRandomDelay(10000, 30000);
        logger.debug(`Waiting ${delay}ms before next source...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const report = await this.aiService.generateTrendReport(allTrends);
      
      logger.info(`Scraping complete. Total trends: ${allTrends.length}`);
      return { trends: allTrends, report };

    } catch (error) {
      logger.error('Comprehensive scraping failed:', error);
      return { trends: allTrends, report: 'Scraping encountered errors' };
    } finally {
      await this.cleanup();
      this.isRunning = false;
    }
  }

  private async scrapeSource(source: TrendSource): Promise<TrendData[]> {
    if (source.scrapeMethod === 'puppeteer') {
      return await this.scrapePuppeteer(source);
    } else {
      return await this.scrapeAxios(source);
    }
  }

  private async scrapePuppeteer(source: TrendSource): Promise<TrendData[]> {
    await this.browserManager.launch();
    const page = await this.browserManager.createStealthPage();

    try {
      logger.debug(`Navigating to ${source.url}`);
      await page.goto(source.url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await this.browserManager.randomWait(page, 3000, 7000);
      await this.browserManager.humanScroll(page);
      await this.browserManager.randomWait(page, 2000, 5000);

      const trends = await source.extractionLogic(page);
      return trends;

    } finally {
      await page.close();
    }
  }

  private async scrapeAxios(source: TrendSource): Promise<TrendData[]> {
    try {
      const userAgent = this.browserManager.getRandomUserAgent();
      const response = await axios.get(source.url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000
      });

      const delay = this.browserManager.getRandomDelay(2000, 5000);
      await new Promise(resolve => setTimeout(resolve, delay));

      return await source.extractionLogic(response.data);
    } catch (error) {
      logger.error(`Axios scraping failed for ${source.name}:`, error);
      return [];
    }
  }

  private async saveEnrichedTrends(trends: TrendData[], analyses: Map<string, any>, source: TrendSource): Promise<any[]> {
    const savedTrends = [];

    for (const trend of trends) {
      const key = `${trend.hashtag || 'unknown'}_${trend.platform || 'unknown'}`;
      const analysis = analyses.get(key);

      try {
        const savedTrend = await Trend.create({
          source: source.name,
          hashtag: trend.hashtag,
          popularity: trend.popularity,
          category: trend.category,
          platform: trend.platform,
          region: trend.region,
          aiInsights: analysis?.insights,
          sentiment: analysis?.sentiment,
          predictedGrowth: analysis?.predictedGrowth,
          businessOpportunities: analysis?.businessOpportunities,
          relatedTrends: analysis?.relatedTrends,
          confidence: analysis?.confidence,
          metadata: trend.metadata,
          scrapedAt: new Date()
        });

        savedTrends.push(savedTrend.toJSON());
      } catch (error) {
        logger.error(`Failed to save trend ${trend.hashtag}:`, error);
      }
    }

    return savedTrends;
  }

  async schedulePeriodicScraping(intervalHours = 12): Promise<void> {
    const cronExpression = `0 */${intervalHours} * * *`;
    
    cron.schedule(cronExpression, async () => {
      logger.info('Starting scheduled scraping...');
      await this.scrapeAllSources();
    });

    logger.info(`Scheduled scraping every ${intervalHours} hours`);
  }

  async getRecentTrends(limit = 50): Promise<any[]> {
    try {
      const trends = await Trend.findAll({
        order: [['scrapedAt', 'DESC']],
        limit,
        raw: true
      });
      return trends;
    } catch (error) {
      logger.error('Failed to fetch recent trends:', error);
      return [];
    }
  }

  async getTrendsByPlatform(platform: string, limit = 20): Promise<any[]> {
    try {
      const trends = await Trend.findAll({
        where: { platform },
        order: [['scrapedAt', 'DESC']],
        limit,
        raw: true
      });
      return trends;
    } catch (error) {
      logger.error(`Failed to fetch ${platform} trends:`, error);
      return [];
    }
  }

  private async cleanup(): Promise<void> {
    await this.browserManager.close();
  }

  async shutdown(): Promise<void> {
    await this.cleanup();
    logger.info('TrendScraper shutdown complete');
  }
}