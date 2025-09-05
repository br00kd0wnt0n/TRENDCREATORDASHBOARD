import { Page } from 'puppeteer';
import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';

export const TikTokSource: TrendSource = {
  name: 'TikTok Creative Center',
  url: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
  scrapeMethod: 'puppeteer',
  rateLimit: {
    requests: 10,
    window: 3600000
  },
  selectors: {
    waitFor: '.trending-hashtag-card, .hashtag-trend-card, [data-testid="hashtag-card"], .cc-hashtag-item, .trend-card',
    trends: '.trending-hashtag-card, .hashtag-trend-card, [data-testid="hashtag-card"], .cc-hashtag-item, .trend-card, .hashtag-item',
    hashtag: '.hashtag-text, .trend-title, .hashtag-name, h3, .card-title, [data-testid="hashtag-text"]',
    popularity: '.view-count, .popularity-metric, .trend-views, .metric-value, [data-testid="view-count"]',
    category: '.category-tag, .trend-category, .hashtag-category, [data-testid="category"]'
  },
  extractionLogic: async (page: Page): Promise<TrendData[]> => {
    try {
      console.log('🎯 TIKTOK: Starting extraction logic');
      console.log('🔍 TIKTOK: Waiting for selector:', TikTokSource.selectors!.waitFor!);
      
      await page.waitForSelector(TikTokSource.selectors!.waitFor!, { 
        timeout: 30000,
        visible: true 
      });
      
      console.log('✅ TIKTOK: Selector found, proceeding with extraction');

      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const trends = await page.evaluate((selectors: any) => {
        const items: TrendData[] = [];
        const trendElements = document.querySelectorAll(selectors.trends!);
        
        trendElements.forEach((element: any) => {
          try {
            const hashtag = element.querySelector(selectors.hashtag)?.textContent?.trim() || 
                          element.textContent?.match(/#[\w]+/)?.[0] || '';
            
            const popularity = element.querySelector(selectors.popularity)?.textContent?.trim() || 
                             element.textContent?.match(/[\d.]+[MKB]?\s*views?/i)?.[0] || '';
            
            const category = element.querySelector(selectors.category)?.textContent?.trim() || 
                           element.getAttribute('data-category') || '';

            if (hashtag) {
              items.push({
                hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
                popularity: popularity || 'N/A',
                category: category || 'General',
                platform: 'TikTok',
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: (window as any).location.href,
                  scraped_from: 'TikTok Creative Center'
                }
              });
            }
          } catch (err) {
            console.error('Error extracting trend item:', err);
          }
        });

        return items;
      }, TikTokSource.selectors);

      console.log(`📊 TIKTOK: Extracted ${trends.length} TikTok trends`);
      logger.info(`Extracted ${trends.length} TikTok trends`);
      
      if (trends.length > 0) {
        console.log('📋 TIKTOK: Sample trends:', trends.slice(0, 2));
      } else {
        console.log('⚠️ TIKTOK: No trends found - checking page content...');
      }
      
      return trends;
    } catch (error) {
      console.log('❌ TIKTOK: Extraction failed:', error);
      logger.error('TikTok extraction failed:', error);
      return [];
    }
  }
};