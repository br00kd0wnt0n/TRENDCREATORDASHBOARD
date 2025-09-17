import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';
import axios from 'axios';

export const ApifyTikTokHashtagSource: TrendSource = {
  name: 'Apify TikTok Hashtag Trends',
  url: 'https://api.apify.com/v2/acts/lexis-solutions~tiktok-trending-hashtags-scraper',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 3,
    window: 3600000 // 1 hour
  },
  extractionLogic: async (): Promise<TrendData[]> => {
    try {
      console.log('🎯 APIFY-HASHTAGS: Starting Apify TikTok hashtag trends extraction');

      const APIFY_TOKEN = process.env.APIFY_TOKEN;
      if (!APIFY_TOKEN) {
        logger.warn('No Apify token found - skipping Apify hashtag scraper');
        return [];
      }

      // Start the TikTok trending hashtags scraper
      const runResponse = await axios.post(
        'https://api.apify.com/v2/acts/lexis-solutions~tiktok-trending-hashtags-scraper/runs',
        {
          input: {
            country: 'US',
            maxHashtags: 50,
            sortBy: 'trending',
            includeAnalytics: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const runId = runResponse.data.data.id;
      console.log(`🚀 APIFY-HASHTAGS: Started hashtag run ${runId}`);

      // Poll for completion
      let runStatus = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 20; // 6-7 minutes max wait

      while (runStatus === 'RUNNING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds

        const statusResponse = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          {
            headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
          }
        );

        runStatus = statusResponse.data.data.status;
        attempts++;
        console.log(`⏳ APIFY-HASHTAGS: Run status: ${runStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (runStatus !== 'SUCCEEDED') {
        logger.warn(`Apify hashtag run failed. Status: ${runStatus}`);
        return [];
      }

      // Get results
      const resultsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items`,
        {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        }
      );

      const hashtagResults = resultsResponse.data;
      console.log(`📊 APIFY-HASHTAGS: Retrieved ${hashtagResults.length} hashtags from Apify`);

      // Transform to TrendData format
      const trends: TrendData[] = [];

      hashtagResults.forEach((item: any, index: number) => {
        let hashtag = '';
        let popularity = 'Trending';
        let category = 'General';

        // Extract hashtag from the correct field
        if (item.hashtag_name) {
          hashtag = `#${item.hashtag_name}`;
        } else if (item.hashtag) {
          hashtag = item.hashtag.startsWith('#') ? item.hashtag : `#${item.hashtag}`;
        }

        // Extract popularity metrics from Apify data structure
        if (item.video_views) {
          const views = parseInt(item.video_views);
          if (views > 1000000) {
            popularity = `${(views / 1000000).toFixed(1)}M views`;
          } else if (views > 1000) {
            popularity = `${Math.round(views / 1000)}K views`;
          } else {
            popularity = `${views} views`;
          }
        } else if (item.publish_cnt) {
          const count = parseInt(item.publish_cnt);
          if (count > 1000000) {
            popularity = `${(count / 1000000).toFixed(1)}M posts`;
          } else if (count > 1000) {
            popularity = `${Math.round(count / 1000)}K posts`;
          } else {
            popularity = `${count} posts`;
          }
        } else if (item.rank) {
          popularity = `#${item.rank} trending`;
        }

        // Extract category from Apify industry_info
        if (item.industry_info && item.industry_info.value) {
          category = item.industry_info.value;
        } else {
          // Fallback categorization based on hashtag content
          const hashtagLower = hashtag.toLowerCase();
          if (hashtagLower.includes('sport') || hashtagLower.includes('game') || hashtagLower.includes('fitness') || hashtagLower.includes('soccer') || hashtagLower.includes('basketball')) {
            category = 'Sports & Outdoor';
          } else if (hashtagLower.includes('food') || hashtagLower.includes('recipe') || hashtagLower.includes('cooking') || hashtagLower.includes('chef') || hashtagLower.includes('meal')) {
            category = 'Food & Beverage';
          } else if (hashtagLower.includes('beauty') || hashtagLower.includes('makeup') || hashtagLower.includes('skincare') || hashtagLower.includes('cosmetic')) {
            category = 'Beauty & Personal Care';
          } else if (hashtagLower.includes('fashion') || hashtagLower.includes('style') || hashtagLower.includes('outfit') || hashtagLower.includes('clothing')) {
            category = 'Fashion';
          } else if (hashtagLower.includes('tech') || hashtagLower.includes('ai') || hashtagLower.includes('crypto') || hashtagLower.includes('software')) {
            category = 'Technology';
          } else if (hashtagLower.includes('music') || hashtagLower.includes('dance') || hashtagLower.includes('song') || hashtagLower.includes('entertainment')) {
            category = 'Entertainment';
          } else if (hashtagLower.includes('education') || hashtagLower.includes('learning') || hashtagLower.includes('study')) {
            category = 'Education';
          } else if (hashtagLower.includes('travel') || hashtagLower.includes('vacation') || hashtagLower.includes('adventure')) {
            category = 'Travel';
          }
        }

        if (hashtag && hashtag.length > 1 && !hashtag.includes('undefined')) {
          trends.push({
            hashtag: hashtag,
            popularity: popularity,
            category: category,
            platform: 'TikTok',
            region: 'United States',
            timestamp: new Date(),
            metadata: {
              source_url: 'https://api.apify.com/v2/acts/lexis-solutions~tiktok-trending-hashtags-scraper',
              scraped_from: 'Apify TikTok Hashtag Trends API',
              extraction_method: 'apify_hashtag_api',
              apify_run_id: runId,
              rank: index + 1,
              original_data: item
            }
          });
        }
      });

      console.log(`✅ APIFY-HASHTAGS: Extracted ${trends.length} trending hashtags from Apify`);
      logger.info(`Extracted ${trends.length} trending hashtags from Apify`);

      if (trends.length > 0) {
        console.log('📋 APIFY-HASHTAGS: Sample trends:', trends.slice(0, 5).map(t => `${t.hashtag} (${t.popularity})`));
      }

      return trends;

    } catch (error) {
      console.error('❌ APIFY-HASHTAGS: Error:', error);
      logger.error('Apify TikTok hashtag extraction failed:', error);
      return [];
    }
  }
};