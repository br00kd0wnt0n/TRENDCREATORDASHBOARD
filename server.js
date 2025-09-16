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

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:30003', 'http://localhost:3002'],
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
    const response = await axios.get(`${TRENDS_API_URL}${req.path.replace('/api/trends', '')}`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    console.error('Trends API proxy error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trends data' });
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
    const { type, data, context } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured',
        fallback: generateFallbackInsights(type, data)
      });
    }

    const cacheKey = `${type}_${JSON.stringify(data)}_${context}`;

    // Check cache first
    if (insightsCache.has(cacheKey)) {
      const cached = insightsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }
    }

    let insights;

    if (type === 'trend-to-creators') {
      insights = await generateTrendToCreatorInsights(data, context);
    } else if (type === 'creator-to-trends') {
      insights = await generateCreatorToTrendInsights(data, context);
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
async function generateTrendToCreatorInsights(trendData, creatorsContext) {
  const prompt = `
As an expert in social media marketing and creator partnerships, analyze this trending content and suggest relevant creators for brand partnerships.

TRENDING DATA:
${JSON.stringify(trendData, null, 2)}

AVAILABLE CREATORS CONTEXT:
${JSON.stringify(creatorsContext, null, 2)}

Please provide:
1. Top 3-5 creators who would be best suited for this trend
2. Specific collaboration ideas for each creator
3. Expected engagement potential (High/Medium/Low)
4. Why each creator matches this trend
5. Suggested content formats (videos, posts, stories, etc.)

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
    max_tokens: 1500
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (parseError) {
    return {
      recommendedCreators: [],
      trendInsights: completion.choices[0].message.content,
      marketingOpportunities: []
    };
  }
}

// Generate creator-to-trend insights using OpenAI
async function generateCreatorToTrendInsights(creatorData, trendsContext) {
  const prompt = `
As an expert in social media trends and creator strategy, analyze this creator's profile and suggest trending topics they should leverage.

CREATOR DATA:
${JSON.stringify(creatorData, null, 2)}

CURRENT TRENDING TOPICS:
${JSON.stringify(trendsContext, null, 2)}

Please provide:
1. Top 5 trending topics this creator should leverage
2. Specific content ideas for each trend
3. Timing recommendations (urgent, this week, this month)
4. Platform-specific strategies
5. Potential reach and engagement predictions

Format as JSON with this structure:
{
  "recommendedTrends": [
    {
      "trendId": "uuid",
      "hashtag": "#trendhashtag",
      "platform": "platform",
      "matchScore": 0.90,
      "reasoning": "Why this trend matches the creator",
      "contentIdeas": ["idea1", "idea2"],
      "timing": "urgent|this_week|this_month",
      "expectedReach": "High|Medium|Low"
    }
  ],
  "creatorInsights": "Overall strategy insights for the creator",
  "platformStrategy": {
    "instagram": "strategy",
    "tiktok": "strategy",
    "youtube": "strategy"
  }
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1500
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (parseError) {
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