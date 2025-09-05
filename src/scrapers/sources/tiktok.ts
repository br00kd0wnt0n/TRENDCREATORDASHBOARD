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
    waitFor: '.trending-card, .trend-card, [data-e2e*="trend"], [class*="trending"], [class*="hashtag"], .card',
    trends: '.trending-card, .trend-card, [data-e2e*="trend"], [class*="trending"], [class*="hashtag"], .card, [class*="item"]',
    hashtag: '.title, .name, .text, h1, h2, h3, h4, h5, strong, [class*="title"], [class*="name"], [class*="text"]',
    popularity: '.count, .number, .views, .metric, [class*="count"], [class*="number"], [class*="views"], [class*="metric"]',
    category: '.category, .tag, .label, .type, [class*="category"], [class*="tag"], [class*="label"], [class*="type"]'
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
        console.log('🔍 TIKTOK: Starting page evaluation');
        
        // Strategy 1: Try specific selectors
        let trendElements = document.querySelectorAll(selectors.trends!);
        console.log(`📋 TIKTOK: Found ${trendElements.length} elements with specific selectors`);
        
        // Strategy 2: If no elements found, try broader approach
        if (trendElements.length === 0) {
          console.log('🔄 TIKTOK: Trying broader selectors');
          trendElements = document.querySelectorAll('div, section, article, li');
          console.log(`📋 TIKTOK: Found ${trendElements.length} elements with broad selectors`);
        }
        
        let processedCount = 0;
        trendElements.forEach((element: any, index) => {
          if (processedCount >= 50) return; // Limit processing for performance
          
          try {
            // Multiple strategies for finding hashtag text
            let hashtag = '';
            
            // Strategy 1: Look for hashtag in specific elements
            const titleEl = element.querySelector(selectors.hashtag);
            if (titleEl) {
              hashtag = titleEl.textContent?.trim() || '';
            }
            
            // Strategy 2: Look for hashtags in any text content
            if (!hashtag) {
              const textContent = element.textContent || '';
              const hashtagMatch = textContent.match(/#[\w\u4e00-\u9fff]+/);
              hashtag = hashtagMatch ? hashtagMatch[0] : '';
            }
            
            // Strategy 3: Look for trending words (non-hashtag)
            if (!hashtag && element.textContent && element.textContent.length > 2 && element.textContent.length < 50) {
              const text = element.textContent.trim();
              // Skip common UI text
              if (!text.match(/^(Home|For You|Following|Live|Profile|Search|Trending|Popular)$/i) && 
                  !text.match(/^[\d\s\w]{1,3}$/)) {
                hashtag = text;
              }
            }
            
            if (hashtag && hashtag.length > 1) {
              const popularity = element.querySelector(selectors.popularity)?.textContent?.trim() || 
                               element.textContent?.match(/[\d.]+[MKB]?\s*(views?|likes?)/i)?.[0] || '';
              
              const category = element.querySelector(selectors.category)?.textContent?.trim() || 
                             element.getAttribute('data-category') || 'General';

              console.log(`📝 TIKTOK: Found potential trend: "${hashtag}"`);
              items.push({
                hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
                popularity: popularity || 'N/A',
                category: category,
                platform: 'TikTok',
                region: 'Global',
                timestamp: new Date(),
                metadata: {
                  source_url: window.location.href,
                  scraped_from: 'TikTok Creative Center',
                  extraction_method: hashtag.startsWith('#') ? 'hashtag' : 'text_content'
                }
              });
              processedCount++;
            }
          } catch (err) {
            console.error('Error extracting trend item:', err);
          }
        });

        console.log(`📊 TIKTOK: Extracted ${items.length} trends from page evaluation`);
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