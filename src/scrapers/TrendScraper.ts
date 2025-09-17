import { BrowserManager } from '../utils/browser';
import { AIEnrichmentService } from '../services/ai-enrichment';
import { TrendSource, TrendData } from '../types';
import { TikTokSource } from './sources/tiktok';
// import { PinterestSource } from './sources/pinterest'; // Replaced with Apify version
import { ApifyTikTokHashtagSource } from './sources/apify-tiktok-hashtags';
import { ApifyInstagramSource } from './sources/apify-instagram';
import { ApifyPinterestSource } from './sources/apify-pinterest';
// import { TwitterSource } from './sources/twitter';
import { Trends24Source } from './sources/trends24';
import Trend from '../models/Trend';
import { logger } from '../config/database';
import axios from 'axios';
import cron from 'node-cron';

import { progressManager } from '../utils/progress-manager';

export class TrendScraper {
  private browserManager: BrowserManager;
  private aiService: AIEnrichmentService;
  private sources: TrendSource[];
  private isRunning = false;
  public statusCallback?: (status: any) => void;

  constructor() {
    this.browserManager = new BrowserManager();
    this.aiService = new AIEnrichmentService();
    this.sources = [
      ApifyTikTokHashtagSource, // Use Apify for better TikTok hashtag data
      ApifyInstagramSource, // Add Instagram trending hashtags
      ApifyPinterestSource, // Use Apify for better Pinterest data
      TikTokSource, // Keep as fallback
      Trends24Source // Using Trends24 instead of direct X.com due to auth requirements
      // PinterestSource, // Disabled - replaced with Apify version
      // TwitterSource // Disabled - X.com requires authentication as of 2025
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
    console.log('🚀 SCRAPER: scrapeAllSources() called');
    logger.info('🚀 SCRAPER: scrapeAllSources() called via logger');
    
    if (this.isRunning) {
      console.log('⚠️ SCRAPER: Already running, returning early');
      logger.warn('Scraping already in progress');
      return { trends: [], report: 'Scraping already in progress' };
    }

    console.log('✅ SCRAPER: Starting scraping process');
    this.isRunning = true;
    const allTrends: any[] = [];
    const scrapingStats = {
      totalSources: this.sources.length,
      completedSources: 0,
      successfulSources: 0,
      errors: [] as string[]
    };

    try {
      logger.info(`🚀 Starting comprehensive trend scraping across ${this.sources.length} sources...`);

      for (let i = 0; i < this.sources.length; i++) {
        const source = this.sources[i];
        const sourceProgress = `[${i + 1}/${this.sources.length}]`;
        
        try {
          logger.info(`${sourceProgress} 🎯 Starting scrape: ${source.name}`);
          logger.info(`${sourceProgress} 🌐 Target URL: ${source.url}`);
          logger.info(`${sourceProgress} ⚙️  Method: ${source.scrapeMethod}`);
          
          // Update progress - source starting
          progressManager.updateSourceProgress(source.name, 'running', 0, 0, 'Initializing scraper...');
          
          const trends = await this.scrapeSource(source);
          
          // Update progress - scraping completed
          progressManager.updateSourceProgress(source.name, 'running', 50, trends.length, `Scraped ${trends.length} raw trends`);
          scrapingStats.completedSources++;
          
          if (trends.length > 0) {
            logger.info(`${sourceProgress} ✅ Extracted ${trends.length} raw trends from ${source.name}`);
            logger.info(`${sourceProgress} 🧠 Starting AI analysis...`);
            
            // Update progress - AI analysis starting
            progressManager.updateSourceProgress(source.name, 'running', 70, trends.length, 'Running AI analysis...');
            
            const aiAnalyses = await this.aiService.analyzeTrends(trends);
            logger.info(`${sourceProgress} 🤖 AI analysis completed for ${aiAnalyses.size} trends`);
            
            // Update progress - saving to database
            progressManager.updateSourceProgress(source.name, 'running', 90, trends.length, 'Saving to database...');
            
            logger.info(`${sourceProgress} 💾 Saving enriched trends to database...`);
            const enrichedTrends = await this.saveEnrichedTrends(trends, aiAnalyses, source);
            allTrends.push(...enrichedTrends);
            
            scrapingStats.successfulSources++;
            logger.info(`${sourceProgress} ✨ Successfully processed ${enrichedTrends.length} trends from ${source.name}`);
            
            // Update progress - completed successfully
            progressManager.updateSourceProgress(source.name, 'completed', 100, enrichedTrends.length, `✅ Completed: ${enrichedTrends.length} trends saved`);
            
            // Log sample trends for debugging
            if (enrichedTrends.length > 0) {
              logger.info(`${sourceProgress} 📊 Sample trends: ${enrichedTrends.slice(0, 3).map(t => t.hashtag).join(', ')}`);
            }
          } else {
            logger.warn(`${sourceProgress} ⚠️  No trends found for ${source.name} - check selectors or site structure`);
            // Update progress - completed with no results
            progressManager.updateSourceProgress(source.name, 'completed', 100, 0, '⚠️ No trends found - selectors may need updating');
          }

        } catch (sourceError) {
          const errorMessage = sourceError instanceof Error ? sourceError.message : 'Unknown error';
          scrapingStats.errors.push(`${source.name}: ${errorMessage}`);
          logger.error(`${sourceProgress} ❌ Failed to scrape ${source.name}:`, sourceError);
          
          // Update progress - failed
          progressManager.updateSourceProgress(source.name, 'failed', 0, 0, '❌ Scraping failed', errorMessage);
          continue;
        }

        // Inter-source delay with logging
        if (i < this.sources.length - 1) {
          const delay = this.browserManager.getRandomDelay(10000, 30000);
          logger.info(`${sourceProgress} ⏳ Waiting ${Math.round(delay/1000)}s before next source to avoid detection...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      logger.info(`📈 Generating comprehensive AI trend report...`);
      const report = await this.aiService.generateTrendReport(allTrends);
      logger.info(`📋 AI trend report generated (${report.length} characters)`);
      
      logger.info(`🎉 Scraping complete! Summary:`);
      logger.info(`   • Sources processed: ${scrapingStats.completedSources}/${scrapingStats.totalSources}`);
      logger.info(`   • Successful sources: ${scrapingStats.successfulSources}/${scrapingStats.totalSources}`);
      logger.info(`   • Total trends collected: ${allTrends.length}`);
      logger.info(`   • Errors: ${scrapingStats.errors.length}`);
      
      if (scrapingStats.errors.length > 0) {
        logger.warn(`🚨 Errors encountered: ${scrapingStats.errors.join('; ')}`);
      }
      
      return { trends: allTrends, report };

    } catch (error) {
      logger.error('💥 Comprehensive scraping failed:', error);
      return { trends: allTrends, report: 'Scraping encountered critical errors' };
    } finally {
      await this.cleanup();
      this.isRunning = false;
      logger.info('🧹 Scraping cleanup completed');
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
    logger.info(`🚀 Launching browser for ${source.name}...`);
    await this.browserManager.launch();
    const page = await this.browserManager.createStealthPage();

    try {
      logger.info(`🌐 Navigating to: ${source.url}`);
      const startTime = Date.now();
      
      await page.goto(source.url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      const loadTime = Date.now() - startTime;
      logger.info(`✅ Page loaded in ${loadTime}ms`);

      // Check if page loaded properly
      const pageTitle = await page.title();
      logger.info(`📄 Page title: "${pageTitle}"`);
      
      const pageUrl = page.url();
      if (pageUrl !== source.url) {
        logger.warn(`🔄 Page redirected from ${source.url} to ${pageUrl}`);
      }

      // Human-like behavior simulation
      logger.info(`🎭 Simulating human behavior...`);
      const waitTime1 = this.browserManager.getRandomDelay(3000, 7000);
      logger.debug(`⏳ Random wait: ${waitTime1}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime1));
      
      logger.info(`📜 Performing human-like scrolling...`);
      await this.browserManager.humanScroll(page);
      
      const waitTime2 = this.browserManager.getRandomDelay(2000, 5000);
      logger.debug(`⏳ Post-scroll wait: ${waitTime2}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime2));

      // Check for selectors before extraction
      if (source.selectors?.waitFor) {
        logger.info(`🔍 Waiting for selector: ${source.selectors.waitFor}`);
        try {
          await page.waitForSelector(source.selectors.waitFor, { timeout: 10000 });
          logger.info(`✅ Target selector found`);
        } catch (selectorError) {
          logger.warn(`⚠️  Target selector not found: ${source.selectors.waitFor}`);
        }
      }

      // Extract data
      logger.info(`⚙️  Running extraction logic for ${source.name}...`);
      const extractionStart = Date.now();
      const trends = await source.extractionLogic(page);
      const extractionTime = Date.now() - extractionStart;
      
      logger.info(`🔢 Extraction completed in ${extractionTime}ms`);
      logger.info(`📊 Raw trends extracted: ${trends.length}`);
      
      if (trends.length > 0) {
        logger.info(`📋 Sample extracted data: ${JSON.stringify(trends.slice(0, 2), null, 2)}`);
        return trends;
      } else {
        logger.warn(`⚠️  No trends extracted - applying fallback extraction...`);
        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        logger.debug(`📄 Page content preview: ${bodyText}...`);
        
        // Apply fallback extraction for Puppeteer pages
        const pageHtml = await page.content();
        const fallbackTrends = await this.applyFallbackExtraction(pageHtml, source);
        
        if (fallbackTrends.length > 0) {
          logger.info(`🔄 Fallback extraction successful: ${fallbackTrends.length} trends found`);
        }
        
        return fallbackTrends;
      }

    } catch (error) {
      logger.error(`💥 Puppeteer scraping failed for ${source.name}:`, error);
      
      // Try to get more debug info
      try {
        const pageUrl = page.url();
        const pageTitle = await page.title();
        logger.error(`🔍 Debug info - URL: ${pageUrl}, Title: ${pageTitle}`);
      } catch (debugError) {
        logger.error(`❌ Could not get debug info:`, debugError);
      }
      
      return [];
    } finally {
      await page.close();
      logger.debug(`🚪 Browser page closed for ${source.name}`);
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

      const extractedTrends = await source.extractionLogic(response.data);
      
      // Apply fallback extraction if primary method failed
      if (extractedTrends.length === 0) {
        logger.warn(`Primary extraction failed for ${source.name}, trying fallback methods...`);
        const fallbackTrends = await this.applyFallbackExtraction(response.data, source);
        return fallbackTrends;
      }
      
      return extractedTrends;
    } catch (error) {
      logger.error(`Axios scraping failed for ${source.name}:`, error);
      return [];
    }
  }

  /**
   * Advanced fallback extraction strategies for when primary selectors fail
   */
  private async applyFallbackExtraction(html: string, source: TrendSource): Promise<TrendData[]> {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const trends: TrendData[] = [];
    
    console.log(`🔄 FALLBACK: Applying emergency extraction for ${source.name}`);
    
    // Strategy 1: Generic hashtag pattern matching
    const hashtagStrategy = this.extractHashtagPatterns($, source);
    trends.push(...hashtagStrategy);
    
    // Strategy 2: Common text pattern extraction
    if (trends.length < 3) {
      const textPatternStrategy = this.extractTextPatterns($, source);
      trends.push(...textPatternStrategy);
    }
    
    // Strategy 3: URL-based extraction
    if (trends.length < 3) {
      const urlStrategy = this.extractFromUrls($, source);
      trends.push(...urlStrategy);
    }
    
    // Strategy 4: AI-powered content analysis (last resort)
    if (trends.length < 2) {
      const aiStrategy = await this.extractWithAIAnalysis(html, source);
      trends.push(...aiStrategy);
    }
    
    console.log(`📊 FALLBACK: Extracted ${trends.length} trends using fallback methods`);
    logger.info(`Fallback extraction yielded ${trends.length} trends for ${source.name}`);
    
    return trends.slice(0, 10); // Limit fallback results
  }
  
  private extractHashtagPatterns($: any, source: TrendSource): TrendData[] {
    const trends: TrendData[] = [];
    const hashtagRegex = /#[\w\u4e00-\u9fff]+/g;
    const pageText = $('body').text();
    const hashtags = pageText.match(hashtagRegex) || [];
    
    const hashtagSet = new Set(hashtags);
    const hashtagArray = Array.from(hashtagSet) as string[];
    const uniqueHashtags = hashtagArray
      .filter((tag: string) => tag.length > 2 && tag.length < 50)
      .slice(0, 5);
    
    uniqueHashtags.forEach((hashtag: string) => {
      trends.push({
        hashtag: hashtag,
        popularity: 'Trending',
        category: 'General',
        platform: source.name,
        region: 'Global',
        timestamp: new Date(),
        metadata: {
          source_url: source.url,
          scraped_from: source.name,
          extraction_method: 'fallback_hashtag_pattern'
        }
      });
    });
    
    return trends;
  }
  
  private extractTextPatterns($: any, source: TrendSource): TrendData[] {
    const trends: TrendData[] = [];
    
    // Common trending text patterns
    const trendingKeywords = [
      'trending', 'popular', 'viral', 'breaking', 'hot', 'top', 
      'most', 'best', 'new', 'latest', 'now', 'today'
    ];
    
    const textElements = $('span, div, p, h1, h2, h3, h4, h5, strong, b, a').toArray();
    const potentialTrends: Set<string> = new Set();
    
    textElements.forEach((element: any) => {
      const text = $(element).text().trim();
      
      // Look for text near trending keywords
      const hasNearbyTrendingKeyword = trendingKeywords.some(keyword => {
        const parent = $(element).parent();
        const siblings = $(element).siblings();
        const nearby = parent.text() + siblings.text();
        return nearby.toLowerCase().includes(keyword);
      });
      
      if (hasNearbyTrendingKeyword && text.length > 3 && text.length < 60) {
        // Filter out common UI text
        if (!text.match(/^(Home|Search|Profile|Settings|About|Contact|Help|Login|Sign|Register|More|Menu|Close|Open|Back|Next|Previous)$/i) &&
            !text.includes('@') && !text.includes('http') && 
            text.match(/[a-zA-Z]/) && text.split(' ').length <= 5) {
          potentialTrends.add(text);
        }
      }
    });
    
    Array.from(potentialTrends).slice(0, 5).forEach(trendText => {
      trends.push({
        hashtag: trendText.startsWith('#') ? trendText : `#${trendText.replace(/\s+/g, '')}`,
        popularity: 'Trending',
        category: 'General',
        platform: source.name,
        region: 'Global',
        timestamp: new Date(),
        metadata: {
          source_url: source.url,
          scraped_from: source.name,
          extraction_method: 'fallback_text_pattern'
        }
      });
    });
    
    return trends;
  }
  
