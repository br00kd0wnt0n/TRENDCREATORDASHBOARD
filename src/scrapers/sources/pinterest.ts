import * as cheerio from 'cheerio';
import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';

export const PinterestSource: TrendSource = {
  name: 'Pinterest Trends',
  url: 'https://trends.pinterest.com/',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 20,
    window: 3600000
  },
  extractionLogic: async (html: string): Promise<TrendData[]> => {
    try {
      const $ = cheerio.load(html);
      const trends: TrendData[] = [];

      $('.trend-item, .trending-card, [data-test-id="trending-item"]').each((_, element) => {
        const $el = $(element);
        
        const hashtag = $el.find('.trend-title, .card-title, h3').text().trim() ||
                       $el.find('a').text().trim();
        
        const popularity = $el.find('.trend-metric, .popularity-score, .trend-percentage').text().trim() ||
                         $el.attr('data-popularity') || '';
        
        const category = $el.find('.trend-category, .category-label').text().trim() ||
                        $el.attr('data-category') || 'Lifestyle';

        if (hashtag) {
          trends.push({
            hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag.replace(/\s+/g, '')}`,
            popularity: popularity || 'Trending',
            category: category,
            platform: 'Pinterest',
            region: 'Global',
            timestamp: new Date(),
            metadata: {
              source_url: 'https://trends.pinterest.com/',
              scraped_from: 'Pinterest Trends'
            }
          });
        }
      });

      if (trends.length === 0) {
        logger.warn('🚨 Pinterest scraping failed - no trends extracted');
        logger.warn('📄 This might indicate that Pinterest has changed their page structure');
        logger.warn('🔧 Selectors may need updating: .trend-item, .trending-card, [data-test-id="trending-item"]');
        
        // Return empty array instead of fallback data to see actual scraping failures
        return [];
      }

      logger.info(`Extracted ${trends.length} Pinterest trends`);
      return trends;
    } catch (error) {
      logger.error('Pinterest extraction failed:', error);
      return [];
    }
  }
};