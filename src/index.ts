import Fastify from 'fastify';
import { ScrapingService } from './services/ScrapingService';
import { SchedulerService } from './services/SchedulerService';
import { setupRoutes } from './routes';
import { db } from './config/database';

const fastify = Fastify({
  logger: true
});

// Global services
let scrapingService: ScrapingService;
let schedulerService: SchedulerService;

async function startServer() {
  try {
    // Initialize services
    scrapingService = new ScrapingService();
    schedulerService = new SchedulerService(scrapingService);

    // Add services to fastify instance for route access
    fastify.decorate('scrapingService', scrapingService);
    fastify.decorate('schedulerService', schedulerService);

    // Setup CORS
    await fastify.register(require('@fastify/cors'), {
      origin: true
    });

    // Setup routes
    await setupRoutes(fastify);

    // Initialize scheduled tasks
    await schedulerService.initializeSchedules();

    // Start server
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Server is running on http://localhost:3000');

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  schedulerService?.stopAllSchedules();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  schedulerService?.stopAllSchedules();
  await fastify.close();
  process.exit(0);
});

startServer();