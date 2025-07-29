import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { sources, series, episodes } from '../config/schema';
import { sql, desc, eq } from 'drizzle-orm';

export async function dashboardRoutes(fastify: FastifyInstance) {
  // Get dashboard statistics
  fastify.get('/stats', async () => {
    const [
      totalSeries,
      totalEpisodes,
      totalSources,
      activeSources,
      recentSeries
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(series),
      db.select({ count: sql<number>`count(*)` }).from(episodes),
      db.select({ count: sql<number>`count(*)` }).from(sources),
      db.select({ count: sql<number>`count(*)` }).from(sources).where(eq(sources.isActive, true)),
      db.select({ count: sql<number>`count(*)` })
        .from(series)
        .where(sql`created_at >= NOW() - INTERVAL '24 HOURS'`)
    ]);

    const queueStatus = await (fastify as any).scrapingService.getQueueStatus();

    return {
      totalSeries: totalSeries[0].count,
      totalEpisodes: totalEpisodes[0].count,
      totalSources: totalSources[0].count,
      activeSources: activeSources[0].count,
      recentSeries: recentSeries[0].count,
      queueStatus
    };
  });

  // Get recent series
  fastify.get('/recent-series', async (request: any) => {
    const { limit = 10 } = request.query;
    
    const recentSeries = await db.select()
      .from(series)
      .orderBy(desc(series.createdAt))
      .limit(limit);

    return recentSeries;
  });

  // Get system logs (simplified)
  fastify.get('/logs', async (request: any) => {
    const { page = 1, limit = 50 } = request.query;
    const offset = (page - 1) * limit;

    // This is a simplified implementation
    // In a real app, you'd have a proper logging table
    return {
      logs: [],
      total: 0,
      page,
      limit
    };
  });
}