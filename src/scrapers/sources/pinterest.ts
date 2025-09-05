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
      console.log('🎯 PINTEREST: Starting extraction logic');
      const $ = cheerio.load(html);
      const trends: TrendData[] = [];

      // Try multiple selector strategies
      const selectors = [
        '.trend-item, .trending-card, [data-test-id="trending-item"]',
        '.trend, .trending, .popular-search',
        '[data-testid*="trend"], [data-testid*="popular"]',
        '.search-trend, .topic-trend, .trending-topic',
        'h1, h2, h3, h4', // Fallback to any headings that might contain trend names
      ];

      console.log(`🔍 PINTEREST: Trying ${selectors.length} different selector strategies`);

      for (let i = 0; i < selectors.length && trends.length === 0; i++) {
        const selector = selectors[i];
        console.log(`📋 PINTEREST: Trying selector ${i + 1}: ${selector}`);
        
        $(selector).each((_, element) => {
          const $el = $(element);
          
          // Try multiple ways to extract text content
          const hashtag = $el.find('.trend-title, .card-title, h3').text().trim() ||
                         $el.find('a').text().trim() ||
                         $el.text().trim();
          
          const popularity = $el.find('.trend-metric, .popularity-score, .trend-percentage').text().trim() ||
                           $el.attr('data-popularity') || '';
          
          const category = $el.find('.trend-category, .category-label').text().trim() ||
                          $el.attr('data-category') || 'Lifestyle';

          if (hashtag && hashtag.length > 0 && hashtag.length < 100) {
            console.log(`📝 PINTEREST: Found potential trend: "${hashtag}"`);
            trends.push({
              hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag.replace(/\s+/g, '')}`,
              popularity: popularity || 'Trending',
              category: category,
              platform: 'Pinterest',
              region: 'Global',
              timestamp: new Date(),
              metadata: {
                source_url: 'https://trends.pinterest.com/',
                scraped_from: 'Pinterest Trends',
                selector_used: selector
              }
            });
          }
        });
        
        console.log(`📊 PINTEREST: Found ${trends.length} trends with selector ${i + 1}`);
      }

      if (trends.length === 0) {
        console.log('⚠️ PINTEREST: No trends found with any selector');
        console.log('📄 PINTEREST: Page structure may have changed - all selectors failed');
        logger.warn('🚨 Pinterest scraping failed - no trends extracted');
        logger.warn('📄 This might indicate that Pinterest has changed their page structure');
        logger.warn('🔧 Selectors may need updating');
        
        // Return empty array instead of fallback data to see actual scraping failures
        return [];
      }

      console.log(`✅ PINTEREST: Successfully extracted ${trends.length} trends`);
      if (trends.length > 0) {
        console.log('📋 PINTEREST: Sample trends:', trends.slice(0, 2));
      }
      logger.info(`Extracted ${trends.length} Pinterest trends`);
      return trends;
    } catch (error) {
      console.log('❌ PINTEREST: Extraction failed with error:', error);
      logger.error('Pinterest extraction failed:', error);
      return [];
    }
  }
};