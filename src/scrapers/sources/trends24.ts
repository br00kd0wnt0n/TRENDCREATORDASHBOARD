import * as cheerio from 'cheerio';
import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';

/**
 * Trends24 Source - Third-party X/Twitter trend tracking
 * 
 * Alternative to direct X.com scraping since X now requires authentication.
 * Trends24.in provides publicly accessible trending topics from X/Twitter.
 */

export const Trends24Source: TrendSource = {
  name: 'Trends24 (X/Twitter)',
  url: 'https://trends24.in/',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 10,
    window: 3600000
  },
  extractionLogic: async (html: string): Promise<TrendData[]> => {
    try {
      console.log('🎯 TRENDS24: Starting extraction logic');
      const $ = cheerio.load(html);
      const trends: TrendData[] = [];

      // Strategy 1: Look for trending hashtags and topics
      const selectors = [
        'a[href*="/trend/"], a[href*="#"]', // Links to trends
        '.trend, .trending, .hashtag', // Trend containers
        'li, ul > li', // List items that might contain trends
        'span, div, p', // Text elements
      ];

      console.log(`🔍 TRENDS24: Trying ${selectors.length} selector strategies`);

      for (let i = 0; i < selectors.length && trends.length < 10; i++) {
        const selector = selectors[i];
        console.log(`📋 TRENDS24: Trying selector ${i + 1}: ${selector}`);
        
        $(selector).each((index, element) => {
          if (trends.length >= 20 || index > 100) return false; // Limit for performance
          
          const $el = $(element);
          let hashtag = '';
          
          // Get hashtag from href attribute
          const href = $el.attr('href');
          if (href && href.includes('/trend/')) {
            hashtag = href.split('/trend/')[1]?.split('/')[0] || '';
            hashtag = decodeURIComponent(hashtag).replace(/[+%20]/g, ' ');
          } else if (href && href.includes('#')) {
            const hashMatch = href.match(/#([^&?]+)/);
            hashtag = hashMatch ? hashMatch[1] : '';
          }
          
          // Get hashtag from text content
          if (!hashtag) {
            const text = $el.text().trim();
            if (text.startsWith('#') && text.length > 2 && text.length < 50) {
              hashtag = text;
            } else if (text.match(/^[A-Z][a-z]+([A-Z][a-z]+)*$/) && text.length > 3) {
              // CamelCase trending topics
              hashtag = text;
            }
          }
          
          if (hashtag && hashtag.length > 1 && hashtag.length < 60) {
            // Clean up hashtag
            hashtag = hashtag.replace(/[^\w\s#\u4e00-\u9fff]/g, '').trim();
            
            // Check for duplicates
            const isDuplicate = trends.some(t => 
              t.hashtag.toLowerCase() === hashtag.toLowerCase() ||
              t.hashtag.toLowerCase().includes(hashtag.toLowerCase().slice(1))
            );

            if (!isDuplicate && hashtag.length > 2) {
              console.log(`📝 TRENDS24: Found potential trend: "${hashtag}"`);
              trends.push({
                hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
                popularity: 'Trending',
                category: 'Social',
                platform: 'X (Twitter)',
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: 'https://trends24.in/',
                  scraped_from: 'Trends24 (Third-party)',
                  selector_used: selector,
                  extraction_strategy: i + 1
                }
              });
            }
          }
        });
        
        console.log(`📊 TRENDS24: Found ${trends.length} trends with selector ${i + 1}`);
        if (trends.length >= 10) break; // Stop once we have enough trends
      }

      if (trends.length === 0) {
        console.log('⚠️ TRENDS24: No trends found with any selector');
        logger.warn('Trends24 scraping failed - no trends extracted');
        return [];
      }

      console.log(`✅ TRENDS24: Successfully extracted ${trends.length} trends`);
      if (trends.length > 0) {
        console.log('📋 TRENDS24: Sample trends:', trends.slice(0, 3));
      }
      logger.info(`Extracted ${trends.length} trends from Trends24`);
      return trends;
      
    } catch (error) {
      console.log('❌ TRENDS24: Extraction failed with error:', error);
      logger.error('Trends24 extraction failed:', error);
      return [];
    }
  }
};