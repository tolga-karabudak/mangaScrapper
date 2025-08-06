import { FastifyInstance } from 'fastify';
import { sourcesRoutes } from './sources';
import { seriesRoutes } from './series';
import { scrapingRoutes } from './scraping';
import { dashboardRoutes } from './dashboard';
import { imageRoutes } from './images';

export async function setupRoutes(fastify: FastifyInstance) {
  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Image serving routes (must be registered before API routes)
  await fastify.register(imageRoutes);

  // API routes
  await fastify.register(sourcesRoutes, { prefix: '/api/sources' });
  await fastify.register(seriesRoutes, { prefix: '/api/series' });
  await fastify.register(scrapingRoutes, { prefix: '/api/scraping' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
}