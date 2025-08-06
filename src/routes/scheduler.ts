import { FastifyInstance } from 'fastify';

export async function schedulerRoutes(fastify: FastifyInstance) {
  // Get scheduler status
  fastify.get('/status', async () => {
    const status = (fastify as any).schedulerService.getSchedulerStatus();
    return {
      success: true,
      data: status
    };
  });

  // Start all scheduled tasks
  fastify.post('/start', async () => {
    try {
      await (fastify as any).schedulerService.startAllSchedules();
      return {
        success: true,
        message: 'All scheduled tasks started'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to start scheduler'
      };
    }
  });

  // Stop all scheduled tasks
  fastify.post('/stop', async () => {
    try {
      (fastify as any).schedulerService.stopAllSchedules();
      return {
        success: true,
        message: 'All scheduled tasks stopped'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to stop scheduler'
      };
    }
  });

  // Start schedule for specific source
  fastify.post('/source/:sourceId/start', async (request: any) => {
    const { sourceId } = request.params;
    
    try {
      const started = (fastify as any).schedulerService.startScheduleForSource(sourceId);
      
      if (started) {
        return {
          success: true,
          message: `Schedule started for source: ${sourceId}`
        };
      } else {
        return {
          success: false,
          message: `Schedule for source ${sourceId} is already running or doesn't exist`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to start source schedule'
      };
    }
  });

  // Stop/pause schedule for specific source
  fastify.post('/source/:sourceId/stop', async (request: any) => {
    const { sourceId } = request.params;
    
    try {
      const stopped = (fastify as any).schedulerService.pauseScheduleForSource(sourceId);
      
      if (stopped) {
        return {
          success: true,
          message: `Schedule paused for source: ${sourceId}`
        };
      } else {
        return {
          success: false,
          message: `Schedule for source ${sourceId} is not running or doesn't exist`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to stop source schedule'
      };
    }
  });

  // Update schedule interval for specific source
  fastify.put('/source/:sourceId/interval', async (request: any) => {
    const { sourceId } = request.params;
    const { intervalMinutes } = request.body;
    
    if (!intervalMinutes || intervalMinutes < 1) {
      return {
        success: false,
        message: 'Invalid interval. Must be at least 1 minute.'
      };
    }
    
    try {
      (fastify as any).schedulerService.updateScheduleForSource(sourceId, intervalMinutes);
      
      return {
        success: true,
        message: `Schedule updated for source ${sourceId} - new interval: ${intervalMinutes} minutes`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update source schedule'
      };
    }
  });

  // Remove schedule for specific source
  fastify.delete('/source/:sourceId', async (request: any) => {
    const { sourceId } = request.params;
    
    try {
      (fastify as any).schedulerService.stopScheduleForSource(sourceId);
      
      return {
        success: true,
        message: `Schedule removed for source: ${sourceId}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove source schedule'
      };
    }
  });
}