import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
  error?: Error;
}

class Logger {
  private logDir: string;
  private currentLogFile: string;

  constructor() {
    this.logDir = join(process.cwd(), 'logs');
    this.ensureLogDir();
    this.currentLogFile = this.getLogFileName();
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    return join(this.logDir, `scraper-${date}.log`);
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    let logLine = `[${entry.timestamp}] [${levelNames[entry.level]}] [${entry.source}] ${entry.message}`;
    
    if (entry.data) {
      logLine += ` | Data: ${JSON.stringify(entry.data)}`;
    }
    
    if (entry.error) {
      logLine += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        logLine += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return logLine;
  }

  private log(level: LogLevel, source: string, message: string, data?: any, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
      error
    };

    const formattedLog = this.formatLogEntry(entry);
    
    // Console output with colors
    this.logToConsole(entry, formattedLog);
    
    // File output
    try {
      appendFileSync(this.currentLogFile, formattedLog + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  private logToConsole(entry: LogEntry, formattedLog: string): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m',    // Cyan
      [LogLevel.INFO]: '\x1b[32m',     // Green
      [LogLevel.WARN]: '\x1b[33m',     // Yellow
      [LogLevel.ERROR]: '\x1b[31m',    // Red
      [LogLevel.CRITICAL]: '\x1b[35m'  // Magenta
    };
    
    const reset = '\x1b[0m';
    const coloredLog = `${colors[entry.level]}${formattedLog}${reset}`;
    
    console.log(coloredLog);
  }

  debug(source: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, source, message, data);
  }

  info(source: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, source, message, data);
  }

  warn(source: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, source, message, data);
  }

  error(source: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.ERROR, source, message, data, error);
  }

  critical(source: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.CRITICAL, source, message, data, error);
  }

  // Scraping specific methods
  scraperStart(source: string, url: string): void {
    this.info('SCRAPER', `Starting scraping: ${source}`, { url });
  }

  scraperSuccess(source: string, url: string, itemCount: number, duration: number): void {
    this.info('SCRAPER', `✅ Scraping completed: ${source}`, { 
      url, 
      itemCount, 
      duration: `${duration}ms` 
    });
  }

  scraperError(source: string, url: string, error: Error): void {
    this.error('SCRAPER', `❌ Scraping failed: ${source}`, error, { url });
  }

  proxySwitch(oldProxy: string, newProxy: string, reason: string): void {
    this.warn('PROXY', `Switching proxy: ${reason}`, { oldProxy, newProxy });
  }

  cloudflareDetected(source: string, url: string): void {
    this.warn('CLOUDFLARE', `Cloudflare protection detected: ${source}`, { url });
  }

  rateLimitDetected(source: string, url: string, retryAfter?: number): void {
    this.warn('RATE_LIMIT', `Rate limit detected: ${source}`, { 
      url, 
      retryAfter: retryAfter ? `${retryAfter}s` : 'unknown' 
    });
  }

  captchaDetected(source: string, url: string): void {
    this.warn('CAPTCHA', `Captcha detected: ${source}`, { url });
  }

  banDetected(source: string, ip: string): void {
    this.critical('BAN', `IP potentially banned: ${source}`, undefined, { ip });
  }
}

export const logger = new Logger();