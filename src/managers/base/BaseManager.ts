import { BrowserContext, Page, chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import type { ScrapingSource, MangaSeries, MangaEpisode } from '../../types';

export abstract class BaseManager {
  abstract name: string;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected source: ScrapingSource;

  constructor(source: ScrapingSource) {
    this.source = source;
  }

  async initialize(): Promise<void> {
    const browser = await chromium.launch({
      headless: true,
      args: this.source.proxyConfig ? [
        `--proxy-server=${this.source.proxyConfig.host}:${this.source.proxyConfig.port}`
      ] : []
    });

    this.context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    this.page = await this.context.newPage();

    // Proxy authentication if needed
    if (this.source.proxyConfig?.username) {
      await this.page.setExtraHTTPHeaders({
        'Proxy-Authorization': `Basic ${Buffer.from(
          `${this.source.proxyConfig.username}:${this.source.proxyConfig.password}`
        ).toString('base64')}`
      });
    }

    // Block unnecessary resources
    await this.page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await this.page.goto(this.source.domain);
    console.log(`${this.name} manager initialized for ${this.source.domain}`);
  }

  async close(): Promise<void> {
    await this.page?.close();
    await this.context?.close();
    console.log(`${this.name} manager closed`);
  }

  protected parseHTML(html: string): Document {
    const dom = new JSDOM(html);
    return dom.window.document;
  }

  protected async fetchPage(url: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.goto(url, { waitUntil: 'networkidle' });
    return await this.page.content();
  }

  protected extractEpisodeNumber(text: string): number {
    const match = text.replace(/[^0-9.,]/g, ' ').trim().replace(/^[.,]*/, '');
    const number = parseFloat(match);
    return isNaN(number) ? -1 : number;
  }

  // Abstract methods to be implemented by theme managers
  abstract getRecentSeries(page: number): Promise<MangaSeries[]>;
  abstract getFullSeries(page: number): Promise<MangaSeries[]>;
  abstract getSeriesData(url: string): Promise<MangaSeries>;
  abstract getEpisodeImages(episodeUrl: string): Promise<string[]>;
}