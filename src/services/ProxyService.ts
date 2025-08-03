import { logger } from '../utils/logger';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  label?: string;
}

export class ProxyService {
  private proxies: ProxyConfig[] = [];
  private currentProxyIndex: number = 0;
  private failedProxies: Set<string> = new Set();
  private proxyStats: Map<string, { requests: number; failures: number; lastUsed: Date }> = new Map();

  constructor() {
    this.loadProxies();
  }

  private loadProxies(): void {
    // Default proxy from your specification
    const defaultProxy: ProxyConfig = {
      host: '91.108.233.225',
      port: 5433,
      username: 'Q9tROW9lNeRX',
      password: 'JwPqqUcSYopn',
      label: 'Primary IPv4'
    };

    this.proxies.push(defaultProxy);
    
    // Load additional proxies from environment
    const proxyList = process.env.PROXY_LIST;
    if (proxyList) {
      const additionalProxies = this.parseProxyList(proxyList);
      this.proxies.push(...additionalProxies);
    }

    logger.info('PROXY_SERVICE', `Loaded ${this.proxies.length} proxies`);
  }

  private parseProxyList(proxyList: string): ProxyConfig[] {
    return proxyList.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, index) => {
        const [host, port, username, password] = line.split(':');
        return {
          host,
          port: parseInt(port),
          username,
          password,
          label: `Proxy ${index + 2}`
        };
      });
  }

  getCurrentProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    
    const proxy = this.proxies[this.currentProxyIndex];
    const proxyKey = `${proxy.host}:${proxy.port}`;
    
    // Update stats
    const stats = this.proxyStats.get(proxyKey) || { requests: 0, failures: 0, lastUsed: new Date() };
    stats.requests++;
    stats.lastUsed = new Date();
    this.proxyStats.set(proxyKey, stats);
    
    logger.debug('PROXY_SERVICE', `Using proxy: ${proxy.label}`, { 
      host: proxy.host, 
      port: proxy.port,
      stats 
    });
    
    return proxy;
  }

  rotateProxy(reason: string = 'rotation'): ProxyConfig | null {
    if (this.proxies.length <= 1) {
      logger.warn('PROXY_SERVICE', 'Cannot rotate: only one proxy available');
      return this.getCurrentProxy();
    }

    const oldProxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    const newProxy = this.proxies[this.currentProxyIndex];

    logger.proxySwitch(
      `${oldProxy?.label} (${oldProxy?.host}:${oldProxy?.port})`,
      `${newProxy?.label} (${newProxy?.host}:${newProxy?.port})`,
      reason
    );

    return newProxy;
  }

  markProxyFailed(proxy: ProxyConfig, error: Error): void {
    const proxyKey = `${proxy.host}:${proxy.port}`;
    this.failedProxies.add(proxyKey);
    
    const stats = this.proxyStats.get(proxyKey) || { requests: 0, failures: 0, lastUsed: new Date() };
    stats.failures++;
    this.proxyStats.set(proxyKey, stats);

    logger.error('PROXY_SERVICE', `Proxy failed: ${proxy.label}`, error, {
      host: proxy.host,
      port: proxy.port,
      stats
    });

    // Auto-rotate to next proxy
    this.rotateProxy('proxy_failed');
  }

  getProxyStats(): any {
    return Array.from(this.proxyStats.entries()).map(([key, stats]) => {
      const [host, port] = key.split(':');
      const proxy = this.proxies.find(p => p.host === host && p.port.toString() === port);
      
      return {
        proxy: proxy?.label || key,
        host,
        port,
        ...stats,
        successRate: stats.requests > 0 ? ((stats.requests - stats.failures) / stats.requests * 100).toFixed(2) + '%' : '0%',
        isFailed: this.failedProxies.has(key)
      };
    });
  }

  resetFailedProxies(): void {
    this.failedProxies.clear();
    logger.info('PROXY_SERVICE', 'Reset all failed proxy flags');
  }
}

export const proxyService = new ProxyService();