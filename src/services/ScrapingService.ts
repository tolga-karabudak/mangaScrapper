// src/services/ScrapingService.ts - Updated with local storage integration
import { Queue, Worker, Job } from 'bullmq';
import { db } from '../config/database';
import { sources, series, episodes } from '../config/schema';
import { ThemesiaManager } from '../managers/ThemesiaManager';
import { MadaraManager } from '../managers/MadaraManager';
import { UzayManager } from '../managers/UzayManager';
import { BaseManager } from '../managers/base/BaseManager';
import { ImageProcessingService } from './ImageProcessingService';
import type { ScrapingSource, MangaSeries } from '../types';
import { eq } from 'drizzle-orm';

interface ScrapingJobData {
  sourceId: string;
  type: 'recent' | 'full' | 'series' | 'episode';
  page?: number;
  seriesUrl?: string;
  episodeUrl?: string;
}

export class ScrapingService {
  private scrapingQueue: Queue;
  private imageProcessingService: ImageProcessingService;

  constructor() {
    this.scrapingQueue = new Queue('manga-scraping', {
      connection: {
        host: 'localhost',
        port: 6379,
      }
    });

    this.imageProcessingService = new ImageProcessingService();
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const worker = new Worker('manga-scraping', async (job: Job<ScrapingJobData>) => {
      try {
        await this.processScrapingJob(job.data);
      } catch (error) {
        console.error('Scraping job failed:', error);
        throw error;
      }
    }, {
      connection: {
        host: 'localhost',
        port: 6379,
      },
      concurrency: 3, // Process 3 jobs concurrently
    });

    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err);
    });
  }

  async addScrapingJob(data: ScrapingJobData, priority: number = 0): Promise<void> {
    await this.scrapingQueue.add('scrape', data, {
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    });
  }

  private async processScrapingJob(data: ScrapingJobData): Promise<void> {
    const source = await this.getSource(data.sourceId);
    if (!source || !source.isActive) {
      throw new Error(`Source ${data.sourceId} not found or inactive`);
    }

    const manager = this.createManager(source);
    await manager.initialize();

    try {
      switch (data.type) {
        case 'recent':
          await this.scrapeRecentSeries(manager, data.page || 1);
          break;
        case 'full':
          await this.scrapeFullSeries(manager, data.page || 1);
          break;
        case 'series':
          if (data.seriesUrl) {
            await this.scrapeSingleSeries(manager, data.seriesUrl);
          }
          break;
        case 'episode':
          if (data.episodeUrl) {
            await this.scrapeEpisodeImages(manager, data.episodeUrl);
          }
          break;
      }
    } finally {
      await manager.close();
    }
  }

  private createManager(source: ScrapingSource): BaseManager {
    switch (source.theme) {
      case 'themesia':
        return new ThemesiaManager(source);
      case 'madara':
        return new MadaraManager(source);
      case 'uzay':
        return new UzayManager(source);
      default:
        throw new Error(`Unknown theme: ${source.theme}`);
    }
  }

  private async scrapeRecentSeries(manager: BaseManager, page: number): Promise<void> {
    console.log(`📚 Scraping recent series from ${manager.name}, page ${page}`);
    const seriesList = await manager.getRecentSeries(page);
    await this.saveSeriesToDatabase(seriesList);
  }

  private async scrapeFullSeries(manager: BaseManager, page: number): Promise<void> {
    console.log(`📚 Scraping full series from ${manager.name}, page ${page}`);
    const seriesList = await manager.getFullSeries(page);
    await this.saveSeriesToDatabase(seriesList);
  }

  private async scrapeSingleSeries(manager: BaseManager, url: string): Promise<void> {
    console.log(`📖 Scraping single series: ${url}`);
    const seriesData = await manager.getSeriesData(url);
    await this.saveSeriesToDatabase([seriesData]);
  }

  private async scrapeEpisodeImages(manager: BaseManager, episodeUrl: string): Promise<void> {
    console.log(`🖼️ Scraping episode images: ${episodeUrl}`);
    const images = await manager.getEpisodeImages(episodeUrl);
    
    // Process images with local storage
    console.log(`Found ${images.length} images to process`);
  }

  private async saveSeriesToDatabase(seriesList: MangaSeries[]): Promise<void> {
    for (const seriesData of seriesList) {
      try {
        // Check if series exists
        const existingSeries = await db.select()
          .from(series)
          .where(eq(series.id, seriesData.id))
          .limit(1);

        if (existingSeries.length === 0) {
          // Insert new series with local storage data
          await db.insert(series).values({
            id: seriesData.id,
            name: seriesData.name,
            description: seriesData.description,
            cover: seriesData.cover,
            localCoverPath: seriesData.localCoverPath,
            coverFileSize: seriesData.coverFileSize,
            coverProcessedAt: seriesData.coverProcessedAt,
            url: seriesData.url,
            sourceId: seriesData.sourceId,
            lastUpdated: seriesData.lastUpdated
          });

          console.log(`✅ New series saved: ${seriesData.name} (local cover: ${seriesData.localCoverPath ? 'yes' : 'no'})`);
        } else {
          // Update existing series with local storage data
          await db.update(series)
            .set({
              name: seriesData.name,
              description: seriesData.description,
              cover: seriesData.cover,
              localCoverPath: seriesData.localCoverPath,
              coverFileSize: seriesData.coverFileSize,
              coverProcessedAt: seriesData.coverProcessedAt,
              lastUpdated: seriesData.lastUpdated
            })
            .where(eq(series.id, seriesData.id));

          console.log(`🔄 Series updated: ${seriesData.name}`);
        }

        // Save episodes with local storage data
        await this.saveEpisodesToDatabase(seriesData.episodes);

      } catch (error) {
        console.error(`❌ Error saving series ${seriesData.name}:`, error);
      }
    }
  }

  private async saveEpisodesToDatabase(episodesList: MangaSeries['episodes']): Promise<void> {
    for (const episodeData of episodesList) {
      try {
        const existingEpisode = await db.select()
          .from(episodes)
          .where(eq(episodes.id, episodeData.id))
          .limit(1);

        if (existingEpisode.length === 0) {
          await db.insert(episodes).values({
            id: episodeData.id,
            seriesId: episodeData.seriesId,
            name: episodeData.name,
            number: episodeData.number,
            url: episodeData.url,
            images: episodeData.images,
            localImagesPath: episodeData.localImagesPath || [],
            imagesFileSizes: episodeData.imagesFileSizes || {},
            imagesProcessedAt: episodeData.imagesProcessedAt,
            publishedAt: episodeData.publishedAt
          });

          console.log(`✅ New episode saved: ${episodeData.name} (${episodeData.images.length} CDN images, ${episodeData.localImagesPath?.length || 0} local images)`);
        } else {
          // Update existing episode with new local storage data
          await db.update(episodes)
            .set({
              name: episodeData.name,
              images: episodeData.images,
              localImagesPath: episodeData.localImagesPath || [],
              imagesFileSizes: episodeData.imagesFileSizes || {},
              imagesProcessedAt: episodeData.imagesProcessedAt
            })
            .where(eq(episodes.id, episodeData.id));

          console.log(`🔄 Episode updated: ${episodeData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error saving episode ${episodeData.name}:`, error);
      }
    }
  }

  private async getSource(sourceId: string): Promise<ScrapingSource | null> {
    const result = await db.select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);

    if (result.length === 0) return null;

    const source = result[0];
    
    // Type assertion to ensure theme is properly typed
    return {
      id: source.id,
      name: source.name,
      domain: source.domain,
      theme: source.theme as 'themesia' | 'madara' | 'uzay',
      isActive: source.isActive ?? false,
      scanInterval: source.scanInterval ?? 60,
      proxyConfig: source.proxyConfig as ScrapingSource['proxyConfig'],
      categoryFilters: source.categoryFilters as ScrapingSource['categoryFilters']
    };
  }

  // Public methods for manual operations
  async startScrapingForSource(sourceId: string, type: 'recent' | 'full' = 'recent'): Promise<void> {
    await this.addScrapingJob({ sourceId, type, page: 1 }, 10);
  }

  async scrapeMultiplePages(sourceId: string, startPage: number, endPage: number): Promise<void> {
    for (let page = startPage; page <= endPage; page++) {
      await this.addScrapingJob({ 
        sourceId, 
        type: 'full', 
        page 
      }, 5);
    }
  }

  async getQueueStatus(): Promise<any> {
    const waiting = await this.scrapingQueue.getWaiting();
    const active = await this.scrapingQueue.getActive();
    const completed = await this.scrapingQueue.getCompleted();
    const failed = await this.scrapingQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }
}