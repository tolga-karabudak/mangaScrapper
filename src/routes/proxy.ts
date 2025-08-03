// src/routes/proxy.ts
import { FastifyInstance } from 'fastify';
import { proxyService } from '../services/ProxyService';

export async function proxyRoutes(fastify: FastifyInstance) {
  // Get proxy statistics
  fastify.get('/stats', async () => {
    const stats = proxyService.getProxyStats();
    return {
      proxies: stats,
      total: stats.length,
      failed: stats.filter(s => s.isFailed).length,
      active: stats.filter(s => !s.isFailed).length
    };
  });

  // Rotate to next proxy manually
  fastify.post('/rotate', async () => {
    const newProxy = proxyService.rotateProxy('manual_rotation');
    return {
      success: true,
      currentProxy: newProxy ? {
        label: newProxy.label,
        host: newProxy.host,
        port: newProxy.port
      } : null
    };
  });

  // Reset failed proxy flags
  fastify.post('/reset-failed', async () => {
    proxyService.resetFailedProxies();
    return { success: true, message: 'All proxy failed flags reset' };
  });

  // Get current proxy
  fastify.get('/current', async () => {
    const current = proxyService.getCurrentProxy();
    return {
      currentProxy: current ? {
        label: current.label,
        host: current.host,
        port: current.port
      } : null
    };
  });
}