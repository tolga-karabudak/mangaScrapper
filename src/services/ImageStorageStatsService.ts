// src/services/ImageStorageStatsService.ts
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { db } from '../config/database';
import { series, episodes } from '../config/schema';
import { sql, isNotNull } from 'drizzle-orm';

export class ImageStorageStatsService {
  private storageDir: string;

  constructor() {
    this.storageDir = join(process.cwd(), 'storage', 'images');
  }

  /**
   * Get comprehensive storage statistics
   */
  async getStorageStats(): Promise<{
    database: {
      totalSeries: number;
      seriesWithLocalCovers: number;
      totalEpisodes: number;
      episodesWithLocalImages: number;
      coverProcessingRate: string;
      episodeProcessingRate: string;
    };
    filesystem: {
      totalFiles: number;
      totalSizeBytes: number;
      totalSizeMB: string;
      averageFileSizeMB: string;
    };
    recent: {
      recentlyProcessedSeries: number;
      recentlyProcessedEpisodes: number;
    };
  }> {
    const [databaseStats, filesystemStats, recentStats] = await Promise.all([
      this.getDatabaseStats(),
      this.getFilesystemStats(),
      this.getRecentStats()
    ]);

    return {
      database: databaseStats,
      filesystem: filesystemStats,
      recent: recentStats
    };
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats() {
    const [
      totalSeriesResult,
      seriesWithCoversResult,
      totalEpisodesResult,
      episodesWithImagesResult
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(series),
      db.select({ count: sql<number>`count(*)` }).from(series).where(isNotNull(series.localCoverPath)),
      db.select({ count: sql<number>`count(*)` }).from(episodes),
      db.select({ count: sql<number>`count(*)` }).from(episodes).where(sql`jsonb_array_length(local_images_path) > 0`)
    ]);

    const totalSeries = totalSeriesResult[0].count;
    const seriesWithLocalCovers = seriesWithCoversResult[0].count;
    const totalEpisodes = totalEpisodesResult[0].count;
    const episodesWithLocalImages = episodesWithImagesResult[0].count;

    return {
      totalSeries,
      seriesWithLocalCovers,
      totalEpisodes,
      episodesWithLocalImages,
      coverProcessingRate: totalSeries > 0 ? 
        `${Math.round((seriesWithLocalCovers / totalSeries) * 100)}%` : '0%',
      episodeProcessingRate: totalEpisodes > 0 ? 
        `${Math.round((episodesWithLocalImages / totalEpisodes) * 100)}%` : '0%'
    };
  }

  /**
   * Get filesystem statistics
   */
  private async getFilesystemStats() {
    try {
      const stats = await this.scanDirectory(this.storageDir);
      
      return {
        totalFiles: stats.fileCount,
        totalSizeBytes: stats.totalSize,
        totalSizeMB: `${Math.round(stats.totalSize / (1024 * 1024) * 100) / 100} MB`,
        averageFileSizeMB: stats.fileCount > 0 ? 
          `${Math.round((stats.totalSize / stats.fileCount) / (1024 * 1024) * 100) / 100} MB` : '0 MB'
      };
    } catch (error) {
      console.error('Error getting filesystem stats:', error);
      return {
        totalFiles: 0,
        totalSizeBytes: 0,
        totalSizeMB: '0 MB',
        averageFileSizeMB: '0 MB'
      };
    }
  }

  /**
   * Get recent processing statistics (last 24 hours)
   */
  private async getRecentStats() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [recentSeriesResult, recentEpisodesResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(series)
        .where(sql`cover_processed_at >= ${yesterday}`),
      db.select({ count: sql<number>`count(*)` })
        .from(episodes)
        .where(sql`images_processed_at >= ${yesterday}`)
    ]);

    return {
      recentlyProcessedSeries: recentSeriesResult[0].count,
      recentlyProcessedEpisodes: recentEpisodesResult[0].count
    };
  }

  /**
   * Recursively scan directory for file statistics
   */
  private async scanDirectory(dir: string): Promise<{ fileCount: number; totalSize: number }> {
    let fileCount = 0;
    let totalSize = 0;

    try {
      const items = await readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = join(dir, item.name);
        
        if (item.isDirectory()) {
          const subStats = await this.scanDirectory(fullPath);
          fileCount += subStats.fileCount;
          totalSize += subStats.totalSize;
        } else if (item.isFile()) {
          const stats = await stat(fullPath);
          fileCount++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
      console.warn(`Cannot scan directory ${dir}:`, error);
    }

    return { fileCount, totalSize };
  }

  /**
   * Get storage health status
   */
  async getStorageHealth(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    try {
      const stats = await this.getStorageStats();
      const totalSizeMB = stats.filesystem.totalSizeBytes / (1024 * 1024);

      // Check disk usage
      if (totalSizeMB > 1000) { // Over 1GB
        issues.push('Storage size is over 1GB');
        recommendations.push('Consider implementing automatic cleanup for old images');
      }

      // Check processing rates
      const coverRate = parseFloat(stats.database.coverProcessingRate);
      const episodeRate = parseFloat(stats.database.episodeProcessingRate);

      if (coverRate < 50) {
        issues.push('Low cover image processing rate');
        recommendations.push('Check image processing pipeline for cover images');
      }

      if (episodeRate < 30) {
        issues.push('Low episode image processing rate');
        recommendations.push('Verify episode image scraping is working correctly');
      }

      // Determine overall status
      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      if (issues.length > 0) {
        status = issues.length > 2 ? 'error' : 'warning';
      }

      return { status, issues, recommendations };
    } catch (error) {
      return {
        status: 'error',
        issues: ['Unable to assess storage health'],
        recommendations: ['Check storage directory permissions and disk space']
      };
    }
  }
}