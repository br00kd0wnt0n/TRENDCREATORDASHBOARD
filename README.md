# 🔥 Ralph Loves Trends

> **AI-Powered Trend Scraping System with Advanced Anti-Bot Technology**

An intelligent trend tracking system that combines sophisticated web scraping techniques with Claude AI analysis to deliver deep insights on emerging digital trends across multiple platforms.

## ✨ Key Features

### 🤖 **Anti-Bot Sophistication**
- **Puppeteer Stealth Mode**: Advanced browser fingerprint masking
- **Human Behavior Simulation**: Mouse movements, scrolling patterns, typing delays
- **Random User Agent Rotation**: 5+ realistic browser profiles
- **Intelligent Delays**: 5-30s randomized intervals between requests
- **Request Pattern Mimicking**: Natural browsing behavior simulation

### 🧠 **AI-Powered Insights** 
- **Claude 3.5 Sonnet Integration**: Deep trend analysis and context generation
- **Sentiment Analysis**: Positive/neutral/negative trend classification
- **Business Opportunity Detection**: AI-generated monetization strategies
- **Trend Correlation**: Cross-platform pattern recognition
- **Confidence Scoring**: 0-1 reliability metrics for each insight

### 🏗️ **Flexible Architecture**
- **Modular Source Design**: Easy addition of new platforms
- **Multiple Scraping Strategies**: Puppeteer + Axios hybrid approach
- **PostgreSQL Integration**: Scalable data persistence with full-text search
- **RESTful API**: Complete CRUD operations and analytics endpoints
- **Real-time Dashboard**: Live trend visualization and monitoring

### 🎯 **Supported Platforms**
- **TikTok Creative Center**: Hashtag trends and popularity metrics
- **Pinterest Trends**: Visual content and lifestyle insights  
- **Twitter/X**: Social media trending topics
- **Extensible Framework**: Add new sources with minimal code

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 13+
- Docker (optional but recommended)
- Anthropic API key for Claude AI analysis

### 1. Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd RalphLovesTrends
npm install

# Copy environment template
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` with your credentials:

```bash
# Database Configuration  
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=trend_tracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password_here

# Anthropic AI Configuration (Required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Application Settings
NODE_ENV=development
DASHBOARD_PORT=30003
LOG_LEVEL=info
```

### 3. Database Setup

**Option A: Docker (Recommended)**
```bash
npm run docker:up    # Start PostgreSQL container
npm run db:migrate   # Create tables and indexes
npm run db:seed      # Add sample data
```

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL locally, then:
npm run db:migrate
npm run db:seed
```

### 4. Launch Application

```bash
# Development mode (hot reload)
npm run dev

# Production mode  
npm run build
npm start

# Dashboard available at: http://localhost:30003
# Prime India Trend Spotter: http://localhost:30003/prime-india

## Prime India Extension

- Crossover scoring endpoint: `POST /api/crossover/score` — scores trends for West Coast -> India resonance.
- Creator search endpoint: `GET /api/creators/search?platform=instagram|tiktok&q=QUERY&limit=10&minFollowers=0`.
- Set `APIFY_TOKEN` (or `APIFY_API_TOKEN`) in `.env` to enable creator search via Apify.
- Optional fallback: set `SERPAPI_API_KEY` to enable SerpAPI-based web discovery of creators when Apify returns few results.
- TikTok hashtag stats endpoint (Clockworks): `POST /api/tiktok/hashtag-stats` with `{ hashtags: string[], resultsPerPage?: number }` to retrieve per-hashtag summaries (totalViews if provided by actor, sampled plays, top creators). Configure `TIKTOK_HASHTAG_STATS_ACTOR` to change actor (default `clockworks~tiktok-hashtag-scraper`).
```

## 🛠️ Usage Examples

### Command Line Operations

```bash
# One-time scraping
npm run scrape

# Start API server only
tsx src/index.ts --server

# Database operations
npm run db:migrate
npm run db:seed

# Docker management
npm run docker:up
npm run docker:down
```

### API Endpoints

```bash
# Get recent trends
GET /api/trends?platform=TikTok&limit=20

# Search trends
GET /api/trends/search?q=AI&limit=10

# Get statistics
GET /api/trends/stats

# Trigger manual scraping
POST /api/scrape

# Get top trending (24h/7d/30d)
GET /api/trending/top?timeframe=24h&platform=all
```

### Programmatic Usage

```typescript
import { TrendScraper } from './src/scrapers/TrendScraper';

const scraper = new TrendScraper();
await scraper.initialize();

// Run comprehensive scraping
const result = await scraper.scrapeAllSources();
console.log(`Found ${result.trends.length} trends`);
console.log('AI Report:', result.report);

// Schedule periodic scraping (every 12 hours)
await scraper.schedulePeriodicScraping(12);
```

## 📊 Dashboard Features

The web dashboard provides real-time trend visualization:

- **📈 Live Statistics**: Total trends, recent activity, confidence metrics
- **🎯 Platform Distribution**: Visual breakdown by data source
- **😊 Sentiment Analysis**: Positive/neutral/negative trend classification
- **🔍 Advanced Filtering**: Platform, sentiment, timeframe filtering
- **🕷️ Manual Scraping**: On-demand data collection
- **📱 Responsive Design**: Mobile-optimized interface

