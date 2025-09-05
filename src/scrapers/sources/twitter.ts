import { Page } from 'puppeteer';
import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';

export const TwitterSource: TrendSource = {
  name: 'X (Twitter) Trends',
  url: 'https://x.com/explore/tabs/trending',
  scrapeMethod: 'puppeteer',
  requiresAuth: false,
  rateLimit: {
    requests: 15,
    window: 900000
  },
  selectors: {
    waitFor: '[data-testid="trend"], [aria-label*="Timeline"], [data-testid="cellInnerDiv"], div[role="button"]',
    trends: '[data-testid="trend"], [data-testid="cellInnerDiv"], div[role="button"]',
    hashtag: 'span, div, [data-testid="trendMetadata"]',
    popularity: 'span[color="rgb(113, 118, 123)"], [data-testid="socialContext"]'
  },
  extractionLogic: async (page: Page): Promise<TrendData[]> => {
    try {
      console.log('🎯 X(TWITTER): Starting extraction logic');
      console.log('🔍 X(TWITTER): Waiting for trend elements...');
      
      // Try multiple selectors for X.com 2025 structure
      await page.waitForSelector('[data-testid="trend"], [data-testid="cellInnerDiv"], div[role="button"]', {
        timeout: 30000,
        visible: true
      });
      
      console.log('✅ X(TWITTER): Elements found, proceeding with extraction');

      // Scroll to load more trends
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const trends = await page.evaluate(() => {
        const items: TrendData[] = [];
        console.log('🔍 X(TWITTER): Starting page evaluation');
        
        // Modern X.com selectors (2025)
        const selectors = [
          '[data-testid="trend"]', // Primary trend selector
          '[data-testid="cellInnerDiv"]', // Timeline cells
          'div[role="button"]', // Interactive trend buttons
          '[data-testid="trendMetadata"]', // Trend metadata containers
          'article, section' // Article/section containers
        ];
        
        let trendElements: NodeListOf<Element> = document.querySelectorAll('');
        
        // Try each selector until we find elements
        for (const selector of selectors) {
          trendElements = document.querySelectorAll(selector);
          console.log(`📋 X(TWITTER): Found ${trendElements.length} elements with selector: ${selector}`);
          if (trendElements.length > 0) break;
        }

        let processedCount = 0;
        trendElements.forEach((element: any, index) => {
          if (processedCount >= 50 || index > 200) return; // Limit processing
          
          try {
            let hashtag = '';
            let popularity = '';
            let category = 'Social';
            
            // Strategy 1: Look for hashtags and trending topics
            const textElements = element.querySelectorAll('span, div, p, h1, h2, h3');
            
            textElements.forEach((textEl: any) => {
              const text = textEl.textContent?.trim() || '';
              
              // Find hashtags or trending topics
              if (!hashtag && text) {
                // Direct hashtag match
                if (text.startsWith('#') && text.length > 2 && text.length < 50) {
                  hashtag = text;
                }
                // Trending topic patterns (CamelCase or trending words)
                else if (text.match(/^[A-Z][a-z]+([A-Z][a-z]+)+$/) && text.length > 3 && text.length < 40) {
                  hashtag = text;
                }
                // Single word trends
                else if (text.match(/^[A-Za-z]{3,20}$/) && 
                        !text.match(/^(Trending|For|You|Following|Home|Search|Profile|Settings|More|What|How|Why|The|And|But)$/i)) {
                  hashtag = text;
                }
                // Multi-word trending phrases
                else if (text.split(' ').length <= 4 && text.length > 3 && text.length < 60 &&
                        !text.includes('·') && !text.includes('posts') && !text.includes('Tweets') &&
                        !text.match(/^\d+/) && text.match(/[a-zA-Z]/)) {
                  hashtag = text;
                }
              }
              
              // Find popularity metrics
              if (!popularity && text.match(/[\d.,]+[KMB]?\s*(posts?|tweets?|trending)/i)) {
                popularity = text;
              }
            });
            
            // Strategy 2: Check for category indicators
            const categoryIndicators = element.textContent?.toLowerCase() || '';
            if (categoryIndicators.includes('politics')) category = 'Politics';
            else if (categoryIndicators.includes('sports')) category = 'Sports';
            else if (categoryIndicators.includes('entertainment')) category = 'Entertainment';
            else if (categoryIndicators.includes('technology') || categoryIndicators.includes('tech')) category = 'Technology';
            else if (categoryIndicators.includes('business')) category = 'Business';
            
            // Clean and validate hashtag
            if (hashtag && hashtag.length > 1) {
              // Remove special characters except for hashtag symbol
              const cleanHashtag = hashtag.replace(/[^\w\s#\u4e00-\u9fff]/g, '').trim();
              
              if (cleanHashtag && cleanHashtag.length > 1 && cleanHashtag.length < 100) {
                console.log(`📝 X(TWITTER): Found potential trend: "${cleanHashtag}"`);
                items.push({
                  hashtag: cleanHashtag.startsWith('#') ? cleanHashtag : `#${cleanHashtag.replace(/\s+/g, '')}`,
                  popularity: popularity || 'Trending',
                  category: category,
                  platform: 'X (Twitter)',
                  region: 'Global',
                  timestamp: new Date(),
                  metadata: {
                    source_url: window.location.href,
                    scraped_from: 'X Explore Trending',
                    extraction_method: hashtag.startsWith('#') ? 'hashtag' : 'trending_topic'
                  }
                });
                processedCount++;
              }
            }
          } catch (err) {
            console.error('Error extracting X trend item:', err);
          }
        });

        console.log(`📊 X(TWITTER): Extracted ${items.length} trends from page evaluation`);
        return items;
      });

      console.log(`📊 X(TWITTER): Extracted ${trends.length} X/Twitter trends`);
      logger.info(`Extracted ${trends.length} X/Twitter trends`);
      
      if (trends.length > 0) {
        console.log('📋 X(TWITTER): Sample trends:', trends.slice(0, 2));
      } else {
        console.log('⚠️ X(TWITTER): No trends found - checking page content...');
      }
      
      return trends;
    } catch (error) {
      console.log('❌ X(TWITTER): Extraction failed:', error);
      logger.error('X/Twitter extraction failed:', error);
      return [];
    }
  }
};