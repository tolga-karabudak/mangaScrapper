import { FastifyInstance } from 'fastify';
import { sourcesRoutes } from './sources';
import { seriesRoutes } from './series';
import { scrapingRoutes } from './scraping';
import { dashboardRoutes } from './dashboard';
import { schedulerRoutes } from './scheduler';
import { imageRoutes } from './images';
import { logsRoutes } from './logs';

export async function setupRoutes(fastify: FastifyInstance) {
  // API routes
  await fastify.register(sourcesRoutes, { prefix: '/api/sources' });
  await fastify.register(seriesRoutes, { prefix: '/api/series' });
  await fastify.register(scrapingRoutes, { prefix: '/api/scraping' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await fastify.register(schedulerRoutes, { prefix: '/api/scheduler' });
  await fastify.register(logsRoutes, { prefix: '/api/logs' });
  
  // Static image serving
  await fastify.register(imageRoutes);

  // Health check endpoint
  fastify.get('/health', async () => {
    return { 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      storage: {
        path: process.env.STORAGE_PATH || './storage',
        platform: process.platform
      }
    };
  });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      name: 'Manga Scraper v2',
      version: '2.0.0',
      status: 'running',
      endpoints: {
        sources: '/api/sources',
        series: '/api/series',
        scraping: '/api/scraping',
        dashboard: '/api/dashboard',
        scheduler: '/api/scheduler',
        logs: '/api/logs',
        images: '/storage/images',
        health: '/health'
      }
    };
  });
}