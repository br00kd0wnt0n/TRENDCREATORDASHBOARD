import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';
import axios from 'axios';

export const ApifyInstagramSource: TrendSource = {
  name: 'Apify Instagram Hashtags',
  url: 'https://api.apify.com/v2/acts/easyapi~instagram-hashtag-scraper',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 2,
    window: 3600000 // 1 hour
  },
  extractionLogic: async (): Promise<TrendData[]> => {
    try {
      console.log('🎯 APIFY-INSTAGRAM: Starting Instagram hashtag extraction');

      const APIFY_TOKEN = process.env.APIFY_TOKEN;
      if (!APIFY_TOKEN) {
        logger.warn('No Apify token found - skipping Instagram scraper');
        return [];
      }

      // Popular hashtag categories to scrape
      const hashtagCategories = [
        'fashion', 'beauty', 'fitness', 'food', 'travel', 'lifestyle',
        'art', 'photography', 'music', 'technology', 'business'
      ];

      // Start the Instagram hashtag scraper with simplified input
      const runResponse = await axios.post(
        'https://api.apify.com/v2/acts/easyapi~instagram-hashtag-scraper/runs',
        {
          input: {
            hashtags: hashtagCategories.slice(0, 5),
            maxResults: 50
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
      console.log(`🚀 APIFY-INSTAGRAM: Started Instagram run ${runId}`);

      // Poll for completion
      let runStatus = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 25; // Instagram scraping can take longer

      while (runStatus === 'RUNNING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

        const statusResponse = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          {
            headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
          }
        );

        runStatus = statusResponse.data.data.status;
        attempts++;
        console.log(`⏳ APIFY-INSTAGRAM: Run status: ${runStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (runStatus !== 'SUCCEEDED') {
        logger.warn(`Apify Instagram run failed. Status: ${runStatus}`);
        return [];
      }

      // Get results
      const resultsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items`,
        {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        }
      );

      const instagramResults = resultsResponse.data;
      console.log(`📊 APIFY-INSTAGRAM: Retrieved ${instagramResults.length} Instagram items from Apify`);

      // Transform to TrendData format
      const trends: TrendData[] = [];

      instagramResults.forEach((item: any, index: number) => {
        let hashtag = '';
        let popularity = 'Trending';
        let category = 'General';

        // Extract hashtag from various possible fields
        if (item.hashtag) {
          hashtag = item.hashtag.startsWith('#') ? item.hashtag : `#${item.hashtag}`;
        } else if (item.tag) {
          hashtag = item.tag.startsWith('#') ? item.tag : `#${item.tag}`;
        } else if (item.name) {
          hashtag = item.name.startsWith('#') ? item.name : `#${item.name}`;
        } else if (item.text && item.text.startsWith('#')) {
          hashtag = item.text;
        }

        // Extract popularity metrics
        if (item.postsCount || item.posts_count || item.count) {
          const count = parseInt(item.postsCount || item.posts_count || item.count);
          if (count > 1000000) {
            popularity = `${(count / 1000000).toFixed(1)}M posts`;
          } else if (count > 1000) {
            popularity = `${Math.round(count / 1000)}K posts`;
          } else {
            popularity = `${count} posts`;
          }
        } else if (item.engagement || item.likes || item.comments) {
          const engagement = parseInt(item.engagement || item.likes || item.comments);
          if (engagement > 1000000) {
            popularity = `${(engagement / 1000000).toFixed(1)}M engagement`;
          } else if (engagement > 1000) {
            popularity = `${Math.round(engagement / 1000)}K engagement`;
          } else {
            popularity = `${engagement} engagement`;
          }
        } else if (item.rank || item.position) {
          popularity = `#${item.rank || item.position} trending`;
        }

        // Categorize based on hashtag content and metadata
        if (item.category) {
          category = item.category;
        } else {
          const hashtagLower = hashtag.toLowerCase();
          if (hashtagLower.includes('fashion') || hashtagLower.includes('style') || hashtagLower.includes('outfit') || hashtagLower.includes('ootd')) {
            category = 'Fashion';
          } else if (hashtagLower.includes('beauty') || hashtagLower.includes('makeup') || hashtagLower.includes('skincare') || hashtagLower.includes('cosmetic')) {
            category = 'Beauty & Personal Care';
          } else if (hashtagLower.includes('fitness') || hashtagLower.includes('workout') || hashtagLower.includes('gym') || hashtagLower.includes('health')) {
            category = 'Health & Fitness';
          } else if (hashtagLower.includes('food') || hashtagLower.includes('recipe') || hashtagLower.includes('cooking') || hashtagLower.includes('foodie')) {
            category = 'Food & Beverage';
          } else if (hashtagLower.includes('travel') || hashtagLower.includes('vacation') || hashtagLower.includes('wanderlust') || hashtagLower.includes('explore')) {
            category = 'Travel';
          } else if (hashtagLower.includes('art') || hashtagLower.includes('artist') || hashtagLower.includes('creative') || hashtagLower.includes('design')) {
            category = 'Arts & Crafts';
          } else if (hashtagLower.includes('photo') || hashtagLower.includes('photography') || hashtagLower.includes('pic') || hashtagLower.includes('shot')) {
            category = 'Photography';
          } else if (hashtagLower.includes('music') || hashtagLower.includes('song') || hashtagLower.includes('band') || hashtagLower.includes('concert')) {
            category = 'Music';
          } else if (hashtagLower.includes('tech') || hashtagLower.includes('technology') || hashtagLower.includes('digital') || hashtagLower.includes('ai')) {
            category = 'Technology';
          } else if (hashtagLower.includes('business') || hashtagLower.includes('entrepreneur') || hashtagLower.includes('startup') || hashtagLower.includes('marketing')) {
            category = 'Business';
          } else if (hashtagLower.includes('lifestyle') || hashtagLower.includes('life') || hashtagLower.includes('daily') || hashtagLower.includes('motivation')) {
            category = 'Lifestyle';
          }
        }

        if (hashtag && hashtag.length > 1 && !hashtag.includes('undefined')) {
          trends.push({
            hashtag: hashtag,
            popularity: popularity,
            category: category,
            platform: 'Instagram',
            region: 'Global',
            timestamp: new Date(),
            metadata: {
              source_url: 'https://api.apify.com/v2/acts/easyapi~instagram-hashtag-scraper',
              scraped_from: 'Apify Instagram Hashtag API',
              extraction_method: 'apify_instagram_api',
              apify_run_id: runId,
              rank: index + 1,
              original_data: item
            }
          });
        }
      });

      console.log(`✅ APIFY-INSTAGRAM: Extracted ${trends.length} Instagram hashtags from Apify`);
      logger.info(`Extracted ${trends.length} Instagram hashtags from Apify`);

      if (trends.length > 0) {
        console.log('📋 APIFY-INSTAGRAM: Sample trends:', trends.slice(0, 5).map(t => `${t.hashtag} (${t.popularity})`));
      }

      return trends;

    } catch (error) {
      console.error('❌ APIFY-INSTAGRAM: Error:', error);
      logger.error('Apify Instagram extraction failed:', error);
      return [];
    }
  }
};