## 🏗️ Architecture Overview

```
src/
├── api/             # Express.js REST API server
├── config/          # Database and logging configuration  
├── database/        # Migrations and seed files
├── models/          # Sequelize database models
├── scrapers/        # Core scraping logic and source definitions
│   └── sources/     # Individual platform scrapers
├── services/        # AI enrichment and business logic
├── types/           # TypeScript type definitions
└── utils/           # Browser management and utilities

public/              # Dashboard frontend (HTML/CSS/JS)
scripts/             # Database initialization scripts  
```

### Technical Stack

- **Backend**: Node.js + TypeScript + Express.js
- **Database**: PostgreSQL + Sequelize ORM
- **Scraping**: Puppeteer + Puppeteer-Extra + Stealth Plugin
- **AI**: Anthropic Claude 3.5 Sonnet API
- **Frontend**: Vanilla HTML/CSS/JS + Chart.js
- **DevOps**: Docker Compose + Multi-stage builds

## 🔧 Advanced Configuration

### Custom Source Integration

Add new trend sources by implementing the `TrendSource` interface:

```typescript
export const CustomSource: TrendSource = {
  name: 'My Platform',
  url: 'https://platform.com/trends',
  scrapeMethod: 'puppeteer',
  extractionLogic: async (page: Page) => {
    // Custom scraping logic
    return trends;
  }
};
```

### Browser Customization

Configure stealth parameters in `BrowserManager`:

```typescript
const config = {
  headless: true,
  userAgents: [...customAgents],
  humanization: {
    mouseMovements: true,
    scrolling: true,
    randomDelays: true
  }
};
```

### AI Analysis Tuning

Modify AI prompts in `AIEnrichmentService` for domain-specific insights:

```typescript
private buildAnalysisPrompt(trends: TrendData[]): string {
  return `Expert analysis focusing on ${domain} trends...`;
}
```

## 🚦 Rate Limiting & Ethics

This system implements responsible scraping practices:

- **Respect robots.txt**: Honor platform policies
- **Intelligent Rate Limiting**: 5-30 second delays between requests
- **Request Volume Control**: Max 10-20 requests per hour per platform  
- **Server Load Consideration**: Distributed timing patterns
- **User-Agent Rotation**: Prevents IP-based blocking
- **Data Aggregation Value**: Provides analytical insights, not raw duplication

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check PostgreSQL status
npm run docker:up
# Or verify local PostgreSQL is running
```

**Scraping Returns Empty Results**  
```bash
# Platform selectors may have changed
# Update selectors in src/scrapers/sources/
# Enable debug logging: LOG_LEVEL=debug
```

**AI Analysis Failing**
```bash  
# Verify Anthropic API key is valid
# Check API rate limits and billing
```

**Dashboard Not Loading**
```bash
# Ensure API server is running on correct port
# Check browser console for JavaScript errors
```

### Performance Optimization

```bash
# Increase scraping parallelism
MAX_CONCURRENT_PAGES=5

# Optimize database queries  
# Add custom indexes for frequent queries

# Reduce AI analysis frequency
# Cache results for similar trends
```

## 📈 Monitoring & Analytics

### Production Deployment

```bash
# Build optimized container
docker build -t ralph-trends .

# Deploy with environment variables  
docker run -d -p 30003:30003 --env-file .env ralph-trends
```

### Health Monitoring

The system provides built-in monitoring:
- `/health` endpoint for service status
- Database connection health checks  
- Scraping success/failure metrics
- AI API response time tracking

### Data Export

```bash
# Export trends to JSON
curl "http://localhost:30003/api/trends?limit=1000" > trends.json

# Database backup
pg_dump trend_tracker > backup.sql
```

## 🤝 Contributing

We welcome contributions! Please see our contribution guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)  
5. **Open** a Pull Request

### Development Setup

```bash
# Install development dependencies
npm install

# Run tests  
npm test

# Lint code
npm run lint

# Type checking
npm run typecheck
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic**: Claude AI API for intelligent trend analysis
- **Puppeteer Team**: Browser automation framework
- **PostgreSQL**: Robust database foundation
- **Express.js**: Web application framework
- **Chart.js**: Dashboard visualization library

## 🚂 Railway Deployment

For Railway cloud deployment, see the comprehensive [Railway Deployment Guide](RAILWAY_DEPLOYMENT.md) which includes:

- PostgreSQL database setup
- Environment variable configuration  
- SSL/TLS configuration for production
- Troubleshooting common deployment issues
- Performance optimization settings

### Quick Railway Setup

1. **Create Railway Project**: Connect your GitHub repo
2. **Add PostgreSQL**: Add PostgreSQL service to your project
3. **Configure Variables**: Set `ANTHROPIC_API_KEY`, `DATABASE_URL`, `NODE_ENV=production`
4. **Deploy**: Railway auto-deploys on git push

---

**🔥 Ralph Loves Trends** - *Where AI meets trend intelligence*

[![GitHub](https://img.shields.io/github/stars/br00kd0wnt0n/RalphLovesTrends?style=social)](https://github.com/br00kd0wnt0n/RalphLovesTrends)
