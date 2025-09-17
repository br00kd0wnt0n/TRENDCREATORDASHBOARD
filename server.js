const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const path = require('path');
const { OpenAI } = require('openai');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3002;
const TRENDS_API_URL = process.env.TRENDS_API_URL || 'http://localhost:30003/api';
const CREATORS_API_URL = process.env.CREATORS_API_URL || 'http://localhost:3001/api';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false // Allow iframes
}));

// Allow CORS from both local and production URLs
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:30003',
  'https://trendcreatordashboard.up.railway.app',
  'https://ralphlovestrends-production.up.railway.app',
  'https://ralphodex.up.railway.app',
  'https://backend-production-a0a1.up.railway.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Cache for AI insights to avoid excessive API calls
const insightsCache = new Map();
const CACHE_TTL = parseInt(process.env.AI_INSIGHTS_CACHE_TTL) || 300000; // 5 minutes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Ralph Unified Dashboard',
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoints to maintain CORS compatibility
app.get('/api/trends/*', async (req, res) => {
  try {
    const path = req.path.replace('/api/trends', '');
    const apiUrl = `${TRENDS_API_URL}${path}`;
    console.log('Proxying to Trends API:', apiUrl);

    const response = await axios.get(apiUrl, {
      params: req.query,
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Trends API proxy error:', error.message);
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Failed to fetch trends data',
        details: error.response.data
      });
    } else {
      res.status(500).json({
        error: 'Failed to fetch trends data',
        message: error.message
      });
    }
  }
});

app.get('/api/creators/*', async (req, res) => {
  try {
    const response = await axios.get(`${CREATORS_API_URL}${req.path.replace('/api/creators', '')}`, {
      params: req.query,
      headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {}
    });
    res.json(response.data);
  } catch (error) {
    console.error('Creators API proxy error:', error.message);
    res.status(500).json({ error: 'Failed to fetch creators data' });
  }
});

// AI-powered crossover insights endpoint
app.post('/api/crossover/insights', async (req, res) => {
  try {
    const { type, data, context, specific, tabContext, strategicInsights, marketContext, usingAIIntel } = req.body;

    console.log(`Generating ${type} insights:`, {
      dataCount: data?.length || 0,
      contextCount: context?.length || 0,
      specific,
      tabContext,
      usingAIIntel: !!usingAIIntel
    });

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured',
        fallback: generateFallbackInsights(type, data)
      });
    }

    // Create cache key that includes tab context and specific flag
    const cacheKey = `${type}_${specific ? 'specific' : 'general'}_${tabContext}_${JSON.stringify(data?.slice(0, 3))}_${Date.now() > (Date.now() - 300000) ? 'recent' : 'old'}`;

    // Check cache first (but with shorter TTL for specific insights)
    const cacheTTL = specific ? 60000 : CACHE_TTL; // 1 minute for specific, 5 minutes for general
    if (insightsCache.has(cacheKey)) {
      const cached = insightsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < cacheTTL) {
        console.log('Returning cached insights');
        return res.json(cached.data);
      }
    }

    let insights;

    if (type === 'trend-to-creators') {
      insights = await generateTrendToCreatorInsights(data, context, specific, tabContext, strategicInsights, marketContext);
    } else if (type === 'creator-to-trends') {
      insights = await generateCreatorToTrendInsights(data, context, specific, tabContext);
    } else {
      throw new Error('Invalid insight type');
    }

    // Cache the result
    insightsCache.set(cacheKey, {
      data: { success: true, insights },
      timestamp: Date.now()
    });

    res.json({ success: true, insights });
  } catch (error) {
    console.error('AI insights error:', error);
    res.json({
      success: false,
      error: error.message,
      fallback: generateFallbackInsights(req.body.type, req.body.data)
    });
  }
});

