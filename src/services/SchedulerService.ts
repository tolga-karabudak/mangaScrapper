import * as cron from 'node-cron';
import { ScrapingService } from './ScrapingService';
import { db } from '../config/database';
import { sources } from '../config/schema';
import { eq } from 'drizzle-orm';

export class SchedulerService {
  private scrapingService: ScrapingService;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private taskStates: Map<string, boolean> = new Map(); // Track task states manually
  private isSchedulerRunning: boolean = false;

  constructor(scrapingService: ScrapingService) {
    this.scrapingService = scrapingService;
  }

  /**
   * Initialize schedules - only if auto-start is enabled
   */
  async initializeSchedules(): Promise<void> {
    const autoStart = process.env.AUTO_START_SCHEDULER !== 'false';
    
    if (!autoStart) {
      console.log('⏸️ Scheduler auto-start is disabled. Use /api/scheduler/start endpoint to start manually.');
      return;
    }

    return this.startAllSchedules();
  }

  /**
   * Start all scheduled tasks
   */
  async startAllSchedules(): Promise<void> {
    if (this.isSchedulerRunning) {
      console.log('⚠️ Scheduler is already running');
      return;
    }

    const activeSources = await db.select()
      .from(sources)
      .where(eq(sources.isActive, true));

    for (const source of activeSources) {
      if (source.scanInterval) {
        this.scheduleSourceScraping(source.id, source.scanInterval);
      }
    }

    // Start all tasks after creating them
    for (const [sourceId, task] of this.scheduledTasks) {
      task.start();
      this.taskStates.set(sourceId, true);
    }

    this.isSchedulerRunning = true;
    console.log(`✅ Started scheduler with ${activeSources.length} scheduled scraping tasks`);
  }

  /**
   * Stop all scheduled tasks
   */
  stopAllSchedules(): void {
    for (const [sourceId, task] of this.scheduledTasks) {
      task.stop();
    }
    this.scheduledTasks.clear();
    this.taskStates.clear();
    this.isSchedulerRunning = false;
    console.log('🛑 All scheduled tasks stopped');
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus(): {
    isRunning: boolean;
    activeTasksCount: number;
    activeTasks: Array<{
      sourceId: string;
      isRunning: boolean;
    }>;
  } {
    const activeTasks = Array.from(this.scheduledTasks.entries()).map(([sourceId, task]) => ({
      sourceId,
      isRunning: this.taskStates.get(sourceId) || false
    }));

    return {
      isRunning: this.isSchedulerRunning,
      activeTasksCount: this.scheduledTasks.size,
      activeTasks
    };
  }

  /**
   * Schedule scraping for a specific source
   */
  scheduleSourceScraping(sourceId: string, intervalMinutes: number): void {
    // Convert minutes to cron expression
    const cronExpression = `*/${intervalMinutes} * * * *`;

    const task = cron.schedule(cronExpression, async () => {
      console.log(`⏰ Scheduled scraping started for source: ${sourceId}`);
      try {
        await this.scrapingService.startScrapingForSource(sourceId, 'recent');
      } catch (error) {
        console.error(`❌ Scheduled scraping failed for ${sourceId}:`, error);
      }
    }, {
      scheduled: false
    });

    // Store task for management
    this.scheduledTasks.set(sourceId, task);
    this.taskStates.set(sourceId, false); // Initially not running
    
    // Only start if scheduler is running
    if (this.isSchedulerRunning) {
      task.start();
      this.taskStates.set(sourceId, true);
      console.log(`📅 Scheduled scraping for source ${sourceId} every ${intervalMinutes} minutes`);
    }
  }

  /**
   * Stop schedule for specific source
   */
  stopScheduleForSource(sourceId: string): void {
    const task = this.scheduledTasks.get(sourceId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(sourceId);
      this.taskStates.delete(sourceId);
      console.log(`⏹️ Stopped schedule for source: ${sourceId}`);
    }
  }

  /**
   * Update schedule for specific source
   */
  updateScheduleForSource(sourceId: string, intervalMinutes: number): void {
    this.stopScheduleForSource(sourceId);
    this.scheduleSourceScraping(sourceId, intervalMinutes);
    
    // If scheduler is running, start the new task immediately
    if (this.isSchedulerRunning) {
      const task = this.scheduledTasks.get(sourceId);
      if (task) {
        task.start();
        this.taskStates.set(sourceId, true);
      }
    }
  }

  /**
   * Start schedule for specific source
   */
  startScheduleForSource(sourceId: string): boolean {
    const task = this.scheduledTasks.get(sourceId);
    const isRunning = this.taskStates.get(sourceId) || false;
    
    if (task && !isRunning) {
      task.start();
      this.taskStates.set(sourceId, true);
      console.log(`▶️ Started schedule for source: ${sourceId}`);
      return true;
    }
    return false;
  }

  /**
   * Pause schedule for specific source (without removing it)
   */
  pauseScheduleForSource(sourceId: string): boolean {
    const task = this.scheduledTasks.get(sourceId);
    const isRunning = this.taskStates.get(sourceId) || false;
    
    if (task && isRunning) {
      task.stop();
      this.taskStates.set(sourceId, false);
      console.log(`⏸️ Paused schedule for source: ${sourceId}`);
      return true;
    }
    return false;
  }
}