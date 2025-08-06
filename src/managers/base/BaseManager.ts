// src/managers/base/BaseManager.ts - Updated with image processing
import { BrowserContext, Page, chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { ImageProcessingService } from '../../services/ImageProcessingService';
import type { ScrapingSource, MangaSeries, MangaEpisode, ImageStorageResult } from '../../types';

export abstract class BaseManager {
  abstract name: string;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected source: ScrapingSource;
  protected imageProcessor: ImageProcessingService;

  constructor(source: ScrapingSource) {
    this.source = source;
    this.imageProcessor = new ImageProcessingService();
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

  /**
   * Process and store series cover image
   */
  protected async processSeriesCover(coverUrl: string, seriesId: string): Promise<{
    cdnUrl: string;
    localPath?: string;
    fileSize?: number;
  }> {
    if (!coverUrl) {
      return { cdnUrl: '' };
    }

    try {
      const result = await this.imageProcessor.processSeriesCover(coverUrl, seriesId);
      if (result && result.processed) {
        return {
          cdnUrl: coverUrl,
          localPath: result.localPath,
          fileSize: result.fileSize
        };
      }
    } catch (error) {
      console.error(`Failed to process cover for series ${seriesId}:`, error);
    }

    // Return CDN URL as fallback
    return { cdnUrl: coverUrl };
  }

  /**
   * Process and store episode images
   */
  protected async processEpisodeImages(
    imageUrls: string[], 
    seriesId: string, 
    episodeId: string
  ): Promise<{
    cdnUrls: string[];
    localPaths: string[];
    fileSizes: { [path: string]: number };
  }> {
    if (!imageUrls || imageUrls.length === 0) {
      return { cdnUrls: [], localPaths: [], fileSizes: {} };
    }

    try {
      const results = await this.imageProcessor.processEpisodeImages(imageUrls, seriesId, episodeId);
      
      const localPaths: string[] = [];
      const fileSizes: { [path: string]: number } = {};

      results.forEach((result) => {
        if (result.processed && result.localPath) {
          localPaths.push(result.localPath);
          fileSizes[result.localPath] = result.fileSize;
        }
      });

      return {
        cdnUrls: imageUrls,
        localPaths,
        fileSizes
      };
    } catch (error) {
      console.error(`Failed to process episode images for ${seriesId}/${episodeId}:`, error);
    }

    // Return CDN URLs as fallback
    return { 
      cdnUrls: imageUrls, 
      localPaths: [], 
      fileSizes: {} 
    };
  }

  // Abstract methods to be implemented by theme managers
  abstract getRecentSeries(page: number): Promise<MangaSeries[]>;
  abstract getFullSeries(page: number): Promise<MangaSeries[]>;
  abstract getSeriesData(url: string): Promise<MangaSeries>;
  abstract getEpisodeImages(episodeUrl: string): Promise<string[]>;
}