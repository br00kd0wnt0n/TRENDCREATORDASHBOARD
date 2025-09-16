# Ralph Unified Dashboard 🚀

A unified container application that combines **RalphLovesTrends** (trend analysis) and **RalphODex** (creator database) with AI-powered crossover insights using OpenAI GPT-4.

🌐 **Live Demo**: [https://trendcreatordashboard.up.railway.app](https://trendcreatordashboard.up.railway.app)

## ✨ Key Features

### 🖼️ **Iframe Integration**
- **Clean Container**: Preserves both existing codebases completely intact
- **Tabbed Interface**: Switch seamlessly between Trends and Creators tools
- **Real-time Communication**: Socket.io for live updates and insights

### 🤖 **AI-Powered Crossover**
- **Trend → Creator Suggestions**: AI analyzes trending topics and suggests relevant creators for partnerships
- **Creator → Trend Opportunities**: AI recommends trending topics that creators should leverage
- **Smart Matching**: OpenAI GPT-4 provides intelligent scoring and reasoning
- **Fallback Mode**: Works with or without OpenAI API configuration

### 📊 **Intelligent Insights**
- **Real-time Analysis**: Background jobs generate fresh crossover insights
- **Contextual Recommendations**: AI considers audience demographics, engagement patterns, and content fit
- **Marketing Opportunities**: Specific collaboration ideas and campaign suggestions
- **Platform-specific Strategies**: Tailored recommendations for Instagram, TikTok, YouTube

## 🏗️ Architecture

```
ralph-unified-dashboard/
├── server.js                 # Express server with OpenAI integration
├── public/
│   └── index.html            # Frontend with iframe containers
├── package.json
├── .env.example             # Environment configuration
└── README.md
```

## 🚦 Prerequisites

### Required Services
1. **RalphLovesTrends** running on port 30003
2. **RalphODex** running on ports 3000 (frontend) and 3001 (backend)
3. **OpenAI API Key** (optional - fallback mode available)

### System Requirements
- Node.js 18+
- Both existing tools must be running and accessible

## 🔧 Installation

### 1. Clone and Setup
```bash
cd /Users/BD/ralph-unified-dashboard
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
PORT=3002
NODE_ENV=development

# OpenAI Configuration (required for AI insights)
OPENAI_API_KEY=your_openai_api_key_here

# Existing Tool URLs
TRENDS_URL=http://localhost:30003
CREATORS_URL=http://localhost:3000

# Existing Tool APIs
TRENDS_API_URL=http://localhost:30003/api
CREATORS_API_URL=http://localhost:3001/api

# Crossover Configuration
CROSSOVER_UPDATE_INTERVAL=30000
AI_INSIGHTS_CACHE_TTL=300000
```

### 3. Start the Unified Dashboard
```bash
npm start
# or for development
npm run dev
```

## 🚀 Usage

### Starting All Services
1. **Start RalphLovesTrends**: `cd /Users/BD/RalphLovesTrends && npm run dev`
2. **Start RalphODex Backend**: `cd /Users/BD/RalphODex/backend && npm run dev`
3. **Start RalphODex Frontend**: `cd /Users/BD/RalphODex && npm start`
4. **Start Unified Dashboard**: `cd /Users/BD/ralph-unified-dashboard && npm start`

### Access Points
- **Unified Dashboard**: http://localhost:3002
- **Trends Tool**: http://localhost:30003 (embedded)
- **Creators Tool**: http://localhost:3000 (embedded)

### Using AI Crossover Features

#### 1. **Trend Analysis Tab**
- View trending hashtags and topics
- Click the AI crossover button (🪄) to see:
  - Recommended creators for current trends
  - Match scores and reasoning
  - Specific collaboration ideas
  - Expected engagement potential

#### 2. **Creator Rolodex Tab**
- Browse creator profiles
- AI crossover provides:
  - Trending topics the creator should leverage
  - Platform-specific content strategies
  - Timing recommendations (urgent/this week/this month)
  - Expected reach predictions

## 🤖 AI Integration Details

### OpenAI GPT-4 Prompts
The system uses sophisticated prompts to analyze:

**For Trend → Creator Matching:**
- Trending content analysis
- Creator audience demographics
- Content type alignment
- Engagement potential prediction

**For Creator → Trend Suggestions:**
- Creator profile analysis
- Current trending topics
- Platform-specific strategies
- Timing optimization

### Caching Strategy
- **5-minute cache** for AI responses
- **Background refresh** every 30 seconds
- **Fallback insights** when OpenAI unavailable

## 📡 API Endpoints

### Crossover Insights
```bash
POST /api/crossover/insights
Content-Type: application/json

{
  "type": "trend-to-creators" | "creator-to-trends",
  "data": { /* trend or creator data */ },
  "context": { /* additional context data */ }
}
```

### Proxy Endpoints
- `GET /api/trends/*` - Proxies to RalphLovesTrends API
- `GET /api/creators/*` - Proxies to RalphODex API

### WebSocket Events
- `insights-updated` - Fresh AI insights available
- `subscribe-insights` - Client subscription to updates

## 🎨 UI Features

### Visual Design
- **Ralph Brand Colors**: #EB008B (pink), #31BDBF (teal), #F16524 (orange)
- **Material Design**: Consistent with RalphODex styling
- **Responsive Layout**: Mobile-friendly iframe containers

### Interactive Elements
- **Tab Navigation**: Switch between tools
- **Sliding Panel**: AI insights sidebar
- **Real-time Status**: Connection indicators for both tools
- **Live Counters**: Trend and creator counts

## 🔍 Monitoring

### Connection Status
The dashboard monitors:
- **Trends API**: Health checks every 10 seconds
- **Creators API**: Authentication-aware health checks
- **WebSocket**: Real-time connection status

### Performance Indicators
- **AI Response Time**: Cached vs fresh insights
- **Tool Load Status**: Iframe loading indicators
- **Update Frequency**: Background job performance

## 🛠️ Troubleshooting

### Common Issues

**AI Insights Not Working**
```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Check logs for API errors
npm run dev
```

**Tool Not Loading**
```bash
# Verify both tools are running
curl http://localhost:30003/health  # Trends
curl http://localhost:3001/api/creators  # Creators
```

**CORS Issues**
```bash
# Check iframe src URLs in browser console
# Verify CORS configuration in both tools
```

### Debug Mode
```bash
NODE_ENV=development npm run dev
```

## 🚀 Deployment

### Railway Production Setup

The dashboard is deployed at: **https://trendcreatordashboard.up.railway.app**

#### Required Environment Variables in Railway:

```env
# OpenAI API (REQUIRED for AI features)
OPENAI_API_KEY=sk-your-actual-openai-api-key

# Your Deployed Tool URLs
TRENDS_URL=https://ralphretronet-production.up.railway.app
CREATORS_URL=https://ralphodex.up.railway.app

# API Endpoints
TRENDS_API_URL=https://ralphretronet-production.up.railway.app/api
CREATORS_API_URL=https://backend-production-a0a1.up.railway.app/api
```

#### Deployment Steps:
1. Connect GitHub repo to Railway
2. Add environment variables in Railway dashboard
3. Deploy automatically on push
4. Access at your Railway URL

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3002
CMD ["npm", "start"]
```

## 🔮 Future Enhancements

- [ ] **Creator Performance Tracking**: Integration with social media APIs
- [ ] **Trend Prediction**: ML models for trend forecasting
- [ ] **Campaign Management**: Track collaboration outcomes
- [ ] **Advanced Analytics**: Cross-tool performance metrics
- [ ] **Notification System**: Email/Slack alerts for hot opportunities

## 🤝 Contributing

This unified dashboard is designed to:
1. **Preserve existing codebases** completely
2. **Add value through AI integration** without disruption
3. **Scale easily** as both tools evolve

## 📄 License

MIT License - Integrates with existing Ralph tools while maintaining separation of concerns.

---

**🔥 Ralph Unified Dashboard** - *Where Trends Meet Creators Through AI Intelligence*