  private extractFromUrls($: any, source: TrendSource): TrendData[] {
    const trends: TrendData[] = [];
    const urlPatterns = [
      /\/search\/([^\/\?&]+)/g,
      /\/explore\/([^\/\?&]+)/g,
      /\/trending\/([^\/\?&]+)/g,
      /\/hashtag\/([^\/\?&]+)/g,
      /\/topic\/([^\/\?&]+)/g,
      /q=([^&\?]+)/g
    ];
    
    $('a[href]').each((_i: number, element: any) => {
      const href = $(element).attr('href') || '';
      
      urlPatterns.forEach(pattern => {
        const matches = href.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const extracted = decodeURIComponent(match[1])
              .replace(/[+%20_-]/g, ' ')
              .trim();
            
            if (extracted.length > 2 && extracted.length < 50 && trends.length < 5) {
              trends.push({
                hashtag: extracted.startsWith('#') ? extracted : `#${extracted.replace(/\s+/g, '')}`,
                popularity: 'Trending',
                category: 'General',
                platform: source.name,
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: source.url,
                  scraped_from: source.name,
                  extraction_method: 'fallback_url_pattern'
                }
              });
            }
          }
        }
      });
    });
    
    return trends;
  }
  
  private async extractWithAIAnalysis(html: string, source: TrendSource): Promise<TrendData[]> {
    try {
      console.log(`🤖 FALLBACK: Using AI analysis for ${source.name}`);
      
      // Truncate HTML to avoid token limits
      const truncatedHtml = html.slice(0, 50000);
      
      const aiPrompt = `
        Analyze this webpage HTML from ${source.name} and extract trending topics/hashtags.
        Look for patterns that suggest trending content, popular searches, or viral topics.
        
        Return 3-5 potential trends in JSON format:
        [{"hashtag": "#TrendName", "confidence": 0.8, "context": "brief context"}]
        
        HTML snippet:
        ${truncatedHtml}
      `;
      
      // Use the AI service to analyze content
      const aiResponse = await this.aiService.analyzeContent(aiPrompt);
      
      if (aiResponse && typeof aiResponse === 'string') {
        try {
          const parsedTrends = JSON.parse(aiResponse);
          if (Array.isArray(parsedTrends)) {
            return parsedTrends
              .filter((trend: any) => trend.hashtag && trend.confidence > 0.5)
              .slice(0, 3)
              .map((trend: any) => ({
                hashtag: trend.hashtag,
                popularity: 'AI Detected',
                category: 'General',
                platform: source.name,
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: source.url,
                  scraped_from: source.name,
                  extraction_method: 'fallback_ai_analysis',
                  ai_confidence: trend.confidence,
                  ai_context: trend.context
                }
              }));
          }
        } catch (parseError) {
          logger.warn(`Failed to parse AI fallback response: ${parseError}`);
        }
      }
    } catch (error) {
      logger.warn(`AI fallback extraction failed: ${error}`);
    }
    
    return [];
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