// src/routes/dashboard.ts - Fixed TypeScript errors
import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { sources, series, episodes } from '../config/schema';
import { sql, desc, eq, isNotNull } from 'drizzle-orm';
import { ImageStorageStatsService } from '../services/ImageStorageStatsService';

export async function dashboardRoutes(fastify: FastifyInstance) {
  const imageStatsService = new ImageStorageStatsService();

  // Get comprehensive dashboard statistics
  fastify.get('/stats', async () => {
    const [
      totalSeries,
      totalEpisodes,
      totalSources,
      activeSources,
      recentSeries,
      seriesWithLocalCovers,
      episodesWithLocalImages,
      totalLocalImages,
      imageStats
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(series),
      db.select({ count: sql<number>`count(*)` }).from(episodes),
      db.select({ count: sql<number>`count(*)` }).from(sources),
      db.select({ count: sql<number>`count(*)` }).from(sources).where(eq(sources.isActive, true)),
      db.select({ count: sql<number>`count(*)` })
        .from(series)
        .where(sql`created_at >= NOW() - INTERVAL '24 HOURS'`),
      db.select({ count: sql<number>`count(*)` })
        .from(series)
        .where(isNotNull(series.localCoverPath)),
      db.select({ count: sql<number>`count(*)` })
        .from(episodes)
        .where(sql`jsonb_array_length(local_images_path) > 0`),
      db.select({ total: sql<number>`sum(jsonb_array_length(local_images_path))` })
        .from(episodes)
        .where(sql`jsonb_array_length(local_images_path) > 0`),
      imageStatsService.getStorageStats().catch(() => null)
    ]);

    const queueStatus = await (fastify as any).scrapingService.getQueueStatus();

    // Calculate processing rates
    const seriesCount = totalSeries[0].count;
    const episodesCount = totalEpisodes[0].count;
    const seriesWithCovers = seriesWithLocalCovers[0].count;
    const episodesWithImages = episodesWithLocalImages[0].count;

    return {
      // Basic statistics
      totalSeries: seriesCount,
      totalEpisodes: episodesCount,
      totalSources: totalSources[0].count,
      activeSources: activeSources[0].count,
      recentSeries: recentSeries[0].count,
      
      // Queue status
      queueStatus,
      
      // Image processing statistics
      imageProcessing: {
        seriesWithLocalCovers: seriesWithCovers,
        episodesWithLocalImages: episodesWithImages,
        totalLocalImages: totalLocalImages[0]?.total || 0,
        coverProcessingRate: seriesCount > 0 ? 
          Math.round((seriesWithCovers / seriesCount) * 100) : 0,
        episodeProcessingRate: episodesCount > 0 ? 
          Math.round((episodesWithImages / episodesCount) * 100) : 0
      },
      
      // Detailed image storage stats (if available)
      imageStorage: imageStats
    };
  });

  // Get recent series with image processing status
  fastify.get('/recent-series', async (request: any) => {
    const { limit = 10 } = request.query;
    
    const recentSeries = await db.select({
      id: series.id,
      name: series.name,
      cover: series.cover,
      localCoverPath: series.localCoverPath,
      coverFileSize: series.coverFileSize,
      coverProcessedAt: series.coverProcessedAt,
      sourceId: series.sourceId,
      lastUpdated: series.lastUpdated,
      createdAt: series.createdAt
    })
      .from(series)
      .orderBy(desc(series.createdAt))
      .limit(limit);

    // Add image processing status and episode counts
    const seriesWithStats = await Promise.all(
      recentSeries.map(async (seriesItem) => {
        // Get episode count and image processing status
        const episodeStats = await db.select({
          totalEpisodes: sql<number>`count(*)`,
          episodesWithImages: sql<number>`count(*) filter (where jsonb_array_length(local_images_path) > 0)`,
          totalLocalImages: sql<number>`sum(jsonb_array_length(local_images_path))`
        })
        .from(episodes)
        .where(eq(episodes.seriesId, seriesItem.id));

        const stats = episodeStats[0];
        
        return {
          ...seriesItem,
          // Add local cover URL if available
          localCoverUrl: seriesItem.localCoverPath ? 
            `/storage/images/${seriesItem.localCoverPath}` : null,
          // Episode statistics
          episodeStats: {
            total: stats.totalEpisodes || 0,
            withLocalImages: stats.episodesWithImages || 0,
            totalLocalImages: stats.totalLocalImages || 0,
            processingRate: (stats.totalEpisodes || 0) > 0 ? 
              Math.round(((stats.episodesWithImages || 0) / (stats.totalEpisodes || 0)) * 100) : 0
          },
          // Image processing status
          imageStatus: {
            hasCover: !!seriesItem.localCoverPath,
            coverProcessed: !!seriesItem.coverProcessedAt,
            coverSize: seriesItem.coverFileSize || 0,
            episodesProcessed: stats.episodesWithImages || 0
          }
        };
      })
    );

    return seriesWithStats;
  });

  // Get image storage health status
  fastify.get('/image-storage/health', async () => {
    try {
      return await imageStatsService.getStorageHealth();
    } catch (error) {
      return {
        status: 'error',
        issues: ['Failed to check storage health'],
        recommendations: ['Check storage service configuration'],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get detailed image storage statistics
  fastify.get('/image-storage/stats', async () => {
    try {
      return await imageStatsService.getStorageStats();
    } catch (error) {
      return {
        database: {
          totalSeries: 0,
          seriesWithLocalCovers: 0,
          totalEpisodes: 0,
          episodesWithLocalImages: 0,
          coverProcessingRate: '0%',
          episodeProcessingRate: '0%'
        },
        filesystem: {
          totalFiles: 0,
          totalSizeBytes: 0,
          totalSizeMB: '0 MB',
          averageFileSizeMB: '0 MB'
        },
        recent: {
          recentlyProcessedSeries: 0,
          recentlyProcessedEpisodes: 0
        },
        error: error instanceof Error ? error.message : 'Failed to get storage stats'
      };
    }
  });

  // Get processing queue details
  fastify.get('/queue/details', async () => {
    const queueStatus = await (fastify as any).scrapingService.getQueueStatus();
    
    // Get recent completed and failed jobs (if available)
    try {
      // This would need to be implemented in ScrapingService
      // For now, return basic queue status
      return {
        ...queueStatus,
        details: {
          message: 'Detailed queue information available in Redis Commander',
          redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
        }
      };
    } catch (error) {
      return {
        ...queueStatus,
        error: 'Could not get detailed queue information'
      };
    }
  });

  // Get system logs (basic implementation)
  fastify.get('/logs', async (request: any) => {
    const { page = 1, limit = 50, type = 'all' } = request.query;
    
    // This is a basic implementation
    // In production, you might want to implement proper logging with a log table
    return {
      logs: [],
      total: 0,
      page,
      limit,
      type,
      message: 'Log system not implemented yet - check application logs'
    };
  });

  // Get source-specific statistics (FIXED VERSION)
  fastify.get('/sources/stats', async () => {
    const sourceStats = await db.select({
      sourceId: series.sourceId,
      sourceName: sources.name,
      totalSeries: sql<number>`count(${series.id})`,
      seriesWithCovers: sql<number>`count(*) filter (where ${series.localCoverPath} is not null)`,
      lastUpdated: sql<Date>`max(${series.lastUpdated})`
    })
    .from(series)
    .innerJoin(sources, eq(series.sourceId, sources.id))
    .where(isNotNull(series.sourceId)) // Add null check
    .groupBy(series.sourceId, sources.name)
    .orderBy(desc(sql<number>`count(${series.id})`));

    // Add episode statistics for each source
    const statsWithEpisodes = await Promise.all(
      sourceStats.map(async (source) => {
        if (!source.sourceId) {
          // Skip if sourceId is null
          return {
            ...source,
            episodes: {
              total: 0,
              withLocalImages: 0,
              processingRate: 0
            },
            coverProcessingRate: 0
          };
        }

        const episodeStats = await db.select({
          totalEpisodes: sql<number>`count(*)`,
          episodesWithImages: sql<number>`count(*) filter (where jsonb_array_length(local_images_path) > 0)`
        })
        .from(episodes)
        .innerJoin(series, eq(episodes.seriesId, series.id))
        .where(eq(series.sourceId, source.sourceId));

        const epStats = episodeStats[0];
        
        return {
          ...source,
          episodes: {
            total: epStats.totalEpisodes || 0,
            withLocalImages: epStats.episodesWithImages || 0,
            processingRate: (epStats.totalEpisodes || 0) > 0 ? 
              Math.round(((epStats.episodesWithImages || 0) / (epStats.totalEpisodes || 0)) * 100) : 0
          },
          coverProcessingRate: source.totalSeries > 0 ? 
            Math.round((source.seriesWithCovers / source.totalSeries) * 100) : 0
        };
      })
    );

    return statsWithEpisodes;
  });

  // Get performance metrics
  fastify.get('/performance', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      todayStats,
      weekStats,
      processingStats
    ] = await Promise.all([
      // Today's activity
      db.select({
        newSeries: sql<number>`count(*) filter (where created_at >= ${yesterday})`,
        processedCovers: sql<number>`count(*) filter (where cover_processed_at >= ${yesterday})`
      }).from(series),
      
      // Week's activity  
      db.select({
        newSeries: sql<number>`count(*) filter (where created_at >= ${weekAgo})`,
        processedCovers: sql<number>`count(*) filter (where cover_processed_at >= ${weekAgo})`
      }).from(series),
      
      // Processing performance
      db.select({
        processedEpisodes: sql<number>`count(*) filter (where images_processed_at >= ${yesterday})`,
        totalImagesProcessed: sql<number>`sum(jsonb_array_length(local_images_path)) filter (where images_processed_at >= ${yesterday})`
      }).from(episodes)
    ]);

    return {
      last24Hours: {
        newSeries: todayStats[0].newSeries || 0,
        processedCovers: todayStats[0].processedCovers || 0,
        processedEpisodes: processingStats[0].processedEpisodes || 0,
        totalImagesProcessed: processingStats[0].totalImagesProcessed || 0
      },
      last7Days: {
        newSeries: weekStats[0].newSeries || 0,
        processedCovers: weekStats[0].processedCovers || 0
      },
      timestamp: now.toISOString()
    };
  });

  // Get system health overview
  fastify.get('/health', async () => {
    try {
      const [dbHealth, queueHealth, storageHealth] = await Promise.all([
        // Database health
        db.select({ count: sql<number>`count(*)` }).from(sources).then(() => ({ status: 'healthy' })).catch(() => ({ status: 'error' })),
        
        // Queue health
        (fastify as any).scrapingService.getQueueStatus().then((status: any) => ({ 
          status: (status.failed > 10) ? 'warning' : 'healthy',
          details: status 
        })).catch(() => ({ status: 'error' })),
        
        // Storage health
        imageStatsService.getStorageHealth().catch(() => ({ status: 'error', issues: ['Storage check failed'] }))
      ]);

      const overallStatus = [dbHealth.status, queueHealth.status, storageHealth.status].includes('error') ? 'error' :
                           [dbHealth.status, queueHealth.status, storageHealth.status].includes('warning') ? 'warning' : 'healthy';

      return {
        overall: overallStatus,
        components: {
          database: dbHealth,
          queue: queueHealth,
          storage: storageHealth
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        overall: 'error',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString()
      };
    }
  });
}