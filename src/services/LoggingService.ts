// src/services/LoggingService.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { logger, LogEntry, LogLevel } from '../utils/logger';

export interface LogFilter {
  level?: LogLevel | 'all';
  source?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LogResponse {
  logs: ParsedLogEntry[];
  total: number;
  page: number;
  limit: number;
  filters: LogFilter;
  availableSources: string[];
  logFiles: string[];
}

export interface ParsedLogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

export class LoggingService {
  private logDir: string;
  private inMemoryLogs: ParsedLogEntry[] = [];
  private maxInMemoryLogs: number = 1000;

  constructor() {
    this.logDir = join(process.cwd(), 'logs');
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      logger.info('LOGGING_SERVICE', 'Creating logs directory');
    }
  }

  /**
   * Add log to in-memory cache for real-time viewing
   */
  addLogEntry(entry: ParsedLogEntry): void {
    this.inMemoryLogs.unshift(entry);
    
    // Keep only the most recent logs in memory
    if (this.inMemoryLogs.length > this.maxInMemoryLogs) {
      this.inMemoryLogs = this.inMemoryLogs.slice(0, this.maxInMemoryLogs);
    }
  }

  /**
   * Get available log files
   */
  getLogFiles(): string[] {
    try {
      if (!existsSync(this.logDir)) return [];
      
      return readdirSync(this.logDir)
        .filter(file => file.endsWith('.log'))
        .map(file => {
          const stats = statSync(join(this.logDir, file));
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())
        .map(file => file.name);
    } catch (error) {
      logger.error('LOGGING_SERVICE', 'Failed to get log files', error);
      return [];
    }
  }

  /**
   * Parse log line to structured format
   */
  private parseLogLine(line: string): ParsedLogEntry | null {
    try {
      // Format: [2025-07-29T22:27:44.209Z] [INFO] [PROXY_SERVICE] Loaded 1 proxies
      const logRegex = /^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/;
      const match = line.match(logRegex);
      
      if (!match) return null;
      
      const [, timestamp, level, source, messageAndData] = match;
      
      // Parse data and error if present
      let message = messageAndData;
      let data: any = undefined;
      let error: string | undefined = undefined;
      
      // Extract data
      const dataMatch = messageAndData.match(/^(.+?) \| Data: (.+?)(?:\s*\|\s*Error:|$)/);
      if (dataMatch) {
        message = dataMatch[1];
        try {
          data = JSON.parse(dataMatch[2]);
        } catch {
          data = dataMatch[2];
        }
      }
      
      // Extract error
      const errorMatch = messageAndData.match(/\| Error: (.+?)(?:\nStack:|$)/);
      if (errorMatch) {
        error = errorMatch[1];
      }
      
      const levelMap: { [key: string]: number } = {
        DEBUG: LogLevel.DEBUG,
        INFO: LogLevel.INFO,
        WARN: LogLevel.WARN,
        ERROR: LogLevel.ERROR,
        CRITICAL: LogLevel.CRITICAL
      };
      
      return {
        timestamp,
        level,
        source,
        message
      };
    } catch (error) {
      logger.debug('LOGGING_SERVICE', 'Failed to parse log line', { line });
      return null;
    }
  }

  /**
   * Read logs from file with filtering and pagination
   */
  async getLogsFromFile(filename: string, filters: LogFilter): Promise<ParsedLogEntry[]> {
    try {
      const filePath = join(this.logDir, filename);
      if (!existsSync(filePath)) return [];
      
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.length > 0);
      
      const parsedLogs = lines
        .map(line => this.parseLogLine(line))
        .filter(log => log !== null) as ParsedLogEntry[];
      
      return this.filterLogs(parsedLogs, filters);
    } catch (error) {
      logger.error('LOGGING_SERVICE', `Failed to read log file: ${filename}`, error);
      return [];
    }
  }

