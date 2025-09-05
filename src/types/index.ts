export interface TrendData {
  hashtag?: string;
  popularity?: string;
  category?: string;
  aiInsights?: string;
  platform?: string;
  region?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface TrendSource {
  name: string;
  url: string;
  scrapeMethod: 'puppeteer' | 'axios' | 'playwright';
  extractionLogic: (pageOrData: any) => Promise<TrendData[]>;
  requiresAuth?: boolean;
  rateLimit?: {
    requests: number;
    window: number;
  };
  selectors?: {
    waitFor?: string;
    trends?: string;
    hashtag?: string;
    popularity?: string;
    category?: string;
  };
}

export interface ScraperConfig {
  headless: boolean;
  userAgents: string[];
  proxies?: string[];
  viewport?: {
    width: number;
    height: number;
  };
  humanization: {
    mouseMovements: boolean;
    scrolling: boolean;
    randomDelays: boolean;
  };
}

export interface AIAnalysis {
  trendId: string;
  insights: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  predictedGrowth: 'increasing' | 'stable' | 'declining';
  businessOpportunities: string[];
  relatedTrends: string[];
  confidence: number;
}