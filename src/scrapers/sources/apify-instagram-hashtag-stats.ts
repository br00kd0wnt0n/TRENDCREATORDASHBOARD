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

      // Content-focused seed hashtags tuned for West Coast -> India crossover
      const seedHashtags = [
        // West Coast culture & locales
        'hollywood', 'losangeles', 'venicebeach', 'santamonica', 'bayarea', 'siliconvalley',
        // Entertainment patterns
        'dancechallenge', 'comedyreels', 'musictrend', 'soundofweek', 'filmtok',
        // Tech & creator economy (SV -> India affinity)
        'ai', 'startuplife', 'techhumor', 'codingmemes',
        // India resonance hooks
        'bollywood', 'cricket', 'desimemes', 'reelsindia'
      ];

      // Start the Instagram hashtag stats scraper with correct input format
      const inputData = {
        hashtags: seedHashtags.slice(0, 5), // keep modest for tier limits
        resultsLimit: 8 // slightly higher to widen discovery set
      };

      console.log('🎯 APIFY-INSTAGRAM-STATS: Sending input:', JSON.stringify(inputData, null, 2));

      const runResponse = await axios.post(
        'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats/runs',
        inputData,
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

      // Transform Instagram hashtag stats to TrendData format
      const trends: TrendData[] = [];
      const uniqueHashtags = new Set<string>();

      console.log(`📊 APIFY-INSTAGRAM-STATS: Processing ${hashtagStatsResults.length} hashtag stat entries from Instagram`);

      hashtagStatsResults.forEach((item: any) => {
        console.log(`🔍 APIFY-INSTAGRAM-STATS: Processing hashtag result:`, {
          name: item.name,
          postsCount: item.postsCount,
          hasFrequent: !!item.frequent,
          hasRelated: !!item.related
        });

        // Process frequent hashtags (most popular related hashtags)
        if (item.frequent && Array.isArray(item.frequent)) {
          item.frequent.forEach((hashtagData: any) => {
            if (hashtagData.hash && hashtagData.info) {
              const hashtag = hashtagData.hash.startsWith('#') ? hashtagData.hash : `#${hashtagData.hash}`;

              // Filter out generic/platform hashtags
              const genericHashtags = [
                'fyp', 'bhfyp', 'fypシ', 'fypage', 'fypp', 'fypchallenge', 'fyppage', 'fyppppppppppppppppppppppp',
                'viral', 'trending', 'explore', 'instagram', 'insta', 'instadaily', 'instagood', 'instalike',
                'follow', 'followme', 'like4like', 'likeforlikes', 'comment', 'comments', 'reels', 'reel',
                'newpost', 'post', 'posts', 'photography', 'photo', 'pic', 'picture', 'selfie', 'me', 'love',
                'happy', 'fun', 'life', 'style', 'fashion', 'ootd', 'mood', 'vibes', 'blessed', 'grateful'
              ];

              const hashtagLower = hashtag.toLowerCase().replace('#', '');
              const isGeneric = genericHashtags.some(generic =>
                hashtagLower === generic ||
                hashtagLower.includes('fyp') ||
                hashtagLower.includes('viral') ||
                hashtagLower.includes('follow') ||
                hashtagLower.includes('like')
              );

              if (!uniqueHashtags.has(hashtag) && !isGeneric) {
                uniqueHashtags.add(hashtag);

                let category = 'General';
                const hashtagLower = hashtag.toLowerCase();

                // Categorize hashtag
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

                const postsPerDayFreq = (hashtagData?.info && (hashtagData.info.postsPerDay || hashtagData.info.posts_per_day)) || undefined;
                trends.push({
                  hashtag: hashtag,
                  popularity: hashtagData.info || 'Trending',
                  category: category,
                  platform: 'Instagram',
                  region: 'Global',
                  timestamp: new Date(),
                  metadata: {
                    source_url: 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats',
                    scraped_from: 'Apify Instagram Hashtag Stats API',
                    extraction_method: 'apify_instagram_hashtag_stats',
                    apify_run_id: runId,
                    related_to: item.name,
                    frequency_type: 'frequent',
                    ...(typeof postsPerDayFreq === 'number' ? { posts_per_day: postsPerDayFreq } : {}),
                    original_data: hashtagData
                  }
                });
              }
            }
          });
        }

        // Process related hashtags (semantically related trending hashtags)
        if (item.related && Array.isArray(item.related)) {
          item.related.slice(0, 20).forEach((hashtagData: any) => { // Limit to top 20 related
            if (hashtagData.hash && hashtagData.info) {
              const hashtag = hashtagData.hash.startsWith('#') ? hashtagData.hash : `#${hashtagData.hash}`;

              // Same generic filter for related hashtags
              const genericHashtags = [
                'fyp', 'bhfyp', 'fypシ', 'fypage', 'fypp', 'fypchallenge', 'fyppage', 'fyppppppppppppppppppppppp',
                'viral', 'trending', 'explore', 'instagram', 'insta', 'instadaily', 'instagood', 'instalike',
                'follow', 'followme', 'like4like', 'likeforlikes', 'comment', 'comments', 'reels', 'reel',
                'newpost', 'post', 'posts', 'photography', 'photo', 'pic', 'picture', 'selfie', 'me', 'love',
                'happy', 'fun', 'life', 'style', 'fashion', 'ootd', 'mood', 'vibes', 'blessed', 'grateful'
              ];

              const hashtagLower = hashtag.toLowerCase().replace('#', '');
              const isGeneric = genericHashtags.some(generic =>
                hashtagLower === generic ||
                hashtagLower.includes('fyp') ||
                hashtagLower.includes('viral') ||
                hashtagLower.includes('follow') ||
                hashtagLower.includes('like')
              );

              if (!uniqueHashtags.has(hashtag) && !isGeneric) {
                uniqueHashtags.add(hashtag);

                let category = 'General';
                const hashtagLower = hashtag.toLowerCase();

                // Categorize hashtag (same logic as above)
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

                const postsPerDayRel = (hashtagData?.info && (hashtagData.info.postsPerDay || hashtagData.info.posts_per_day)) || undefined;
                trends.push({
                  hashtag: hashtag,
                  popularity: hashtagData.info || 'Related trending',
                  category: category,
                  platform: 'Instagram',
                  region: 'Global',
                  timestamp: new Date(),
                  metadata: {
                    source_url: 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats',
                    scraped_from: 'Apify Instagram Hashtag Stats API',
                    extraction_method: 'apify_instagram_hashtag_stats',
                    apify_run_id: runId,
                    related_to: item.name,
                    frequency_type: 'related',
                    ...(typeof postsPerDayRel === 'number' ? { posts_per_day: postsPerDayRel } : {}),
                    original_data: hashtagData
                  }
                });
              }
            }
          });
        }

        // Also include the main hashtag if it has post count data
        if (item.name && item.postsCount) {
          const hashtag = item.name.startsWith('#') ? item.name : `#${item.name}`;

          if (!uniqueHashtags.has(hashtag)) {
            uniqueHashtags.add(hashtag);

            const postsCount = parseInt(item.postsCount);
            let popularity = 'Popular';
            if (postsCount > 1000000000) {
              popularity = `${(postsCount / 1000000000).toFixed(1)}B posts`;
            } else if (postsCount > 1000000) {
              popularity = `${(postsCount / 1000000).toFixed(1)}M posts`;
            } else if (postsCount > 1000) {
              popularity = `${Math.round(postsCount / 1000)}K posts`;
            } else {
              popularity = `${postsCount} posts`;
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
                posts_count: postsCount,
                is_seed_hashtag: true,
                posts_per_day: item.postsPerDay,
                original_data: item
              }
            });
          }
        }
      });

      console.log(`✅ APIFY-INSTAGRAM-STATS: Extracted ${trends.length} trending Instagram hashtags from posts analysis`);
      logger.info(`Extracted ${trends.length} trending Instagram hashtags from posts analysis`);

      if (trends.length > 0) {
        console.log('📋 APIFY-INSTAGRAM-STATS: Top trending hashtags:', trends.slice(0, 10).map(t => `${t.hashtag} (${t.popularity})`));
      }

      return trends;

    } catch (error: any) {
      console.error('❌ APIFY-INSTAGRAM-STATS: Error:', error);

      // Log detailed error information for debugging
      if (error.response) {
        console.error('❌ APIFY-INSTAGRAM-STATS: Response status:', error.response.status);
        console.error('❌ APIFY-INSTAGRAM-STATS: Response data:', JSON.stringify(error.response.data, null, 2));
        console.error('❌ APIFY-INSTAGRAM-STATS: Request URL:', error.config?.url || 'https://api.apify.com/v2/acts/apify~instagram-hashtag-stats/runs');

        if (error.response.status === 401) {
          console.error('🔐 APIFY-INSTAGRAM-STATS: Authentication failed! Check your APIFY_TOKEN in .env');
          console.error('🔐 APIFY-INSTAGRAM-STATS: Current token (first 10 chars):', process.env.APIFY_TOKEN?.substring(0, 10) + '...');
        }
      }

      logger.error('Apify Instagram hashtag stats extraction failed:', error);
      return [];
    }
  }
};
