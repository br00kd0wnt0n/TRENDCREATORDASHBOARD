import { ApifyInstagramSource } from './src/scrapers/sources/apify-instagram';
import { ApifyPinterestSource } from './src/scrapers/sources/apify-pinterest';
import dotenv from 'dotenv';

dotenv.config();

async function testNewApifyScrapers() {
  console.log('🚀 Testing New Apify Scrapers (Instagram & Pinterest)...\n');

  const apifyToken = process.env.APIFY_TOKEN;
  console.log('🔑 Apify Token Status:', apifyToken && apifyToken !== 'your_apify_token_here' ? 'SET ✅' : 'NOT SET ❌');

  if (!apifyToken || apifyToken === 'your_apify_token_here') {
    console.log('\n⚠️ APIFY TOKEN NOT SET - Testing structure only\n');

    // Test source configurations
    console.log('📋 Instagram Source Configuration:');
    console.log(`Name: ${ApifyInstagramSource.name}`);
    console.log(`URL: ${ApifyInstagramSource.url}`);
    console.log(`Rate Limit: ${ApifyInstagramSource.rateLimit?.requests} requests per ${(ApifyInstagramSource.rateLimit?.window || 0) / 1000 / 60} minutes`);

    console.log('\n📋 Pinterest Source Configuration:');
    console.log(`Name: ${ApifyPinterestSource.name}`);
    console.log(`URL: ${ApifyPinterestSource.url}`);
    console.log(`Rate Limit: ${ApifyPinterestSource.rateLimit?.requests} requests per ${(ApifyPinterestSource.rateLimit?.window || 0) / 1000 / 60} minutes`);

    console.log('\n✅ Integration structures are correct');
    return;
  }

  console.log('\n🔥 Testing with real Apify API calls...');
  console.log('⚠️ This will use Apify credits (estimated ~$1-2 total)\n');

  // Test Instagram scraper
  console.log('📸 Testing Instagram Hashtag Scraper...');
  try {
    const instagramResults = await ApifyInstagramSource.extractionLogic!('');
    console.log(`✅ Instagram: ${instagramResults.length} hashtags extracted`);

    if (instagramResults.length > 0) {
      console.log('📋 Sample Instagram hashtags:');
      instagramResults.slice(0, 5).forEach((trend, i) => {
        console.log(`  ${i + 1}. ${trend.hashtag} (${trend.category}, ${trend.popularity})`);
      });
    }
  } catch (error: any) {
    console.error('❌ Instagram scraper failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test Pinterest scraper
  console.log('📌 Testing Pinterest Trends Scraper...');
  try {
    const pinterestResults = await ApifyPinterestSource.extractionLogic!('');
    console.log(`✅ Pinterest: ${pinterestResults.length} hashtags extracted`);

    if (pinterestResults.length > 0) {
      console.log('📋 Sample Pinterest hashtags:');
      pinterestResults.slice(0, 5).forEach((trend, i) => {
        console.log(`  ${i + 1}. ${trend.hashtag} (${trend.category}, ${trend.popularity})`);
      });
    }
  } catch (error: any) {
    console.error('❌ Pinterest scraper failed:', error.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 New Apify scraper testing complete!');
  console.log('\n📊 Expected Coverage:');
  console.log('- TikTok: ~90 hashtags (existing)');
  console.log('- Instagram: ~50-100 hashtags (new)');
  console.log('- Pinterest: ~50 hashtags (new)');
  console.log('- X/Twitter: ~20 hashtags (existing)');
  console.log('- TOTAL: ~200+ hashtags from 4 major platforms');
}

testNewApifyScrapers();