// src/routes/series.ts - Complete series routes with local image support
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

    // Transform data to include local image information
    const seriesWithLocalImages = result.map(seriesItem => ({
      ...seriesItem,
      // Add local image URL if exists
      localCoverUrl: seriesItem.localCoverPath ? 
        `/storage/images/${seriesItem.localCoverPath}` : null,
      // Provide both CDN and local options for cover
      coverOptions: {
        cdn: seriesItem.cover,
        local: seriesItem.localCoverPath ? `/storage/images/${seriesItem.localCoverPath}` : null,
        hasLocal: !!seriesItem.localCoverPath,
        fileSize: seriesItem.coverFileSize,
        processedAt: seriesItem.coverProcessedAt
      }
    }));

    return {
      series: seriesWithLocalImages,
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

    // Transform data to include local image information
    const seriesWithLocalImages = {
      ...seriesData[0],
      // Add local image URL if exists
      localCoverUrl: seriesData[0].localCoverPath ? 
        `/storage/images/${seriesData[0].localCoverPath}` : null,
      // Provide both CDN and local options for cover
      coverOptions: {
        cdn: seriesData[0].cover,
        local: seriesData[0].localCoverPath ? `/storage/images/${seriesData[0].localCoverPath}` : null,
        hasLocal: !!seriesData[0].localCoverPath,
        fileSize: seriesData[0].coverFileSize,
        processedAt: seriesData[0].coverProcessedAt
      },
      episodes: episodesData.map(episode => ({
        ...episode,
        // Add local image URLs for episodes
        localImageUrls: Array.isArray(episode.localImagesPath) ? 
          episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
        // Provide both CDN and local options
        imageOptions: {
          cdn: episode.images || [],
          local: Array.isArray(episode.localImagesPath) ? 
            episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
          hasLocal: Array.isArray(episode.localImagesPath) && episode.localImagesPath.length > 0,
          fileSizes: episode.imagesFileSizes || {},
          processedAt: episode.imagesProcessedAt,
          totalImages: Array.isArray(episode.images) ? episode.images.length : 0,
          totalLocalImages: Array.isArray(episode.localImagesPath) ? episode.localImagesPath.length : 0
        }
      }))
    };

    return seriesWithLocalImages;
  });

  // Get episode details with images
  fastify.get('/:seriesId/episodes/:episodeId', async (request: any) => {
    const { seriesId, episodeId } = request.params;

    const episodeData = await db.select()
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);

    if (episodeData.length === 0) {
      throw new Error('Episode not found');
    }

    const episode = episodeData[0];

    // Verify episode belongs to series
    if (episode.seriesId !== seriesId) {
      throw new Error('Episode does not belong to this series');
    }

    // Transform episode data to include local image information
    const episodeWithLocalImages = {
      ...episode,
      // Add local image URLs
      localImageUrls: Array.isArray(episode.localImagesPath) ? 
        episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
      // Provide comprehensive image options
      imageOptions: {
        cdn: episode.images || [],
        local: Array.isArray(episode.localImagesPath) ? 
          episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
        hasLocal: Array.isArray(episode.localImagesPath) && episode.localImagesPath.length > 0,
        fileSizes: episode.imagesFileSizes || {},
        processedAt: episode.imagesProcessedAt,
        totalImages: Array.isArray(episode.images) ? episode.images.length : 0,
        totalLocalImages: Array.isArray(episode.localImagesPath) ? episode.localImagesPath.length : 0,
        // Image serving preferences
        preferredSource: Array.isArray(episode.localImagesPath) && episode.localImagesPath.length > 0 ? 'local' : 'cdn'
      }
    };

    return episodeWithLocalImages;
  });

  // Get series statistics (episodes count, image stats, etc.)
  fastify.get('/:id/stats', async (request: any) => {
    const { id } = request.params;

    // Verify series exists
    const seriesExists = await db.select({ id: series.id })
      .from(series)
      .where(eq(series.id, id))
      .limit(1);

    if (seriesExists.length === 0) {
      throw new Error('Series not found');
    }

    // Get episode statistics
    const episodeStats = await db.select({
      totalEpisodes: sql<number>`count(*)`,
      episodesWithImages: sql<number>`count(*) filter (where jsonb_array_length(images) > 0)`,
      episodesWithLocalImages: sql<number>`count(*) filter (where jsonb_array_length(local_images_path) > 0)`,
      totalImages: sql<number>`sum(jsonb_array_length(images))`,
      totalLocalImages: sql<number>`sum(jsonb_array_length(local_images_path))`,
      lastEpisodeDate: sql<Date>`max(published_at)`,
      lastProcessedDate: sql<Date>`max(images_processed_at)`
    })
    .from(episodes)
    .where(eq(episodes.seriesId, id));

    const stats = episodeStats[0];
    const totalEpisodes = stats.totalEpisodes || 0;
    const episodesWithImages = stats.episodesWithImages || 0;
    const episodesWithLocalImages = stats.episodesWithLocalImages || 0;

    return {
      seriesId: id,
      episodes: {
        total: totalEpisodes,
        withImages: episodesWithImages,
        withLocalImages: episodesWithLocalImages,
        imageProcessingRate: totalEpisodes > 0 ? 
          Math.round((episodesWithImages / totalEpisodes) * 100) : 0,
        localProcessingRate: totalEpisodes > 0 ? 
          Math.round((episodesWithLocalImages / totalEpisodes) * 100) : 0
      },
      images: {
        totalImages: stats.totalImages || 0,
        totalLocalImages: stats.totalLocalImages || 0,
        localStorageRate: (stats.totalImages || 0) > 0 ? 
          Math.round(((stats.totalLocalImages || 0) / (stats.totalImages || 0)) * 100) : 0
      },
      dates: {
        lastEpisode: stats.lastEpisodeDate,
        lastProcessed: stats.lastProcessedDate
      }
    };
  });

  // Search episodes within a series
  fastify.get('/:id/episodes/search', async (request: any) => {
    const { id } = request.params;
    const { q = '', page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    const episodesData = await db.select()
      .from(episodes)
      .where(
        sql`${episodes.seriesId} = ${id} AND ${episodes.name} ILIKE ${`%${q}%`}`
      )
      .orderBy(desc(episodes.number))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(episodes)
      .where(
        sql`${episodes.seriesId} = ${id} AND ${episodes.name} ILIKE ${`%${q}%`}`
      );

    const episodesWithLocalImages = episodesData.map(episode => ({
      ...episode,
      localImageUrls: Array.isArray(episode.localImagesPath) ? 
        episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
      imageOptions: {
        cdn: episode.images || [],
        local: Array.isArray(episode.localImagesPath) ? 
          episode.localImagesPath.map((path: string) => `/storage/images/${path}`) : [],
        hasLocal: Array.isArray(episode.localImagesPath) && episode.localImagesPath.length > 0,
        totalImages: Array.isArray(episode.images) ? episode.images.length : 0,
        totalLocalImages: Array.isArray(episode.localImagesPath) ? episode.localImagesPath.length : 0
      }
    }));

    return {
      episodes: episodesWithLocalImages,
      total: totalResult[0].count,
      page,
      limit,
      query: q
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

  // Update series (for manual edits)
  fastify.put('/:id', async (request: any) => {
    const { id } = request.params;
    const updateData = request.body;

    // Only allow certain fields to be updated
    const allowedFields = ['name', 'description'];
    const filteredData: any = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return { success: false, message: 'No valid fields to update' };
    }

    await db.update(series)
      .set({
        ...filteredData,
        lastUpdated: new Date()
      })
      .where(eq(series.id, id));

    return { success: true, message: 'Series updated successfully' };
  });
}