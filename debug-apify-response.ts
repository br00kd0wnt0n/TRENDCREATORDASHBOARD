import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function debugApifyResponse() {
  console.log('🔍 Debugging Apify response structure...\n');

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    console.log('❌ No Apify token found');
    return;
  }

  try {
    // Start the scraper
    console.log('🚀 Starting Apify run...');
    const runResponse = await axios.post(
      'https://api.apify.com/v2/acts/lexis-solutions~tiktok-trending-hashtags-scraper/runs',
      {
        input: {
          country: 'US',
          maxHashtags: 10, // Smaller number for debugging
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
    console.log(`📋 Run ID: ${runId}`);

    // Wait for completion
    let runStatus = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 15;

    while (runStatus === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000));

      const statusResponse = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        }
      );

      runStatus = statusResponse.data.data.status;
      attempts++;
      console.log(`⏳ Status: ${runStatus} (${attempts}/${maxAttempts})`);
    }

    if (runStatus !== 'SUCCEEDED') {
      console.log(`❌ Run failed with status: ${runStatus}`);
      return;
    }

    // Get the raw results
    const resultsResponse = await axios.get(
      `https://api.apify.com/v2/datasets/${runResponse.data.data.defaultDatasetId}/items`,
      {
        headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
      }
    );

    const results = resultsResponse.data;
    console.log(`\n📊 Got ${results.length} items from Apify\n`);

    // Debug the first few items
    console.log('🔍 RAW DATA STRUCTURE:');
    console.log('='.repeat(50));

    results.slice(0, 3).forEach((item: any, index: number) => {
      console.log(`\n📋 Item ${index + 1}:`);
      console.log(JSON.stringify(item, null, 2));
      console.log('-'.repeat(30));
    });

    // Show all available keys
    if (results.length > 0) {
      const allKeys = new Set();
      results.forEach((item: any) => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });

      console.log('\n🔑 ALL AVAILABLE KEYS:');
      console.log(Array.from(allKeys).sort());
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  }
}

debugApifyResponse();