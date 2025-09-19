import { TrendSource, TrendData } from '../../types';
import { logger } from '../../config/database';
import axios from 'axios';

export const ApifyInstagramHashtagStatsSource: TrendSource = {
  name: 'Apify Instagram Hashtag Stats',
  url: 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats',
  scrapeMethod: 'axios',
  rateLimit: {
    requests: 2,
    window: 3600000 // 1 hour
  },
  extractionLogic: async (): Promise<TrendData[]> => {
    try {
      console.log('🎯 APIFY-INSTAGRAM-STATS: Starting Instagram hashtag stats extraction');

      const APIFY_TOKEN = process.env.APIFY_TOKEN;
      if (!APIFY_TOKEN) {
        logger.warn('No Apify token found - skipping Instagram hashtag stats scraper');
        return [];
      }

      // Popular seed hashtags across different categories to discover trending related hashtags
      const seedHashtags = [
        // General popular categories
        'instagram', 'viral', 'trending', 'explore', 'fyp',
        // Lifestyle & Fashion
        'fashion', 'style', 'ootd', 'beauty', 'lifestyle',
        // Entertainment & Culture
        'music', 'art', 'photography', 'reels', 'video',
        // Health & Wellness
        'fitness', 'wellness', 'health', 'mindfulness',
        // Technology & Business
        'tech', 'ai', 'business', 'entrepreneur',
        // Food & Travel
        'food', 'travel', 'foodie', 'vacation'
      ];

      // Start the Instagram hashtag stats scraper
      const runResponse = await axios.post(
        'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats/runs',
        {
          input: {
            hashtags: seedHashtags.slice(0, 10), // Use first 10 seed hashtags
            maxResults: 100,
            includeRelatedHashtags: true,
            includeTopPosts: true,
            includeRecentPosts: true
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
      console.log(`🚀 APIFY-INSTAGRAM-STATS: Started Instagram hashtag stats run ${runId}`);

      // Poll for completion
      let runStatus = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 20;

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
        console.log(`⏳ APIFY-INSTAGRAM-STATS: Run status: ${runStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (runStatus !== 'SUCCEEDED') {
        logger.warn(`Apify Instagram hashtag stats run failed. Status: ${runStatus}`);
        return [];
      }

      // Get results
      const resultsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items`,
        {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        }
      );

      const hashtagStatsResults = resultsResponse.data;
      console.log(`📊 APIFY-INSTAGRAM-STATS: Retrieved ${hashtagStatsResults.length} hashtag stat items from Apify`);

      // Transform to TrendData format - focus on related hashtags that are trending
      const trends: TrendData[] = [];
      const uniqueHashtags = new Set<string>();

      hashtagStatsResults.forEach((item: any) => {
        // Extract related hashtags from each seed hashtag result
        if (item.relatedHashtags && Array.isArray(item.relatedHashtags)) {
          item.relatedHashtags.forEach((relatedTag: any) => {
            let hashtag = '';
            let popularity = 'Trending';
            let category = 'General';

            // Extract hashtag
            if (relatedTag.hashtag) {
              hashtag = relatedTag.hashtag.startsWith('#') ? relatedTag.hashtag : `#${relatedTag.hashtag}`;
            } else if (relatedTag.name) {
              hashtag = relatedTag.name.startsWith('#') ? relatedTag.name : `#${relatedTag.name}`;
            } else if (relatedTag.tag) {
              hashtag = relatedTag.tag.startsWith('#') ? relatedTag.tag : `#${relatedTag.tag}`;
            }

            // Skip if already processed or invalid
            if (!hashtag || hashtag.length <= 1 || uniqueHashtags.has(hashtag)) {
              return;
            }
            uniqueHashtags.add(hashtag);

            // Extract popularity metrics
            if (relatedTag.postsCount || relatedTag.posts_count || relatedTag.frequency) {
              const count = parseInt(relatedTag.postsCount || relatedTag.posts_count || relatedTag.frequency);
              if (count > 10000000) {
                popularity = `${(count / 1000000).toFixed(1)}M posts`;
              } else if (count > 1000000) {
                popularity = `${(count / 1000000).toFixed(1)}M posts`;
              } else if (count > 1000) {
                popularity = `${Math.round(count / 1000)}K posts`;
              } else {
                popularity = `${count} posts`;
              }
            } else if (relatedTag.score || relatedTag.popularity) {
              const score = parseFloat(relatedTag.score || relatedTag.popularity || '0');
              popularity = `${(score * 100).toFixed(1)}% trending`;
            }

            // Categorize based on hashtag content
            const hashtagLower = hashtag.toLowerCase();
            if (hashtagLower.includes('fashion') || hashtagLower.includes('style') || hashtagLower.includes('outfit') || hashtagLower.includes('ootd')) {
              category = 'Fashion';
            } else if (hashtagLower.includes('beauty') || hashtagLower.includes('makeup') || hashtagLower.includes('skincare')) {
              category = 'Beauty & Personal Care';
            } else if (hashtagLower.includes('fitness') || hashtagLower.includes('workout') || hashtagLower.includes('gym') || hashtagLower.includes('health')) {
              category = 'Health & Fitness';
            } else if (hashtagLower.includes('food') || hashtagLower.includes('recipe') || hashtagLower.includes('cooking') || hashtagLower.includes('foodie')) {
              category = 'Food & Beverage';
            } else if (hashtagLower.includes('travel') || hashtagLower.includes('vacation') || hashtagLower.includes('wanderlust')) {
              category = 'Travel';
            } else if (hashtagLower.includes('art') || hashtagLower.includes('artist') || hashtagLower.includes('creative') || hashtagLower.includes('design')) {
              category = 'Arts & Crafts';
            } else if (hashtagLower.includes('music') || hashtagLower.includes('song') || hashtagLower.includes('band')) {
              category = 'Music';
            } else if (hashtagLower.includes('tech') || hashtagLower.includes('ai') || hashtagLower.includes('digital')) {
              category = 'Technology';
            } else if (hashtagLower.includes('business') || hashtagLower.includes('entrepreneur') || hashtagLower.includes('startup')) {
              category = 'Business';
            } else if (hashtagLower.includes('lifestyle') || hashtagLower.includes('life') || hashtagLower.includes('daily')) {
              category = 'Lifestyle';
            }

            trends.push({
              hashtag: hashtag,
              popularity: popularity,
              category: category,
              platform: 'Instagram',
              region: 'Global',
              timestamp: new Date(),
              metadata: {
                source_url: 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats',
                scraped_from: 'Apify Instagram Hashtag Stats API',
                extraction_method: 'apify_instagram_hashtag_stats',
                apify_run_id: runId,
                seed_hashtag: item.hashtag || item.originalHashtag,
                frequency: relatedTag.frequency || relatedTag.score,
                posts_count: relatedTag.postsCount || relatedTag.posts_count,
                original_data: relatedTag
              }
            });
          });
        }

        // Also include the main hashtag if it has good stats
        if (item.hashtag && item.postsCount) {
          const hashtag = item.hashtag.startsWith('#') ? item.hashtag : `#${item.hashtag}`;

          if (!uniqueHashtags.has(hashtag)) {
            uniqueHashtags.add(hashtag);

            const count = parseInt(item.postsCount);
            let popularity = 'Popular';
            if (count > 10000000) {
              popularity = `${(count / 1000000).toFixed(1)}M posts`;
            } else if (count > 1000000) {
              popularity = `${(count / 1000000).toFixed(1)}M posts`;
            } else if (count > 1000) {
              popularity = `${Math.round(count / 1000)}K posts`;
            } else {
              popularity = `${count} posts`;
            }

            trends.push({
              hashtag: hashtag,
              popularity: popularity,
              category: 'General',
              platform: 'Instagram',
              region: 'Global',
              timestamp: new Date(),
              metadata: {
                source_url: 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats',
                scraped_from: 'Apify Instagram Hashtag Stats API',
                extraction_method: 'apify_instagram_hashtag_stats',
                apify_run_id: runId,
                posts_count: count,
                is_seed_hashtag: true,
                original_data: item
              }
            });
          }
        }
      });

      // Sort by popularity (extract numbers from popularity strings) and take top trends
      const sortedTrends = trends.sort((a, b) => {
        const getPopularityScore = (pop: string): number => {
          if (pop.includes('M posts')) {
            return parseFloat(pop.split('M')[0]) * 1000000;
          } else if (pop.includes('K posts')) {
            return parseFloat(pop.split('K')[0]) * 1000;
          } else if (pop.includes('posts')) {
            return parseInt(pop.split(' posts')[0]) || 0;
          } else if (pop.includes('% trending')) {
            return parseFloat(pop.split('%')[0]) * 1000; // Boost trending score
          }
          return 0;
        };

        return getPopularityScore(b.popularity || '') - getPopularityScore(a.popularity || '');
      });

      const finalTrends = sortedTrends.slice(0, 50); // Top 50 trending hashtags

      console.log(`✅ APIFY-INSTAGRAM-STATS: Extracted ${finalTrends.length} trending Instagram hashtags from related hashtag analysis`);
      logger.info(`Extracted ${finalTrends.length} trending Instagram hashtags from hashtag stats`);

      if (finalTrends.length > 0) {
        console.log('📋 APIFY-INSTAGRAM-STATS: Top trending hashtags:', finalTrends.slice(0, 10).map(t => `${t.hashtag} (${t.popularity})`));
      }

      return finalTrends;

    } catch (error) {
      console.error('❌ APIFY-INSTAGRAM-STATS: Error:', error);
      logger.error('Apify Instagram hashtag stats extraction failed:', error);
      return [];
    }
  }
};