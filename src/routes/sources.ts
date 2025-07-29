import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { sources } from '../config/schema';
import { eq } from 'drizzle-orm';
import type { ScrapingSource } from '../types';

export async function sourcesRoutes(fastify: FastifyInstance) {
  // Get all sources
  fastify.get('/', async () => {
    const allSources = await db.select().from(sources);
    return allSources;
  });

  // Get single source
  fastify.get('/:id', async (request: any) => {
    const { id } = request.params;
    const source = await db.select()
      .from(sources)
      .where(eq(sources.id, id))
      .limit(1);
    
    if (source.length === 0) {
      throw new Error('Source not found');
    }
    
    return source[0];
  });

  // Create new source
  fastify.post('/', async (request: any) => {
    const sourceData = request.body as Omit<ScrapingSource, 'createdAt' | 'updatedAt'>;
    
    await db.insert(sources).values({
      ...sourceData,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Schedule scraping if active
    if (sourceData.isActive) {
      (fastify as any).schedulerService.scheduleSourceScraping(
        sourceData.id, 
        sourceData.scanInterval
      );
    }

    return { success: true, message: 'Source created successfully' };
  });

  // Update source
  fastify.put('/:id', async (request: any) => {
    const { id } = request.params;
    const sourceData = request.body as Partial<ScrapingSource>;

    await db.update(sources)
      .set({
        ...sourceData,
        updatedAt: new Date()
      })
      .where(eq(sources.id, id));

    // Update schedule
    if (sourceData.isActive && sourceData.scanInterval) {
      (fastify as any).schedulerService.updateScheduleForSource(id, sourceData.scanInterval);
    } else if (sourceData.isActive === false) {
      (fastify as any).schedulerService.stopScheduleForSource(id);
    }

    return { success: true, message: 'Source updated successfully' };
  });

  // Delete source
  fastify.delete('/:id', async (request: any) => {
    const { id } = request.params;
    
    // Stop scheduled tasks
    (fastify as any).schedulerService.stopScheduleForSource(id);
    
    await db.delete(sources).where(eq(sources.id, id));
    
    return { success: true, message: 'Source deleted successfully' };
  });

  // Test source
  fastify.post('/:id/test', async (request: any) => {
    const { id } = request.params;
    
    try {
      await (fastify as any).scrapingService.startScrapingForSource(id, 'recent');
      return { success: true, message: 'Test scraping job queued' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}