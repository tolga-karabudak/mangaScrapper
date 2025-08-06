// src/routes/images.ts - Static image serving with fallback
import { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { access, stat } from 'fs/promises';
import { join } from 'path';
import { ImageStorageService } from '../services/ImageStorageService';

export async function imageRoutes(fastify: FastifyInstance) {
  const imageStorage = new ImageStorageService();
  const storageDir = join(process.cwd(), 'storage', 'images');

  // Serve static images with fallback mechanism
  fastify.get('/storage/images/*', async (request: any, reply: any) => {
    const imagePath = request.params['*'] as string;
    const fullPath = join(storageDir, imagePath);

    try {
      // Check if local image exists
      await access(fullPath);
      const stats = await stat(fullPath);

      // Set appropriate headers
      reply.type('image/webp');
      reply.header('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      reply.header('Content-Length', stats.size);
      reply.header('Last-Modified', stats.mtime.toUTCString());
      reply.header('ETag', `"${stats.size}-${stats.mtime.getTime()}"`);

      // Check if client has cached version
      const ifNoneMatch = request.headers['if-none-match'];
      const ifModifiedSince = request.headers['if-modified-since'];
      
      if (ifNoneMatch === `"${stats.size}-${stats.mtime.getTime()}"` ||
          (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime)) {
        return reply.code(304).send();
      }

      // Stream the file
      const stream = createReadStream(fullPath);
      return reply.send(stream);

    } catch (error) {
      // File not found locally - could implement CDN fallback here
      return reply.code(404).send({ 
        error: 'Image not found',
        message: 'Local image file does not exist',
        path: imagePath
      });
    }
  });

  // Image metadata endpoint
  fastify.get('/api/images/metadata/:type/:seriesId/:episodeId?', async (request: any) => {
    const { type, seriesId, episodeId } = request.params;

    try {
      if (type === 'cover' && !episodeId) {
        // Series cover metadata
        const coverPath = `series/${seriesId}/cover.webp`;
        const exists = await imageStorage.imageExists(coverPath);
        
        if (exists) {
          const size = await imageStorage.getImageSize(coverPath);
          return {
            type: 'cover',
            seriesId,
            localPath: coverPath,
            exists: true,
            fileSize: size,
            url: `/storage/images/${coverPath}`
          };
        }
        
        return {
          type: 'cover',
          seriesId,
          exists: false
        };
      } 
      
      if (type === 'episode' && episodeId) {
        // Episode images metadata
        const episodeDir = `series/${seriesId}/episodes/${episodeId}`;
        
        // This would need a method to list episode images
        return {
          type: 'episode',
          seriesId,
          episodeId,
          message: 'Episode images metadata - implementation needed'
        };
      }

      return { error: 'Invalid parameters' };
    } catch (error) {
      return { error: 'Failed to get image metadata' };
    }
  });

  // Health check for image storage
  fastify.get('/api/images/health', async () => {
    try {
      // Check if storage directory is accessible
      await access(storageDir);
      
      return {
        status: 'healthy',
        storageDir,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: 'Storage directory not accessible',
        storageDir
      };
    }
  });
}