  /**
   * Apply filters to logs
   */
  private filterLogs(logs: ParsedLogEntry[], filters: LogFilter): ParsedLogEntry[] {
    let filtered = [...logs];
    
    // Filter by level
    if (filters.level && filters.level !== 'all') {
      const levelMap: { [key: string]: number } = {
        DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4
      };
      const minLevel = filters.level as number;
      filtered = filtered.filter(log => (levelMap[log.level] || 1) >= minLevel);
    }
    
    // Filter by source
    if (filters.source) {
      filtered = filtered.filter(log => 
        log.source.toLowerCase().includes(filters.source!.toLowerCase())
      );
    }
    
    // Filter by date range
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filtered = filtered.filter(log => new Date(log.timestamp) >= startDate);
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filtered = filtered.filter(log => new Date(log.timestamp) <= endDate);
    }
    
    // Filter by search term
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        log.source.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return filtered;
  }

  /**
   * Get logs with pagination and filtering
   */
  async getLogs(filters: LogFilter = {}): Promise<LogResponse> {
    const {
      level = 'all',
      source,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = filters;
    
    let allLogs: ParsedLogEntry[] = [];
    
    // Get logs from current day file first (most recent)
    const logFiles = this.getLogFiles();
    const todayFile = logFiles[0]; // Most recent file
    
    if (todayFile) {
      const todayLogs = await this.getLogsFromFile(todayFile, filters);
      allLogs.push(...todayLogs);
    }
    
    // Add in-memory logs (for real-time)
    const memoryLogs = this.filterLogs(this.inMemoryLogs, filters);
    allLogs.push(...memoryLogs);
    
    // Remove duplicates based on timestamp + message
    const uniqueLogs = allLogs.filter((log, index, arr) => 
      arr.findIndex(l => l.timestamp === log.timestamp && l.message === log.message) === index
    );
    
    // Sort by timestamp
    uniqueLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedLogs = uniqueLogs.slice(startIndex, startIndex + limit);
    
    // Get available sources for filtering
    const availableSources = [...new Set(uniqueLogs.map(log => log.source))].sort();
    
    return {
      logs: paginatedLogs,
      total: uniqueLogs.length,
      page,
      limit,
      filters,
      availableSources,
      logFiles
    };
  }

  /**
   * Get real-time logs (WebSocket support)
   */
  getRealtimeLogs(filters: LogFilter = {}): ParsedLogEntry[] {
    return this.filterLogs(this.inMemoryLogs, filters).slice(0, 100);
  }

  /**
   * Get log statistics
   */
  async getLogStats(): Promise<{
    totalLogs: number;
    logsByLevel: { [level: string]: number };
    logsBySources: { [source: string]: number };
    recentErrors: ParsedLogEntry[];
    logFilesInfo: Array<{
      name: string;
      size: number;
      entriesCount: number;
    }>;
  }> {
    const logs = await this.getLogs({ limit: 10000 });
    
    const logsByLevel: { [level: string]: number } = {};
    const logsBySources: { [source: string]: number } = {};
    
    logs.logs.forEach(log => {
      logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;
      logsBySources[log.source] = (logsBySources[log.source] || 0) + 1;
    });
    
    const recentErrors = logs.logs
      .filter(log => {
        const levelMap: { [key: string]: number } = {
          DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4
        };
        return (levelMap[log.level] || 1) >= LogLevel.ERROR;
      })
      .slice(0, 10);
    
    const logFiles = this.getLogFiles();
    const logFilesInfo = logFiles.map(file => {
      try {
        const filePath = join(this.logDir, file);
        const stats = statSync(filePath);
        const content = readFileSync(filePath, 'utf8');
        const entriesCount = content.split('\n').filter(line => line.length > 0).length;
        
        return {
          name: file,
          size: stats.size,
          entriesCount
        };
      } catch {
        return {
          name: file,
          size: 0,
          entriesCount: 0
        };
      }
    });
    
    return {
      totalLogs: logs.total,
      logsByLevel,
      logsBySources,
      recentErrors,
      logFilesInfo
    };
  }
}