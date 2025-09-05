import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { ScraperConfig } from '../types';
import { logger } from '../config/database';

puppeteer.use(StealthPlugin());

export class BrowserManager {
  private config: ScraperConfig;
  private browser: Browser | null = null;
  private userAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
  ];

  constructor(config?: Partial<ScraperConfig>) {
    this.config = {
      headless: config?.headless ?? (process.env.HEADLESS_BROWSER === 'true'),
      userAgents: config?.userAgents || this.userAgents,
      viewport: config?.viewport || { width: 1920, height: 1080 },
      humanization: {
        mouseMovements: true,
        scrolling: true,
        randomDelays: true,
        ...config?.humanization
      }
    };
  }

  async launch(): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=site-per-process',
        `--window-size=${this.config.viewport?.width},${this.config.viewport?.height}`
      ],
      defaultViewport: this.config.viewport
    });

    logger.info('Browser launched with stealth mode enabled');
    return this.browser;
  }

  async createStealthPage(): Promise<Page> {
    if (!this.browser) await this.launch();
    
    const page = await this.browser!.newPage();
    
    const userAgent = this.getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'denied' } as PermissionStatus) :
          originalQuery(parameters)
      );
    });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    if (this.config.humanization.mouseMovements) {
      await this.simulateMouseMovement(page);
    }

    return page;
  }

  private async simulateMouseMovement(page: Page): Promise<void> {
    const mouse = page.mouse;
    await mouse.move(
      Math.random() * 500 + 100,
      Math.random() * 400 + 100
    );
  }

  async humanScroll(page: Page): Promise<void> {
    if (!this.config.humanization.scrolling) return;

    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = Math.floor(Math.random() * 100) + 50;
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, Math.floor(Math.random() * 200) + 100);
      });
    });
  }

  getRandomDelay(min = 5000, max = 15000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  getRandomUserAgent(): string {
    return this.config.userAgents[
      Math.floor(Math.random() * this.config.userAgents.length)
    ];
  }

  async randomWait(page: Page, min = 2000, max = 5000): Promise<void> {
    if (!this.config.humanization.randomDelays) return;
    
    const delay = this.getRandomDelay(min, max);
    await page.waitForTimeout(delay);
    logger.debug(`Random wait: ${delay}ms`);
  }

  async typeHuman(page: Page, selector: string, text: string): Promise<void> {
    await page.focus(selector);
    for (const char of text) {
      await page.type(selector, char);
      await page.waitForTimeout(Math.random() * 200 + 50);
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }
}