import { ApifyTikTokHashtagSource } from './src/scrapers/sources/apify-tiktok-hashtags';
import dotenv from 'dotenv';

dotenv.config();

async function testApifyIntegration() {
  console.log('🚀 Testing Apify TikTok Hashtag Integration...\n');

  // Check if Apify token is set
  const apifyToken = process.env.APIFY_TOKEN;
  console.log('🔑 Apify Token Status:', apifyToken && apifyToken !== 'your_apify_token_here' ? 'SET ✅' : 'NOT SET ❌');

  if (!apifyToken || apifyToken === 'your_apify_token_here') {
    console.log('\n⚠️ APIFY TOKEN NOT SET');
    console.log('To test with real data, you need to:');
    console.log('1. Sign up for Apify at https://apify.com/');
    console.log('2. Get your API token from https://console.apify.com/account#/integrations');
    console.log('3. Set APIFY_TOKEN in your .env file');
    console.log('4. Free tier includes $5/month in credits');
    console.log('\n🔧 For now, testing the integration structure...');

    // Test the source configuration
    console.log('\n📋 Apify Source Configuration:');
    console.log(`Name: ${ApifyTikTokHashtagSource.name}`);
    console.log(`URL: ${ApifyTikTokHashtagSource.url}`);
    console.log(`Method: ${ApifyTikTokHashtagSource.scrapeMethod}`);
    console.log(`Rate Limit: ${ApifyTikTokHashtagSource.rateLimit?.requests} requests per ${(ApifyTikTokHashtagSource.rateLimit?.window || 0) / 1000 / 60} minutes`);

    // Mock test without API call
    console.log('\n🧪 Testing extraction logic structure...');
    try {
      // This should return empty array due to missing token
      const mockResults = await ApifyTikTokHashtagSource.extractionLogic!('');
      console.log(`Result: ${mockResults.length} trends (expected 0 without token)`);
      console.log('✅ Integration structure is correct');
    } catch (error) {
      console.error('❌ Integration structure error:', error);
    }

    return;
  }

  // If token is set, we could test a real API call
  console.log('\n🔥 Apify token detected! Testing real API call...');
  console.log('⚠️ This will use Apify credits');

  try {
    console.log('🚀 Starting Apify scrape...');
    const results = await ApifyTikTokHashtagSource.extractionLogic!('');

    console.log(`\n📊 RESULTS: ${results.length} trends extracted`);

    if (results.length > 0) {
      console.log('\n🎯 Sample Results:');
      results.slice(0, 5).forEach((trend, i) => {
        console.log(`${i + 1}. ${trend.hashtag}`);
        console.log(`   Category: ${trend.category}`);
        console.log(`   Popularity: ${trend.popularity}`);
        console.log(`   Platform: ${trend.platform}`);
      });

      console.log('\n✅ Apify integration working successfully!');
    } else {
      console.log('⚠️ No results returned - check Apify actor configuration');
    }

  } catch (error) {
    console.error('❌ Apify API call failed:', error);
  }
}

testApifyIntegration();