import { TrendScraper } from './src/scrapers/TrendScraper';
import dotenv from 'dotenv';

dotenv.config();

async function testAllScrapers() {
  console.log('🚀 Starting comprehensive scraper test...\n');

  const scraper = new TrendScraper();

  try {
    // Test scraping all sources
    const results = await scraper.scrapeAllSources();

    console.log('\n📊 SCRAPING RESULTS SUMMARY:');
    console.log('='.repeat(50));

    let totalTrends = 0;
    const sourceResults: any = {};

    // Group results by platform
    results.trends.forEach((trend: any) => {
      const platform = trend.platform || 'Unknown';
      if (!sourceResults[platform]) {
        sourceResults[platform] = [];
      }
      sourceResults[platform].push(trend);
      totalTrends++;
    });

    // Display results for each platform
    Object.keys(sourceResults).forEach(platform => {
      const trends = sourceResults[platform];
      console.log(`\n📍 ${platform}: ${trends.length} trends found`);

      // Show first 3 trends from each platform
      trends.slice(0, 3).forEach((trend: any, i: number) => {
        console.log(`  ${i + 1}. ${trend.hashtag}`);
        console.log(`     Category: ${trend.category}`);
        console.log(`     Popularity: ${trend.popularity}`);
      });

      if (trends.length > 3) {
        console.log(`  ... and ${trends.length - 3} more`);
      }
    });

    console.log('\n' + '='.repeat(50));
    console.log(`TOTAL TRENDS COLLECTED: ${totalTrends}`);
    console.log('='.repeat(50));

    // Check for issues
    const issues: string[] = [];

    if (totalTrends === 0) {
      issues.push('❌ No trends were collected from any source');
    }

    Object.keys(sourceResults).forEach(platform => {
      const trends = sourceResults[platform];

      // Check for generic hashtags that indicate bad scraping
      const genericHashtags = trends.filter((t: any) =>
        t.hashtag.includes('Hashtag') ||
        t.hashtag.includes('Rank') ||
        t.hashtag.includes('Posts') ||
        t.hashtag.includes('Trend') ||
        t.hashtag.includes('Actions')
      );

      if (genericHashtags.length > 0) {
        issues.push(`⚠️ ${platform}: Found ${genericHashtags.length} generic/UI hashtags`);
      }

      // Check for all "General" categories
      const generalOnly = trends.filter((t: any) => t.category === 'General');
      if (generalOnly.length === trends.length && trends.length > 0) {
        issues.push(`⚠️ ${platform}: All trends have 'General' category - categories may not be extracting properly`);
      }

      // Check for missing popularity data
      const noPopularity = trends.filter((t: any) => !t.popularity || t.popularity === 'N/A');
      if (noPopularity.length > trends.length / 2) {
        issues.push(`⚠️ ${platform}: More than half of trends missing popularity data`);
      }
    });

    if (issues.length > 0) {
      console.log('\n🔍 ISSUES DETECTED:');
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('\n✅ All scrapers appear to be working correctly!');
    }

  } catch (error) {
    console.error('❌ Error during scraping:', error);
  }

  process.exit(0);
}

testAllScrapers();