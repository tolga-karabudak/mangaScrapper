// src/routes/images.ts - Static image serving with fallback
import { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { access, stat } from 'fs/promises';
import { join } from 'path';
import { ImageStorageService } from '../services/ImageStorageService';

export async function imageRoutes(fastify: FastifyInstance) {
  const imageStorage = new ImageStorageService();
  const storageInfo = imageStorage.getStorageInfo();

  // Serve static images with fallback mechanism
  fastify.get('/storage/images/*', async (request: any, reply: any) => {
    const imagePath = request.params['*'] as string;
    const fullPath = imageStorage.getLocalImagePath(imagePath);

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
  fastify.get('/api/images/metadata/:type/:seriesId/:episodeId?', async (request: any, reply: any) => {
    const { type, seriesId, episodeId } = request.params;
    
    try {
      let imagePath: string;
      
      if (type === 'cover') {
        imagePath = `series/${seriesId}/cover.webp`;
      } else if (type === 'episode' && episodeId) {
        // Return metadata for all episode images
        const episodePath = `series/${seriesId}/episodes/${episodeId}`;
        // This would need implementation to scan directory
        return { 
          message: 'Episode image metadata not implemented yet',
          path: episodePath
        };
      } else {
        return reply.code(400).send({ error: 'Invalid image type or missing episodeId' });
      }

      const exists = await imageStorage.imageExists(imagePath);
      if (!exists) {
        return reply.code(404).send({ error: 'Image not found', path: imagePath });
      }

      const fileSize = await imageStorage.getImageSize(imagePath);
      
      return {
        exists: true,
        path: imagePath,
        size: fileSize,
        url: `/storage/images/${imagePath}`
      };
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to get image metadata',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Storage info endpoint
  fastify.get('/api/images/storage-info', async () => {
    return {
      storage: storageInfo,
      supportedFormats: ['webp'],
      maxFileSize: '10MB'
    };
  });
}