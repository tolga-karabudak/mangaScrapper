import { FastifyInstance } from 'fastify';

export async function scrapingRoutes(fastify: FastifyInstance) {
  // Start scraping for specific source
  fastify.post('/start/:sourceId', async (request: any) => {
    const { sourceId } = request.params;
    const { type = 'recent', pages } = request.body;

    try {
      if (pages && type === 'full') {
        const { start, end } = pages;
        await (fastify as any).scrapingService.scrapeMultiplePages(sourceId, start, end);
      } else {
        await (fastify as any).scrapingService.startScrapingForSource(sourceId, type);
      }

      return { success: true, message: 'Scraping started' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get queue status
  fastify.get('/queue/status', async () => {
    const status = await (fastify as any).scrapingService.getQueueStatus();
    return status;
  });

  // Manual series scraping
  fastify.post('/series', async (request: any) => {
    const { url, sourceId } = request.body;

    try {
      await (fastify as any).scrapingService.addScrapingJob({
        sourceId,
        type: 'series',
        seriesUrl: url
      }, 15); // High priority for manual requests

      return { success: true, message: 'Series scraping job queued' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Manual episode scraping
  fastify.post('/episode', async (request: any) => {
    const { url, sourceId } = request.body;

    try {
      await (fastify as any).scrapingService.addScrapingJob({
        sourceId,
        type: 'episode',
        episodeUrl: url
      }, 15);

      return { success: true, message: 'Episode scraping job queued' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}