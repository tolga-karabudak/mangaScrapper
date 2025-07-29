import * as cron from 'node-cron';
import { ScrapingService } from './ScrapingService';
import { db } from '../config/database';
import { sources } from '../config/schema';
import { eq } from 'drizzle-orm';

export class SchedulerService {
  private scrapingService: ScrapingService;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor(scrapingService: ScrapingService) {
    this.scrapingService = scrapingService;
  }

  async initializeSchedules(): Promise<void> {
    const activeSources = await db.select()
      .from(sources)
      .where(eq(sources.isActive, true));

    for (const source of activeSources) {
      if (source.scanInterval) {
        this.scheduleSourceScraping(source.id, source.scanInterval);
      }
    }

    console.log(`Initialized ${activeSources.length} scheduled scraping tasks`);
  }

  scheduleSourceScraping(sourceId: string, intervalMinutes: number): void {
    // Convert minutes to cron expression
    const cronExpression = `*/${intervalMinutes} * * * *`;

    const task = cron.schedule(cronExpression, async () => {
      console.log(`Scheduled scraping started for source: ${sourceId}`);
      await this.scrapingService.startScrapingForSource(sourceId, 'recent');
    }, {
      scheduled: false
    });

    // Store task for management
    this.scheduledTasks.set(sourceId, task);
    task.start();

    console.log(`Scheduled scraping for source ${sourceId} every ${intervalMinutes} minutes`);
  }

  stopScheduleForSource(sourceId: string): void {
    const task = this.scheduledTasks.get(sourceId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(sourceId);
      console.log(`Stopped schedule for source: ${sourceId}`);
    }
  }

  updateScheduleForSource(sourceId: string, intervalMinutes: number): void {
    this.stopScheduleForSource(sourceId);
    this.scheduleSourceScraping(sourceId, intervalMinutes);
  }

  stopAllSchedules(): void {
    for (const [sourceId, task] of this.scheduledTasks) {
      task.stop();
    }
    this.scheduledTasks.clear();
    console.log('All scheduled tasks stopped');
  }
}