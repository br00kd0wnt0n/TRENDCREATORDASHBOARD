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
    waitFor: '[class*="CommonDataList"], [class*="cardWrapper"], [class*="listWrap"]',
    trends: '[class*="cardWrapper"], [class*="row-item"], [class*="trend-item"]',
    hashtag: 'a[href*="/hashtag/"], a[href*="hashtag"], [class*="hashtag"] a',
    popularity: '[class*="posts"], [class*="count"], [class*="metric"]',
    category: '[class*="category"], [class*="tag"], [class*="badge"]'
  },
  extractionLogic: async (page: Page): Promise<TrendData[]> => {
    try {
      console.log('🎯 TIKTOK: Starting extraction logic');
      console.log('🔍 TIKTOK: Waiting for content to load...');

      // Wait for the data list container
      await page.waitForSelector('[class*="CommonDataList"], [class*="cardWrapper"]', {
        timeout: 30000,
        visible: true
      });

      console.log('✅ TIKTOK: Content found, proceeding with extraction');

      // Give the page a moment to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));

      const trends = await page.evaluate(() => {
        const items: TrendData[] = [];
        console.log('🔍 TIKTOK: Starting page evaluation');

        // Look for card wrappers that contain trend data
        const trendCards = document.querySelectorAll('[class*="cardWrapper"], [class*="row-item"]');
        console.log(`📋 TIKTOK: Found ${trendCards.length} potential trend cards`);

        trendCards.forEach((card: any) => {
          try {
            const cardText = card.textContent || '';

            // Skip header cards
            if (cardText.includes('RankHashtags') || cardText.includes('Actions')) {
              return;
            }

            // Extract hashtag more carefully
            // Pattern: number followed by # then the hashtag word
            let hashtag = '';
            const rankHashtagMatch = cardText.match(/\d+#\s*([a-zA-Z0-9]+)/);
            if (rankHashtagMatch) {
              hashtag = rankHashtagMatch[1];
            } else {
              // Try alternative pattern: just # followed by word
              const altMatch = cardText.match(/#\s*([a-zA-Z0-9]+)/);
              if (!altMatch) return;
              hashtag = altMatch[1];
            }

            // Extract posts count - look for number followed by K/M/B
            const postsMatch = cardText.match(/(\d+\.?\d*[KMB]?)\s*Posts?/i);
            const postsCount = postsMatch ? postsMatch[1] : 'N/A';

            // Extract category - look for category keywords
            let category = 'General';
            if (cardText.includes('Sports') || cardText.includes('Outdoor')) {
              category = 'Sports & Outdoor';
            } else if (cardText.includes('Entertainment')) {
              category = 'Entertainment';
            } else if (cardText.includes('Fashion')) {
              category = 'Fashion';
            } else if (cardText.includes('Food')) {
              category = 'Food & Beverage';
            } else if (cardText.includes('Beauty')) {
              category = 'Beauty & Personal Care';
            } else if (cardText.includes('Technology') || cardText.includes('Tech')) {
              category = 'Technology';
            } else if (cardText.includes('Business')) {
              category = 'Business';
            } else if (cardText.includes('Featured')) {
              category = 'Featured';
            } else if (cardText.includes('Education')) {
              category = 'Education';
            } else if (cardText.includes('Gaming')) {
              category = 'Gaming';
            }

            // Check if it's marked as NEW
            const isNew = cardText.includes('NEW');

            if (hashtag && hashtag.length > 1) {
              console.log(`📝 TIKTOK: Found trend: "#${hashtag}" with ${postsCount} posts in ${category}`);
              items.push({
                hashtag: `#${hashtag}`,
                popularity: postsCount,
                category: category,
                platform: 'TikTok',
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: window.location.href,
                  scraped_from: 'TikTok Creative Center',
                  extraction_method: 'card_based',
                  is_new: isNew
                }
              });
            }
          } catch (err) {
            console.error('Error extracting trend from card:', err);
          }
        });

        // If no cards found, try a more aggressive approach
        if (items.length === 0) {
          console.log('🔄 TIKTOK: No cards found, trying text-based extraction...');

          const pageText = document.body.textContent || '';
          // Look for patterns like "1# gameday" or "2# fnl"
          const trendMatches = pageText.matchAll(/\d+#\s*([a-zA-Z0-9]+).*?(\d+\.?\d*[KMB]?)\s*Posts?/gi);

          for (const match of trendMatches) {
            const hashtag = match[1];
            const posts = match[2];

            if (hashtag && hashtag.length > 1) {
              items.push({
                hashtag: `#${hashtag}`,
                popularity: posts || 'Trending',
                category: 'General',
                platform: 'TikTok',
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: window.location.href,
                  scraped_from: 'TikTok Creative Center',
                  extraction_method: 'text_pattern'
                }
              });
            }
          }
        }

        console.log(`📊 TIKTOK: Extracted ${items.length} trends`);
        return items;
      });

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