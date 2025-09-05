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

      // Strategy 1: Try 2025 Pinterest selectors (updated for current architecture)
      const modernSelectors = [
        // Pinterest 2025 specific selectors
        '[data-test-id*="trending"], [data-testid*="trending"]',
        '[data-test-id*="search-guide"], [data-testid*="search-guide"]',
        '[data-test-id*="trending-search"], [data-testid*="trending-search"]',
        '[aria-label*="trending"], [title*="trending"]',
        
        // Modern React component selectors (Pinterest uses React)
        'div[class*="SearchGuide"], div[class*="TrendingSearch"]',
        'div[class*="PopularSearch"], div[class*="SuggestedSearch"]',
        'div[class*="trending"], div[class*="popular"]',
        
        // 2025 updated generic selectors
        'button[class*="search"], a[class*="search"]',
        'div[role="button"][class*="search"]',
        '[data-test-id*="pill"], [data-testid*="pill"]', // Pinterest pill buttons
        
        // Search and explore patterns
        'a[href*="/search/pins/"], a[href*="/ideas/"]',
        'a[href*="search"], a[href*="explore"]',
        
        // Text-based fallbacks for 2025
        'h1, h2, h3, h4, p[class*="search"], span[class*="search"]',
        'div[class*="Card"], div[class*="Tile"], div[class*="Item"]',
        '[data-test-id], [data-testid]', // Any elements with test IDs
        'button, .button, div[role="button"]', // Interactive elements
        'div, span, p' // Final fallback to all text elements
      ];

      console.log(`🔍 PINTEREST: Trying ${modernSelectors.length} modern selector strategies`);

      for (let i = 0; i < modernSelectors.length && trends.length < 5; i++) {
        const selector = modernSelectors[i];
        console.log(`📋 PINTEREST: Trying selector ${i + 1}: ${selector}`);
        
        $(selector).each((index, element) => {
          if (trends.length >= 20 || index > 100) return false; // Limit for performance
          
          const $el = $(element);
          
          // Get text content with multiple strategies
          let hashtag = '';
          
          // Strategy 1: Look in child elements
          hashtag = $el.find('span, div, p, strong, b').first().text().trim() ||
                   $el.children().first().text().trim() ||
                   $el.text().trim();
          
          // Strategy 2: Enhanced 2025 link and URL parsing
          if (!hashtag) {
            const linkText = $el.find('a').text().trim();
            const href = $el.attr('href') || $el.find('a').attr('href') || '';
            
            // Try link text first
            if (linkText && linkText.length > 1 && linkText.length < 50) {
              hashtag = linkText;
            }
            // Enhanced URL parsing for Pinterest 2025 structure
            else if (href) {
              // Handle modern Pinterest URL patterns
              if (href.includes('/search/pins/')) {
                hashtag = href.split('/search/pins/')[1]?.split('/')[0] || '';
              } else if (href.includes('/ideas/')) {
                hashtag = href.split('/ideas/')[1]?.split('/')[0] || '';
              } else if (href.includes('/search/')) {
                hashtag = href.split('/search/')[1]?.split('/')[0] || '';
              }
              
              // Clean up URL-encoded text
              if (hashtag) {
                hashtag = decodeURIComponent(hashtag)
                  .replace(/[+%20]/g, ' ')
                  .replace(/-/g, ' ')
                  .replace(/_/g, ' ')
                  .trim();
              }
            }
          }
          
          // Strategy 3: Enhanced 2025 text extraction
          if (!hashtag && $el.text()) {
            const text = $el.text().trim();
            
            // Enhanced filtering for 2025 Pinterest UI patterns
            const isValidTrendText = text.length > 2 && text.length < 80 && 
                // Skip common 2025 Pinterest UI text
                !text.match(/^(Pinterest|Home|Search|Profile|Following|More|Sign|Log|Create|Save|Pin|Board|Ideas|Try|Explore|Today|Popular|Trending|Shopping|Watch|News|Business)$/i) &&
                !text.match(/^(Saved|Pins|Boards|Followers|Following|Activity|Settings|Help|Privacy|Terms|About|Careers|Developers|API|Blog|Support)$/i) &&
                // Skip numbers, metrics, and technical text
                !text.match(/^\d+(\.\d+)?[KMB]?$/) && 
                !text.match(/^\d+\s+(pins?|boards?|followers?|following)$/i) &&
                !text.includes('©') && 
                !text.includes('®') && 
                !text.includes('™') &&
                // Skip URLs and technical strings
                !text.includes('http') && 
                !text.includes('www.') &&
                !text.match(/^[a-z0-9-_]+\.(com|net|org|io)$/i) &&
                // Reasonable word count (allow longer for 2025 trend phrases)
                text.split(' ').length <= 8 &&
                // Must contain letters (not just symbols/numbers)
                /[a-zA-Z\u4e00-\u9fff]/.test(text) &&
                // Skip single characters or very short words
                text.length > 3;
            
            if (isValidTrendText) {
              hashtag = text;
            }
          }
          
          if (hashtag && hashtag.length > 2 && hashtag.length < 50) {
            // Clean up hashtag
            hashtag = hashtag.replace(/[^\w\s\u4e00-\u9fff]/g, '').trim();
            
            if (hashtag) {
              const popularity = $el.find('[class*="count"], [class*="number"]').text().trim() || '';
              const category = $el.find('[class*="category"], [class*="topic"]').text().trim() || 'Lifestyle';

              // Check for duplicates
              const isDuplicate = trends.some(t => 
                t.hashtag.toLowerCase().includes(hashtag.toLowerCase()) ||
                hashtag.toLowerCase().includes(t.hashtag.slice(1).toLowerCase())
              );

              if (!isDuplicate) {
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
                    selector_used: selector,
                    extraction_strategy: i + 1
                  }
                });
              }
            }
          }
        });
        
        console.log(`📊 PINTEREST: Found ${trends.length} trends with selector ${i + 1}`);
        if (trends.length >= 5) break; // Stop once we have some trends
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