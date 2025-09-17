import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';
import axios from 'axios';

export const ApifyPinterestSource: TrendSource = {
  name: 'Apify Pinterest Trends',
  url: 'https://api.apify.com/v2/acts/epctex~pinterest-scraper',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 2,
    window: 3600000 // 1 hour
  },
  extractionLogic: async (): Promise<TrendData[]> => {
    try {
      console.log('🎯 APIFY-PINTEREST: Starting Pinterest trends extraction');

      const APIFY_TOKEN = process.env.APIFY_TOKEN;
      if (!APIFY_TOKEN) {
        logger.warn('No Apify token found - skipping Pinterest scraper');
        return [];
      }

      // Search for trending topics on Pinterest - using direct URLs instead

      // Start the Pinterest scraper with token as query parameter
      const runResponse = await axios.post(
        `https://api.apify.com/v2/acts/epctex~pinterest-scraper/runs?token=${APIFY_TOKEN}`,
        {
          input: {
            startUrls: [
              "https://www.pinterest.com/search/pins/?q=trending",
              "https://www.pinterest.com/search/pins/?q=viral",
              "https://www.pinterest.com/search/pins/?q=popular",
              "https://www.pinterest.com/search/pins/?q=fashion%20trends",
              "https://www.pinterest.com/search/pins/?q=home%20decor"
            ],
            customMapFunction: "(object) => { return {...object} }",
            endPage: 1,
            extendOutputFunction: "($) => { return {} }",
            includeComments: false,
            includeUserInfoOnly: false,
            maxItems: 50,
            proxy: {
              useApifyProxy: true
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const runId = runResponse.data.data.id;
      console.log(`🚀 APIFY-PINTEREST: Started Pinterest run ${runId}`);

      // Poll for completion
      let runStatus = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 20;

      while (runStatus === 'RUNNING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

        const statusResponse = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );

        runStatus = statusResponse.data.data.status;
        attempts++;
        console.log(`⏳ APIFY-PINTEREST: Run status: ${runStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (runStatus !== 'SUCCEEDED') {
        logger.warn(`Apify Pinterest run failed. Status: ${runStatus}`);
        return [];
      }

      // Get results
      const resultsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items?token=${APIFY_TOKEN}`
      );

      const pinterestResults = resultsResponse.data;
      console.log(`📊 APIFY-PINTEREST: Retrieved ${pinterestResults.length} Pinterest items from Apify`);

      // Transform to TrendData format
      const trends: TrendData[] = [];
      const seenHashtags = new Set<string>();

      pinterestResults.forEach((item: any) => {
        // Extract hashtags from various fields
        let extractedHashtags: string[] = [];

        // Look for hashtags in title, description, tags
        const textFields = [
          item.title,
          item.description,
          item.alt_text,
          item.board_name,
          ...(item.tags || [])
        ].filter(Boolean);

        textFields.forEach(text => {
          if (typeof text === 'string') {
            const hashtagMatches = text.match(/#[\w\u4e00-\u9fff]+/g);
            if (hashtagMatches) {
              extractedHashtags.push(...hashtagMatches);
            }
          }
        });

        // Also create hashtags from trending topics/keywords
        if (item.title) {
          const words = item.title.toLowerCase().split(/\s+/);
          words.forEach((word: string) => {
            const cleanWord = word.replace(/[^\w]/g, '');
            if (cleanWord.length > 3 && cleanWord.length < 20) {
              // Convert trending topic words to hashtags
              if (word.includes('trend') || word.includes('popular') || word.includes('diy') ||
                  word.includes('fashion') || word.includes('home') || word.includes('recipe')) {
                extractedHashtags.push(`#${cleanWord}`);
              }
            }
          });
        }

        // Process each hashtag
        extractedHashtags.forEach(hashtag => {
          hashtag = hashtag.toLowerCase();

          if (seenHashtags.has(hashtag) || hashtag.length < 3) {
            return; // Skip duplicates and too short hashtags
          }
          seenHashtags.add(hashtag);

          let popularity = 'Trending';
          let category = 'Lifestyle';

          // Extract popularity from pin metrics
          if (item.repin_count || item.saves || item.repins) {
            const count = parseInt(item.repin_count || item.saves || item.repins);
            if (count > 100000) {
              popularity = `${Math.round(count / 1000)}K saves`;
            } else if (count > 1000) {
              popularity = `${Math.round(count / 1000)}K saves`;
            } else {
              popularity = `${count} saves`;
            }
          } else if (item.reaction_count || item.likes) {
            const likes = parseInt(item.reaction_count || item.likes);
            if (likes > 1000) {
              popularity = `${Math.round(likes / 1000)}K likes`;
            } else {
              popularity = `${likes} likes`;
            }
          }

          // Categorize based on hashtag content and Pinterest board context
          if (item.board_category) {
            category = item.board_category;
          } else {
            const hashtagLower = hashtag.toLowerCase();
            if (hashtagLower.includes('fashion') || hashtagLower.includes('style') || hashtagLower.includes('outfit') || hashtagLower.includes('clothing')) {
              category = 'Fashion';
            } else if (hashtagLower.includes('home') || hashtagLower.includes('decor') || hashtagLower.includes('interior') || hashtagLower.includes('design')) {
              category = 'Home & Garden';
            } else if (hashtagLower.includes('recipe') || hashtagLower.includes('food') || hashtagLower.includes('cooking') || hashtagLower.includes('baking')) {
              category = 'Food & Beverage';
            } else if (hashtagLower.includes('beauty') || hashtagLower.includes('makeup') || hashtagLower.includes('skincare') || hashtagLower.includes('hair')) {
              category = 'Beauty & Personal Care';
            } else if (hashtagLower.includes('diy') || hashtagLower.includes('craft') || hashtagLower.includes('handmade') || hashtagLower.includes('project')) {
              category = 'Arts & Crafts';
            } else if (hashtagLower.includes('wedding') || hashtagLower.includes('bride') || hashtagLower.includes('engagement') || hashtagLower.includes('party')) {
              category = 'Events & Celebrations';
            } else if (hashtagLower.includes('travel') || hashtagLower.includes('vacation') || hashtagLower.includes('destination') || hashtagLower.includes('wanderlust')) {
              category = 'Travel';
            } else if (hashtagLower.includes('fitness') || hashtagLower.includes('workout') || hashtagLower.includes('health') || hashtagLower.includes('yoga')) {
              category = 'Health & Fitness';
            } else if (hashtagLower.includes('art') || hashtagLower.includes('artist') || hashtagLower.includes('painting') || hashtagLower.includes('drawing')) {
              category = 'Arts & Crafts';
            } else if (hashtagLower.includes('photography') || hashtagLower.includes('photo') || hashtagLower.includes('picture') || hashtagLower.includes('aesthetic')) {
              category = 'Photography';
            }
          }

          trends.push({
            hashtag: hashtag,
            popularity: popularity,
            category: category,
            platform: 'Pinterest',
            region: 'Global',
            timestamp: new Date(),
            metadata: {
              source_url: 'https://api.apify.com/v2/acts/epctex~pinterest-scraper',
              scraped_from: 'Apify Pinterest Scraper API',
              extraction_method: 'apify_pinterest_api',
              apify_run_id: runId,
              original_pin_url: item.url || item.link,
              board_name: item.board_name,
              original_data: item
            }
          });
        });
      });

      // Limit to top 50 trends to avoid overwhelming the database
      const limitedTrends = trends.slice(0, 50);

      console.log(`✅ APIFY-PINTEREST: Extracted ${limitedTrends.length} Pinterest hashtags from Apify`);
      logger.info(`Extracted ${limitedTrends.length} Pinterest hashtags from Apify`);

      if (limitedTrends.length > 0) {
        console.log('📋 APIFY-PINTEREST: Sample trends:', limitedTrends.slice(0, 5).map(t => `${t.hashtag} (${t.popularity})`));
      }

      return limitedTrends;

    } catch (error) {
      console.error('❌ APIFY-PINTEREST: Error:', error);
      logger.error('Apify Pinterest extraction failed:', error);
      return [];
    }
  }
};