// Generate trend-to-creator insights using OpenAI
async function generateTrendToCreatorInsights(trendData, creatorsContext, specific = false, tabContext = '', strategicInsights = null, marketContext = null) {
  const isSpecificTrend = specific && trendData.length === 1;
  const trendCount = trendData.length;
  const usingAIIntel = !!strategicInsights;

  const prompt = `
As an expert in social media marketing and creator partnerships, analyze ${isSpecificTrend ? 'this specific trend' : `these ${trendCount} trending topics`} and suggest relevant creators for brand partnerships.

${usingAIIntel ? 'STRATEGIC INSIGHTS FROM TREND ANALYSIS AI INTEL BRIEFING:' : ''}
${usingAIIntel ? JSON.stringify(strategicInsights, null, 2) : ''}

${usingAIIntel ? 'MARKET CONTEXT:' : ''}
${usingAIIntel ? JSON.stringify(marketContext, null, 2) : ''}

${isSpecificTrend ? 'SPECIFIC TREND BEING ANALYZED:' : `TOP ${trendCount} AI-ANALYZED TRENDING DATA:`}
${JSON.stringify(trendData, null, 2)}

AVAILABLE CREATORS CONTEXT:
${JSON.stringify(creatorsContext.slice(0, 15), null, 2)}

${usingAIIntel ? `
IMPORTANT: Use the Strategic Insights from the AI Intel briefing above to inform your analysis. Reference the key insights, market intelligence, and strategic recommendations when matching creators to trends.

Cross-reference the Strategic Insights with the CREATOR database to provide:` : 'Please provide:'}
1. Top 3-5 creators who would be best suited for ${usingAIIntel ? 'these AI-analyzed trends and Strategic Insights' : 'this trend'}
2. Specific collaboration ideas for each creator ${usingAIIntel ? 'based on the Strategic Insights' : ''}
3. Expected engagement potential (High/Medium/Low) ${usingAIIntel ? 'considering the market context' : ''}
4. Why each creator matches ${usingAIIntel ? 'the Strategic Insights and trending patterns' : 'this trend'}
5. Suggested content formats (videos, posts, stories, etc.) ${usingAIIntel ? 'that align with the Strategic Insights' : ''}

Format as JSON with this structure:
{
  "recommendedCreators": [
    {
      "creatorId": "uuid",
      "creatorName": "name",
      "matchScore": 0.95,
      "reasoning": "Why they match",
      "collaborationIdeas": ["idea1", "idea2"],
      "expectedEngagement": "High|Medium|Low",
      "suggestedFormats": ["format1", "format2"]
    }
  ],
  "trendInsights": "Overall insights about the trend",
  "marketingOpportunities": ["opportunity1", "opportunity2"]
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: "json_object" }
  });

  try {
    // Clean up any markdown code blocks if present
    const content = completion.choices[0].message.content;
    const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError);
    return {
      recommendedCreators: [],
      trendInsights: completion.choices[0].message.content,
      marketingOpportunities: []
    };
  }
}

// Generate creator-to-trend insights using OpenAI
async function generateCreatorToTrendInsights(creatorData, trendsContext, specific = false, tabContext = '') {
  const isSpecificCreator = specific && creatorData.length === 1;
  const creatorCount = creatorData.length;
  const creator = isSpecificCreator ? creatorData[0] : null;

  let prompt;

  if (isSpecificCreator && creator) {
    // Highly personalized prompt for individual creator
    prompt = `
As an expert social media strategist, create a PERSONALIZED trend strategy for this specific creator. Analyze their unique profile deeply and recommend trending opportunities that match their exact brand, audience, and content style.

CREATOR PROFILE IN FOCUS:
Name: ${creator.full_name || creator.name}
Content Type: ${creator.primary_content_type || 'Not specified'}
Audience Size: ${creator.audience_size || 'Unknown'}
Engagement Rate: ${creator.engagement_rate || 'Unknown'}%
Platforms: ${[creator.instagram, creator.tiktok, creator.youtube, creator.twitter].filter(Boolean).join(', ') || 'Not specified'}
Tags/Niche: ${creator.tags ? creator.tags.join(', ') : 'Not specified'}
Notes: ${creator.notes || 'No additional notes'}
Verified: ${creator.verified ? 'Yes' : 'No'}

CURRENT TRENDING OPPORTUNITIES:
${JSON.stringify(trendsContext.slice(0, 10), null, 2)}

PROVIDE HIGHLY SPECIFIC RECOMMENDATIONS:
1. Which 3-5 trending topics are PERFECT matches for ${creator.full_name || 'this creator'}
2. Why each trend aligns with their specific content type: ${creator.primary_content_type}
3. Exact content ideas they should create (be specific to their style)
4. Which platforms to prioritize based on their audience size of ${creator.audience_size}
5. Timing strategy for maximum impact
6. Expected engagement boost for their current ${creator.engagement_rate}% rate
7. How to leverage their ${creator.verified ? 'verified status' : 'growing influence'}

Format as JSON with this structure:
{
  "creatorInsights": "Deep personalized strategy for ${creator.full_name || 'this creator'} based on their ${creator.primary_content_type} content and ${creator.audience_size} audience",
  "recommendedTrends": [
    {
      "hashtag": "#trendhashtag",
      "platform": "best platform for this creator",
      "matchScore": 0.95,
      "reasoning": "Specific reason why this trend is perfect for ${creator.full_name || 'this creator'}'s ${creator.primary_content_type} content",
      "contentIdeas": ["Very specific content idea 1", "Specific idea 2"],
      "timing": "urgent|this_week|this_month",
      "expectedReach": "High|Medium|Low",
      "engagementBoost": "Expected % increase in engagement"
    }
  ],
  "platformStrategy": {
    "primary": "Strategy for their main platform",
    "secondary": "Strategy for secondary platforms",
    "growth": "How to grow from ${creator.audience_size} audience"
  },
  "personalizedTips": ["Specific tip 1 for ${creator.primary_content_type}", "Specific tip 2"]
}
`;
  } else {
    // General prompt for multiple creators
    prompt = `
As an expert in social media trends and creator strategy, analyze these ${creatorCount} creators and suggest trending topics they should collectively leverage.

CREATORS IN ANALYSIS:
${JSON.stringify(creatorData, null, 2)}

CURRENT TRENDING TOPICS:
${JSON.stringify(trendsContext.slice(0, 15), null, 2)}

Please provide:
1. Top 5 trending topics these creators should leverage
2. Specific content ideas for each trend
3. Platform-specific strategies
4. General timing recommendations

Format as JSON with this structure:
{
  "recommendedTrends": [
    {
      "hashtag": "#trendhashtag",
      "platform": "platform",
      "matchScore": 0.90,
      "reasoning": "Why this trend matches these creators",
      "contentIdeas": ["idea1", "idea2"],
      "timing": "urgent|this_week|this_month",
      "expectedReach": "High|Medium|Low"
    }
  ],
  "creatorInsights": "Overall strategy insights for the creators",
  "platformStrategy": {
    "instagram": "strategy",
    "tiktok": "strategy",
    "youtube": "strategy"
  }
}
`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: "json_object" }
  });

  try {
    // Clean up any markdown code blocks if present
    const content = completion.choices[0].message.content;
    const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError);
    return {
      recommendedTrends: [],
      creatorInsights: completion.choices[0].message.content,
      platformStrategy: {}
    };
  }
}

// Fallback insights when OpenAI is not available
function generateFallbackInsights(type, data) {
  if (type === 'trend-to-creators') {
    return {
      recommendedCreators: [],
      trendInsights: "AI insights temporarily unavailable. Please check your OpenAI API configuration.",
      marketingOpportunities: [
        "Monitor trend engagement metrics",
        "Identify creators with relevant audience demographics",
        "Plan content calendar around trending topics"
      ]
    };
  } else {
    return {
      recommendedTrends: [],
      creatorInsights: "AI insights temporarily unavailable. Please check your OpenAI API configuration.",
      platformStrategy: {
        "general": "Focus on trending hashtags relevant to your niche"
      }
    };
  }
}

// Real-time crossover notifications via WebSocket
io.on('connection', (socket) => {
  console.log('Client connected for real-time insights');

  socket.on('subscribe-insights', (data) => {
    console.log('Client subscribed to insights:', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Periodic background job to generate fresh insights
setInterval(async () => {
  try {
    // This could trigger fresh analysis and push updates to connected clients
    io.emit('insights-updated', { timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Background insights update error:', error);
  }
}, parseInt(process.env.CROSSOVER_UPDATE_INTERVAL) || 30000);

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`🚀 Ralph Unified Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Trends Tool: ${process.env.TRENDS_URL || 'http://localhost:30003'}`);
  console.log(`👥 Creators Tool: ${process.env.CREATORS_URL || 'http://localhost:3000'}`);
});