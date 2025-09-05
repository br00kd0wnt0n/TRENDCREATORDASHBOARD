import { Page } from 'puppeteer';
import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';

export const TwitterSource: TrendSource = {
  name: 'Twitter/X Trends',
  url: 'https://twitter.com/explore/tabs/trending',
  scrapeMethod: 'puppeteer',
  requiresAuth: false,
  rateLimit: {
    requests: 15,
    window: 900000
  },
  selectors: {
    waitFor: '[data-testid="trend"], [aria-label="Timeline: Trending now"]',
    trends: '[data-testid="trend"]',
    hashtag: 'span:contains("#")',
    popularity: '[data-testid="tweet-count"]'
  },
  extractionLogic: async (page: Page): Promise<TrendData[]> => {
    try {
      await page.waitForSelector('[data-testid="trend"], .trend-item', {
        timeout: 20000,
        visible: true
      });

      const trends = await page.evaluate(() => {
        const items: TrendData[] = [];
        const trendElements = document.querySelectorAll('[data-testid="trend"], .trend-item');

        trendElements.forEach((element: any) => {
          const spans = element.querySelectorAll('span');
          let hashtag = '';
          let popularity = '';

          spans.forEach((span: HTMLElement) => {
            const text = span.textContent?.trim() || '';
            if (text.startsWith('#') || text.match(/^[A-Z][a-z]+([A-Z][a-z]+)+$/)) {
              hashtag = text;
            }
            if (text.match(/[\d.]+[KMB]?\s*(posts?|tweets?)/i)) {
              popularity = text;
            }
          });

          if (hashtag) {
            items.push({
              hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
              popularity: popularity || 'Trending',
              category: 'Social',
              platform: 'Twitter/X',
              region: 'Global',
              timestamp: new Date(),
              metadata: {
                source_url: window.location.href,
                scraped_from: 'Twitter/X Explore'
              }
            });
          }
        });

        return items;
      });

      logger.info(`Extracted ${trends.length} Twitter/X trends`);
      return trends;
    } catch (error) {
      logger.error('Twitter/X extraction failed:', error);
      return [];
    }
  }
};