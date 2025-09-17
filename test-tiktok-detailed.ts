import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

async function testTikTokDetailed() {
  console.log('🚀 Starting detailed TikTok test...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('📍 Navigating to TikTok Creative Center...');
    await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for any content to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Debug: Check what's on the page
    const debugInfo = await page.evaluate(() => {
      const info: any = {};

      // Check for tables
      info.tables = document.querySelectorAll('table').length;
      info.tableRows = document.querySelectorAll('table tbody tr').length;

      // Check for various row selectors
      info.roleRows = document.querySelectorAll('[role="row"]').length;
      info.divRows = document.querySelectorAll('div[class*="row"]').length;

      // Check for hashtags in various forms
      const hashtagTexts: string[] = [];
      document.querySelectorAll('a').forEach(link => {
        const text = link.textContent?.trim() || '';
        if (text.startsWith('#') || text.match(/^[a-z0-9]+$/i)) {
          if (text.length > 2 && text.length < 30 && !text.includes(' ')) {
            hashtagTexts.push(text);
          }
        }
      });
      info.hashtagLinks = hashtagTexts.slice(0, 10);

      // Check for any text containing numbers followed by K/M (posts count)
      const postsTexts: string[] = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.match(/^\d+\.?\d*[KMB]?$/)) {
          postsTexts.push(text);
        }
      });
      info.postsCounts = postsTexts.slice(0, 10);

      // Check for specific class patterns
      info.hashtagClasses = document.querySelectorAll('[class*="hashtag"]').length;
      info.trendClasses = document.querySelectorAll('[class*="trend"]').length;
      info.cardClasses = document.querySelectorAll('[class*="card"]').length;

      // Get a sample of the page structure
      const mainContent = document.querySelector('main, [role="main"], .content, #content');
      if (mainContent) {
        info.mainContentHTML = mainContent.innerHTML.substring(0, 500);
      }

      // Check for any divs that might be rows
      const potentialRows: any[] = [];
      document.querySelectorAll('div').forEach(div => {
        // Look for divs that contain both a hashtag-like text and a number
        const text = div.textContent || '';
        if (text.includes('#') || (text.match(/\d+[KM]/) && text.length < 200)) {
          const childCount = div.children.length;
          if (childCount >= 2 && childCount <= 10) {
            potentialRows.push({
              text: text.substring(0, 100),
              childCount: childCount,
              className: div.className.substring(0, 50)
            });
          }
        }
      });
      info.potentialRows = potentialRows.slice(0, 5);

      return info;
    });

    console.log('\n📊 Page Debug Info:');
    console.log(JSON.stringify(debugInfo, null, 2));

    // Try to extract with a more flexible approach
    const trends = await page.evaluate(() => {
      const items: any[] = [];

      // Strategy 1: Look for any links that might be hashtags
      document.querySelectorAll('a').forEach(link => {
        const text = link.textContent?.trim() || '';
        const parent = link.closest('tr, [role="row"], div');

        if (parent && (text.startsWith('#') || text.match(/^[a-z0-9]+$/i))) {
          if (text.length > 2 && text.length < 30 && !text.includes(' ')) {
            // Look for a number near this hashtag
            const parentText = parent.textContent || '';
            const numberMatch = parentText.match(/(\d+\.?\d*[KMB]?)\s*(Posts?|$)/i);

            items.push({
              hashtag: text.startsWith('#') ? text : '#' + text,
              popularity: numberMatch ? numberMatch[1] : 'N/A',
              element: parent.tagName,
              parentText: parentText.substring(0, 100)
            });
          }
        }
      });

      return items.slice(0, 10);
    });

    console.log('\n🎯 Extracted Trends:');
    trends.forEach((trend, i) => {
      console.log(`${i + 1}. ${trend.hashtag} - ${trend.popularity} (from ${trend.element})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n⏰ Keeping browser open for inspection...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    await browser.close();
  }
}

testTikTokDetailed();