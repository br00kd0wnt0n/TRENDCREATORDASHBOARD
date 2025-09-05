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
    waitFor: '[data-e2e="cc-hashtag-list"], .trend-hashtag-list, .hashtag-card',
    trends: '[data-e2e="cc-hashtag-item"], .trend-hashtag-item, .hashtag-card',
    hashtag: '[data-e2e="hashtag-name"], .hashtag-name, .card-title',
    popularity: '[data-e2e="hashtag-views"], .hashtag-popularity, .view-count',
    category: '[data-e2e="hashtag-category"], .hashtag-category, .category-tag'
  },
  extractionLogic: async (page: Page): Promise<TrendData[]> => {
    try {
      await page.waitForSelector(TikTokSource.selectors!.waitFor!, { 
        timeout: 30000,
        visible: true 
      });

      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(2000);

      const trends = await page.evaluate((selectors) => {
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
                  source_url: window.location.href,
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

      logger.info(`Extracted ${trends.length} TikTok trends`);
      return trends;
    } catch (error) {
      logger.error('TikTok extraction failed:', error);
      return [];
    }
  }
};