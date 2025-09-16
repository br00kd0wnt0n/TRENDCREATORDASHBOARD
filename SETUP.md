# 🚀 Quick Setup Guide

## Prerequisites

Before running the unified dashboard, make sure you have these tools running:

### 1. RalphLovesTrends (Trends Analysis)
```bash
cd /Users/BD/RalphLovesTrends
npm run dev
# Should be running on http://localhost:30003
```

### 2. RalphODex (Creator Database)
```bash
# Backend
cd /Users/BD/RalphODex/backend
npm run dev
# Should be running on http://localhost:3001

# Frontend (in a new terminal)
cd /Users/BD/RalphODex
npm start
# Should be running on http://localhost:3000
```

## Installation

### 1. Clone and Install
```bash
git clone https://github.com/br00kd0wnt0n/TRENDCREATORDASHBOARD.git
cd TRENDCREATORDASHBOARD
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```env
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

### 3. Start the Dashboard
```bash
npm start
```

Visit: **http://localhost:3002**

## ✨ Features

- **🖼️ Unified Interface**: Both tools in tabbed iframes
- **🤖 AI Crossover**: GPT-4 powered insights connecting trends and creators
- **📊 Real-time Updates**: Live connection monitoring and insights
- **🎨 Ralph Branding**: Consistent design with both tools

## 🔧 Troubleshooting

### Tools Not Loading
- Ensure RalphLovesTrends is running on port 30003
- Ensure RalphODex frontend is running on port 3000
- Ensure RalphODex backend is running on port 3001

### AI Insights Not Working
- Check your OpenAI API key in `.env`
- The dashboard works without AI (shows fallback insights)

### CORS Issues
- All tools must be running locally for iframe embedding
- Check browser console for specific errors

## 🌟 Usage

1. **Switch Tabs**: Click between "Trend Analysis" and "Creator Rolodex"
2. **AI Magic**: Click the 🪄 button to see crossover insights
3. **Real-time**: Watch connection status indicators in the header