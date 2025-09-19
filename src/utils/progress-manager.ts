/**
 * Progress Manager - Singleton to handle scraping progress updates
 * Avoids circular dependency issues between TrendScraper and server
 */

interface SourceProgress {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  trends: number;
  error?: string;
  startTime?: Date;
  completedTime?: Date;
  details?: string;
}

interface ScrapingStatus {
  isRunning: boolean;
  currentSource: string | null;
  progress: number;
  totalSources: number;
  completedSources: number;
  trends: any[];
  errors: string[];
  startTime: Date | null;
  lastUpdate: Date | null;
  sources: SourceProgress[];
}

class ProgressManager {
  private static instance: ProgressManager;
  private status: ScrapingStatus;

  private constructor() {
    this.status = {
      isRunning: false,
      currentSource: null,
      progress: 0,
      totalSources: 0,
      completedSources: 0,
      trends: [],
      errors: [],
      startTime: null,
      lastUpdate: null,
      sources: []
    };
  }

  static getInstance(): ProgressManager {
    if (!ProgressManager.instance) {
      ProgressManager.instance = new ProgressManager();
    }
    return ProgressManager.instance;
  }

  initializeScraping(sourceNames?: string[]): void {
    // If no source names provided, use default sources
    const defaultSources = [
      'Apify TikTok Hashtag Trends',
      'Apify Instagram Hashtag Stats',
      'Trends24 (X/Twitter US)'
    ];

    const sourcesToInitialize = sourceNames || defaultSources;

    this.status = {
      isRunning: true,
      currentSource: null,
      progress: 0,
      totalSources: sourcesToInitialize.length,
      completedSources: 0,
      trends: [],
      errors: [],
      startTime: new Date(),
      lastUpdate: new Date(),
      sources: sourcesToInitialize.map(name => ({
        name,
        status: 'pending' as const,
        progress: 0,
        trends: 0,
        details: 'Waiting to start...'
      }))
    };
    console.log('📊 PROGRESS: Scraping initialized with', this.status.sources.length, 'sources:', sourcesToInitialize);
  }

  updateSourceProgress(sourceName: string, status: 'running' | 'completed' | 'failed', progress: number, trends: number, details?: string, error?: string): void {
    const sourceIndex = this.status.sources.findIndex(s => s.name.includes(sourceName.split(' ')[0]));
    
    if (sourceIndex !== -1) {
      this.status.sources[sourceIndex] = {
        ...this.status.sources[sourceIndex],
        status,
        progress,
        trends,
        details,
        error,
        ...(status === 'running' ? { startTime: new Date() } : {}),
        ...(status === 'completed' || status === 'failed' ? { completedTime: new Date() } : {})
      };
      
      this.status.currentSource = status === 'running' ? sourceName : null;
      this.status.completedSources = this.status.sources.filter(s => s.status === 'completed' || s.status === 'failed').length;
      this.status.progress = (this.status.completedSources / this.status.totalSources) * 100;
      this.status.lastUpdate = new Date();
      
      console.log(`📊 PROGRESS: ${sourceName} - ${status} (${progress}%) - ${trends} trends - ${details || ''}`);
    } else {
      console.warn(`📊 PROGRESS: Source not found: ${sourceName}`);
    }
  }

  completeScraping(trends: any[]): void {
    this.status.isRunning = false;
    this.status.progress = 100;
    this.status.trends = trends;
    this.status.lastUpdate = new Date();
    console.log('📊 PROGRESS: Scraping completed with', trends.length, 'total trends');
  }

  addError(error: string): void {
    this.status.errors.push(error);
    this.status.lastUpdate = new Date();
  }

  getStatus(): ScrapingStatus {
    return { ...this.status }; // Return a copy to prevent external mutation
  }

  reset(): void {
    this.status = {
      isRunning: false,
      currentSource: null,
      progress: 0,
      totalSources: 0,
      completedSources: 0,
      trends: [],
      errors: [],
      startTime: null,
      lastUpdate: null,
      sources: []
    };
  }
}

export const progressManager = ProgressManager.getInstance();
export type { SourceProgress, ScrapingStatus };