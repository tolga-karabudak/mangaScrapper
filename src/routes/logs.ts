// src/routes/logs.ts
import { FastifyInstance } from 'fastify';
import { LoggingService, LogFilter } from '../services/LoggingService';
import { LogLevel } from '../utils/logger';

export async function logsRoutes(fastify: FastifyInstance) {
  const loggingService = new LoggingService();

  // Get logs with filtering and pagination
  fastify.get('/', async (request: any) => {
    const {
      level,
      source,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = request.query;

    const filters: LogFilter = {
      level: level === 'all' ? 'all' : (level ? parseInt(level) : 'all'),
      source,
      startDate,
      endDate,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 1000) // Max 1000 per request
    };

    try {
      const result = await loggingService.getLogs(filters);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get logs',
        data: {
          logs: [],
          total: 0,
          page: 1,
          limit: 50,
          filters,
          availableSources: [],
          logFiles: []
        }
      };
    }
  });

  // Get real-time logs (for live updates)
  fastify.get('/realtime', async (request: any) => {
    const { level, source, search } = request.query;

    const filters: LogFilter = {
      level: level === 'all' ? 'all' : (level ? parseInt(level) : 'all'),
      source,
      search
    };

    try {
      const logs = loggingService.getRealtimeLogs(filters);
      return {
        success: true,
        data: {
          logs,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get realtime logs'
      };
    }
  });

  // Get log statistics
  fastify.get('/stats', async () => {
    try {
      const stats = await loggingService.getLogStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get log statistics'
      };
    }
  });

  // Get available log files
  fastify.get('/files', async () => {
    try {
      const files = loggingService.getLogFiles();
      return {
        success: true,
        data: {
          files,
          count: files.length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get log files'
      };
    }
  });

  // Download specific log file
  fastify.get('/download/:filename', async (request: any, reply: any) => {
    const { filename } = request.params;
    
    // Security: only allow .log files and prevent path traversal
    if (!filename.endsWith('.log') || filename.includes('..') || filename.includes('/')) {
      return reply.code(400).send({
        success: false,
        message: 'Invalid filename'
      });
    }

    try {
      const logFiles = loggingService.getLogFiles();
      if (!logFiles.includes(filename)) {
        return reply.code(404).send({
          success: false,
          message: 'Log file not found'
        });
      }

      const logs = await loggingService.getLogsFromFile(filename, {});
      
      // Format for download
      const csvContent = this.formatLogsForDownload(logs, request.query.format || 'csv');
      const fileExtension = request.query.format === 'txt' ? 'txt' : 'csv';
      
      reply.header('Content-Disposition', `attachment; filename="${filename.replace('.log', `.${fileExtension}`)}"`)
           .header('Content-Type', fileExtension === 'csv' ? 'text/csv' : 'text/plain')
           .send(csvContent);

    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to download log file'
      });
    }
  });

  // Get logs by specific criteria
  fastify.post('/search', async (request: any) => {
    const {
      levels = [],
      sources = [],
      dateRange = {},
      searchTerms = [],
      page = 1,
      limit = 50
    } = request.body;

    try {
      // Advanced search functionality
      let allLogs = await loggingService.getLogs({ limit: 10000 });
      let filtered = allLogs.logs;

      // Filter by multiple levels
      if (levels.length > 0) {
        const levelMap: { [key: string]: number } = {
          DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4
        };
        filtered = filtered.filter(log => 
          levels.includes(log.level) || 
          levels.some((l: any) => typeof l === 'number' ? (levelMap[log.level] || 1) >= l : false)
        );
      }

      // Filter by multiple sources
      if (sources.length > 0) {
        filtered = filtered.filter(log => 
          sources.some((source: string) => log.source.toLowerCase().includes(source.toLowerCase()))
        );
      }

      // Filter by date range
      if (dateRange.start) {
        const startDate = new Date(dateRange.start);
        filtered = filtered.filter(log => new Date(log.timestamp) >= startDate);
      }
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        filtered = filtered.filter(log => new Date(log.timestamp) <= endDate);
      }

      // Filter by multiple search terms (AND logic)
      if (searchTerms.length > 0) {
        filtered = filtered.filter(log => 
          searchTerms.every((term: string) => {
            const lowerTerm = term.toLowerCase();
            return log.message.toLowerCase().includes(lowerTerm) ||
                   log.source.toLowerCase().includes(lowerTerm);
          })
        );
      }

      // Pagination
      const startIndex = (page - 1) * limit;
      const paginatedLogs = filtered.slice(startIndex, startIndex + limit);

      return {
        success: true,
        data: {
          logs: paginatedLogs,
          total: filtered.length,
          page,
          limit,
          searchCriteria: {
            levels,
            sources,
            dateRange,
            searchTerms
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Advanced search failed'
      };
    }
  });

  // Get log levels enum
  fastify.get('/levels', async () => {
    return {
      success: true,
      data: {
        levels: [
          { name: 'DEBUG', value: LogLevel.DEBUG, color: '#36A2EB' },
          { name: 'INFO', value: LogLevel.INFO, color: '#4BC0C0' },
          { name: 'WARN', value: LogLevel.WARN, color: '#FFCE56' },
          { name: 'ERROR', value: LogLevel.ERROR, color: '#FF6384' },
          { name: 'CRITICAL', value: LogLevel.CRITICAL, color: '#9966FF' }
        ]
      }
    };
  });

  // Helper method to format logs for download
  (fastify as any).formatLogsForDownload = function(logs: any[], format: string): string {
    if (format === 'txt') {
      return logs.map(log => 
        `[${log.timestamp}] [${log.level}] [${log.source}] ${log.message}`
      ).join('\n');
    }
    
    // CSV format
    const csvHeader = 'Timestamp,Level,Source,Message\n';
    const csvRows = logs.map(log => {
      const fields = [
        log.timestamp,
        log.level,
        log.source,
        `"${log.message.replace(/"/g, '""')}"` // Escape quotes
      ];
      return fields.join(',');
    }).join('\n');
    
    return csvHeader + csvRows;
  };
}