import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';
import axios from 'axios';

export const ApifyTikTokSource: TrendSource = {
  name: 'Apify TikTok Trends',
  url: 'https://api.apify.com/v2/acts/clockworks~tiktok-trends-scraper/runs',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 5,
    window: 3600000 // 1 hour
  },
  extractionLogic: async (): Promise<TrendData[]> => {
    try {
      console.log('🎯 APIFY-TIKTOK: Starting Apify TikTok trends extraction');

      const APIFY_TOKEN = process.env.APIFY_TOKEN;
      if (!APIFY_TOKEN) {
        logger.warn('No Apify token found - skipping Apify TikTok scraper');
        return [];
      }

      // Start an Apify actor run for TikTok trends
      const runResponse = await axios.post(
        'https://api.apify.com/v2/acts/clockworks~tiktok-trends-scraper/runs',
        {
          // Input configuration for the scraper
          input: {
            searchType: 'hashtag',
            region: 'US',
            maxResults: 50,
            includeVideoMetadata: false // We just want hashtag trends, not full video data
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const runId = runResponse.data.data.id;
      console.log(`🚀 APIFY-TIKTOK: Started run ${runId}`);

      // Wait for the run to complete (with timeout)
      let runStatus = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max wait

      while (runStatus === 'RUNNING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        const statusResponse = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          {
            headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
          }
        );

        runStatus = statusResponse.data.data.status;
        attempts++;
        console.log(`⏳ APIFY-TIKTOK: Run status: ${runStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (runStatus !== 'SUCCEEDED') {
        logger.warn(`Apify run did not complete successfully. Status: ${runStatus}`);
        return [];
      }

      // Get the results
      const resultsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items`,
        {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        }
      );

      const apifyResults = resultsResponse.data;
      console.log(`📊 APIFY-TIKTOK: Retrieved ${apifyResults.length} items from Apify`);

      // Transform Apify results to our TrendData format
      const trends: TrendData[] = [];

      apifyResults.forEach((item: any) => {
        // Extract hashtag information from Apify response
        let hashtag = '';
        let category = 'General';
        let popularity = 'Trending';

        if (item.hashtag) {
          hashtag = item.hashtag.startsWith('#') ? item.hashtag : `#${item.hashtag}`;
        } else if (item.title || item.name) {
          const title = item.title || item.name;
          hashtag = title.startsWith('#') ? title : `#${title}`;
        }

        // Extract engagement metrics for popularity
        if (item.views || item.viewCount) {
          const views = item.views || item.viewCount;
          if (views > 1000000) {
            popularity = `${Math.round(views / 1000000)}M views`;
          } else if (views > 1000) {
            popularity = `${Math.round(views / 1000)}K views`;
          } else {
            popularity = `${views} views`;
          }
        } else if (item.posts || item.postCount) {
          const posts = item.posts || item.postCount;
          if (posts > 1000000) {
            popularity = `${Math.round(posts / 1000000)}M posts`;
          } else if (posts > 1000) {
            popularity = `${Math.round(posts / 1000)}K posts`;
          } else {
            popularity = `${posts} posts`;
          }
        }

        // Determine category based on hashtag content
        const hashtagLower = hashtag.toLowerCase();
        if (hashtagLower.includes('sport') || hashtagLower.includes('game') || hashtagLower.includes('fitness')) {
          category = 'Sports & Outdoor';
        } else if (hashtagLower.includes('food') || hashtagLower.includes('recipe') || hashtagLower.includes('cooking')) {
          category = 'Food & Beverage';
        } else if (hashtagLower.includes('beauty') || hashtagLower.includes('makeup') || hashtagLower.includes('skincare')) {
          category = 'Beauty & Personal Care';
        } else if (hashtagLower.includes('fashion') || hashtagLower.includes('style') || hashtagLower.includes('outfit')) {
          category = 'Fashion';
        } else if (hashtagLower.includes('tech') || hashtagLower.includes('ai') || hashtagLower.includes('crypto')) {
          category = 'Technology';
        } else if (hashtagLower.includes('music') || hashtagLower.includes('dance') || hashtagLower.includes('entertainment')) {
          category = 'Entertainment';
        }

        if (hashtag && hashtag.length > 1) {
          trends.push({
            hashtag: hashtag,
            popularity: popularity,
            category: category,
            platform: 'TikTok',
            region: 'Global',
            timestamp: new Date(),
            metadata: {
              source_url: 'https://api.apify.com/v2/acts/clockworks~tiktok-trends-scraper',
              scraped_from: 'Apify TikTok Trends API',
              extraction_method: 'apify_api',
              apify_run_id: runId,
              original_data: item
            }
          });
        }
      });

      console.log(`✅ APIFY-TIKTOK: Extracted ${trends.length} TikTok trends from Apify`);
      logger.info(`Extracted ${trends.length} TikTok trends from Apify`);

      if (trends.length > 0) {
        console.log('📋 APIFY-TIKTOK: Sample trends:', trends.slice(0, 3));
      }

      return trends;

    } catch (error) {
      console.error('❌ APIFY-TIKTOK: Error:', error);
      logger.error('Apify TikTok extraction failed:', error);
      return [];
    }
  }
};