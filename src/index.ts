import 'dotenv/config'; // .env dosyasını en başta yükle
import Fastify from 'fastify';
import { ScrapingService } from './services/ScrapingService';
import { SchedulerService } from './services/SchedulerService';
import { LoggingService } from './services/LoggingService';
import { setupRoutes } from './routes';
import { logger } from './utils/logger';

const fastify = Fastify({
  logger: true
});

// Global services
let scrapingService: ScrapingService;
let schedulerService: SchedulerService;
let loggingService: LoggingService;

async function startServer() {
  try {
    // Initialize services
    scrapingService = new ScrapingService();
    schedulerService = new SchedulerService(scrapingService);
    loggingService = new LoggingService();

    // Setup logger callback for in-memory logs
    logger.setInMemoryCallback((entry) => {
      loggingService.addLogEntry(entry);
    });

    // Add services to fastify instance for route access
    fastify.decorate('scrapingService', scrapingService);
    fastify.decorate('schedulerService', schedulerService);
    fastify.decorate('loggingService', loggingService);

    // Setup CORS
    await fastify.register(require('@fastify/cors'), {
      origin: true
    });

    // Setup routes
    await setupRoutes(fastify);

    // Initialize scheduled tasks (will only start if AUTO_START_SCHEDULER is true)
    await schedulerService.initializeSchedules();

    // Start server
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    
    logger.info('SERVER', `🚀 Server is running on http://localhost:${port}`);
    logger.info('SERVER', `📁 Storage directory: ${process.env.STORAGE_PATH || './storage'}`);
    logger.info('SERVER', `⏰ Auto-start scheduler: ${process.env.AUTO_START_SCHEDULER !== 'false' ? 'Enabled' : 'Disabled'}`);
    
    if (process.env.AUTO_START_SCHEDULER === 'false') {
      logger.info('SERVER', `📋 Use POST http://localhost:${port}/api/scheduler/start to start scheduler manually`);
    }

    // Log some test messages to showcase the logging system
    logger.proxyLoaded(1);
    logger.proxyUsing('Primary IPv4', '91.108.233.225', 5433, {
      requests: 1,
      failures: 0,
      lastUsed: new Date().toISOString()
    });

  } catch (error) {
    logger.critical('SERVER', 'Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SERVER', '🛑 Shutting down gracefully...');
  schedulerService?.stopAllSchedules();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SERVER', '🛑 Shutting down gracefully...');
  schedulerService?.stopAllSchedules();
  await fastify.close();
  process.exit(0);
});

startServer();