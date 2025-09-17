import { TikTokSource } from './src/scrapers/sources/tiktok';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

async function testTikTokScraper() {
  console.log('🚀 Starting TikTok scraper test...');

  const browser = await puppeteer.launch({
    headless: false, // Set to false so we can see what's happening
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📍 Navigating to:', TikTokSource.url);
    await page.goto(TikTokSource.url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take a screenshot to see what we're working with
    await page.screenshot({ path: 'tiktok-page.png', fullPage: false });
    console.log('📸 Screenshot saved as tiktok-page.png');

    // Try to extract trends
    if (TikTokSource.extractionLogic) {
      console.log('🔍 Running extraction logic...');
      const trends = await TikTokSource.extractionLogic(page);

      console.log(`\n📊 Found ${trends.length} trends:`);
      trends.slice(0, 5).forEach((trend, i) => {
        console.log(`\n${i + 1}. ${trend.hashtag}`);
        console.log(`   Category: ${trend.category}`);
        console.log(`   Popularity: ${trend.popularity}`);
        console.log(`   Platform: ${trend.platform}`);
      });

      // Log page content for debugging
      const pageContent = await page.evaluate(() => {
        // Look for any elements that might contain trends
        const potentialTrends: string[] = [];

        // Check for hashtags
        document.querySelectorAll('*').forEach(el => {
          const text = el.textContent || '';
          if (text.match(/#\w+/) && text.length < 100) {
            potentialTrends.push(`Hashtag found: ${text.trim()}`);
          }
        });

        // Check specific class names that might contain trends
        const trendClasses = ['trend', 'hashtag', 'popular', 'topic', 'card'];
        trendClasses.forEach(className => {
          const elements = document.querySelectorAll(`[class*="${className}"]`);
          if (elements.length > 0) {
            potentialTrends.push(`Found ${elements.length} elements with class containing "${className}"`);
          }
        });

        return potentialTrends.slice(0, 10);
      });

      console.log('\n🔍 Page analysis:');
      pageContent.forEach(item => console.log(`   - ${item}`));

    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Keep browser open for 10 seconds to inspect
    console.log('\n⏰ Keeping browser open for 10 seconds for inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    await browser.close();
  }
}

testTikTokScraper();