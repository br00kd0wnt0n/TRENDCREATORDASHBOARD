# 🚂 Railway Deployment Guide

Complete step-by-step guide to deploy **Ralph Loves Trends** on Railway.

## 📋 Prerequisites

- ✅ Railway account ([railway.app](https://railway.app))
- ✅ Anthropic API key for Claude AI
- ✅ GitHub repository connected

## 🚀 Deployment Steps

### 1. **Create Railway Project**
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose `br00kd0wnt0n/RalphLovesTrends`

### 2. **Add PostgreSQL Database**
1. In your Railway project, click **"New Service"**
2. Select **"Database"** → **"Add PostgreSQL"**  
3. Wait for provisioning (1-2 minutes)
4. **Note**: Railway automatically creates database connection variables

### 3. **Configure Environment Variables**

Go to your **App Service** (not the database) → **"Variables"** tab:

#### **Required Variables:**
```bash
# Database (Railway auto-generates DATABASE_URL, but you can set individual vars too)
DATABASE_URL=postgresql://postgres:password@host:port/railway

# API Keys (REQUIRED - Add your keys here)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# App Configuration
NODE_ENV=production
PORT=30003
DASHBOARD_PORT=30003
LOG_LEVEL=info

# Optional: Individual DB vars (if not using DATABASE_URL)
POSTGRES_HOST=viaduct.proxy.rlwy.net
POSTGRES_PORT=12345  
POSTGRES_DATABASE=railway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=generated_password
```

#### **How to Get Database Variables:**
1. Click on your **PostgreSQL service**
2. Go to **"Variables"** tab
3. Copy the values to your app service variables

### 4. **Deploy Application**
1. Railway will automatically deploy when you push to GitHub
2. Watch the **"Deployments"** tab for build progress
3. First deployment takes ~3-5 minutes

### 5. **Verify Deployment**
1. Check **"Deployments"** shows ✅ **Success**
2. Visit your app URL (Railway provides public URL)
3. Test health endpoint: `https://your-app.railway.app/health`

## 📊 Post-Deployment Setup

### **Database Initialization**
Railway runs the app, but you may need to initialize tables. The app will automatically:
- Create database tables on first startup
- Run migrations if needed
- Set up indexes and relationships

### **Test Functionality**
1. **Dashboard**: Visit your Railway app URL
2. **API Health**: Check `/health` and `/healthz` endpoints
3. **Manual Scraping**: Use "Scrape Now" button in dashboard
4. **AI Analysis**: Verify Anthropic API key works

## 🛠️ Troubleshooting

### **Common Issues**

#### **1. Database Connection Error**
```
SequelizeConnectionRefusedError: Connection refused
```
**Solution**: Ensure PostgreSQL service is running and environment variables are set correctly.

#### **2. Missing API Key**
```
Error: Anthropic API key not provided
```
**Solution**: Add `ANTHROPIC_API_KEY` to your app service variables.

#### **3. Port Configuration**
Railway auto-assigns ports. Ensure your app uses:
```javascript
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 30003;
```

#### **4. SSL/TLS Issues**
Railway PostgreSQL requires SSL. Our config handles this automatically:
```javascript
dialectOptions: {
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
}
```

### **Debugging Steps**
1. Check **"Logs"** tab in Railway dashboard
2. Verify all environment variables are set
3. Ensure PostgreSQL service is healthy
4. Test database connection from app logs

## 📈 Scaling & Production

### **Environment Settings**
```bash
# Production optimization
NODE_ENV=production
LOG_LEVEL=warn
HEADLESS_BROWSER=true

# Performance tuning
SCRAPE_INTERVAL_HOURS=12
MAX_CONCURRENT_PAGES=2
REQUEST_TIMEOUT_MS=45000
```

### **Database Scaling**
- Railway PostgreSQL auto-scales
- Monitor usage in Railway dashboard
- Consider connection pooling for high traffic

### **Monitoring**
- Use Railway built-in metrics
- Monitor `/health` endpoint
- Set up alerting for failures

## 🔐 Security Notes

- ✅ Environment variables are encrypted
- ✅ Database uses SSL/TLS
- ✅ API keys are secure
- ✅ No secrets in source code
- ✅ Railway provides HTTPS by default

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user:pass@host:port/db` |
| `ANTHROPIC_API_KEY` | ✅ | Claude AI API key | `sk-ant-api03-...` |
| `NODE_ENV` | ✅ | Environment mode | `production` |
| `PORT` | ✅ | App port (Railway sets this) | `30003` |
| `LOG_LEVEL` | ⚪ | Logging level | `info` |
| `HEADLESS_BROWSER` | ⚪ | Puppeteer mode | `true` |
| `SCRAPE_INTERVAL_HOURS` | ⚪ | Scraping frequency | `12` |

## 🆘 Support

If deployment fails:
1. Check Railway logs for specific errors
2. Verify all environment variables
3. Ensure PostgreSQL service is running
4. Review this guide for missed steps

**Railway successfully deployed!** 🎉

Your AI-powered trend scraping system is now live and ready to analyze digital trends with intelligent insights.