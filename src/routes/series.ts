import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { series, episodes } from '../config/schema';
import { eq, desc, like, sql } from 'drizzle-orm';

export async function seriesRoutes(fastify: FastifyInstance) {
  // Get all series with pagination and search
  fastify.get('/', async (request: any) => {
    const { page = 1, limit = 20, search = '' } = request.query;
    const offset = (page - 1) * limit;

    // Build base query
    const baseQuery = db.select().from(series);
    
    // Apply search filter
    const filteredQuery = search 
      ? baseQuery.where(like(series.name, `%${search}%`))
      : baseQuery;

    // Execute query with pagination
    const result = await filteredQuery
      .orderBy(desc(series.lastUpdated))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(series);
    const total = search 
      ? await totalQuery.where(like(series.name, `%${search}%`))
      : await totalQuery;

    return {
      series: result,
      total: total[0].count,
      page,
      limit
    };
  });

  // Get single series with episodes
  fastify.get('/:id', async (request: any) => {
    const { id } = request.params;

    const seriesData = await db.select()
      .from(series)
      .where(eq(series.id, id))
      .limit(1);

    if (seriesData.length === 0) {
      throw new Error('Series not found');
    }

    const episodesData = await db.select()
      .from(episodes)
      .where(eq(episodes.seriesId, id))
      .orderBy(desc(episodes.number));

    return {
      ...seriesData[0],
      episodes: episodesData
    };
  });

  // Delete series
  fastify.delete('/:id', async (request: any) => {
    const { id } = request.params;

    // Delete episodes first (foreign key constraint)
    await db.delete(episodes).where(eq(episodes.seriesId, id));
    
    // Delete series
    await db.delete(series).where(eq(series.id, id));

    return { success: true, message: 'Series deleted successfully' };
  });
}