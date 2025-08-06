// src/services/ImageProcessingService.ts - Updated with local storage integration
import sharp from 'sharp';
import { createHash } from 'crypto';
import { ImageStorageService } from './ImageStorageService';
import type { ImageStorageResult } from '../types';

// Export ImageStorageService for other modules
export { ImageStorageService };

export class ImageProcessingService {
  private storageService: ImageStorageService;

  constructor() {
    this.storageService = new ImageStorageService();
  }

  /**
   * Process series cover image (download + store + optimize)
   */
  async processSeriesCover(
    imageUrl: string, 
    seriesId: string
  ): Promise<ImageStorageResult | null> {
    try {
      console.log(`🖼️ Processing series cover for ${seriesId}: ${imageUrl}`);
      
      const result = await this.storageService.storeSeriesCover(imageUrl, seriesId, {
        shouldOptimize: true,
        shouldUpscale: false // Cover images usually don't need upscaling
      });

      return result;
    } catch (error) {
      console.error(`❌ Failed to process series cover for ${seriesId}:`, error);
      return null;
    }
  }

  /**
   * Process episode images (download + store + optimize)
   */
  async processEpisodeImages(
    imageUrls: string[], 
    seriesId: string, 
    episodeId: string
  ): Promise<ImageStorageResult[]> {
    try {
      console.log(`📖 Processing ${imageUrls.length} episode images for ${seriesId}/${episodeId}`);
      
      const results = await this.storageService.storeEpisodeImages(
        imageUrls, 
        seriesId, 
        episodeId, 
        {
          shouldOptimize: true,
          shouldUpscale: true // Episode images often need upscaling
        }
      );

      const successCount = results.filter(r => r.processed).length;
      console.log(`✅ Processed ${successCount}/${imageUrls.length} episode images`);

      return results;
    } catch (error) {
      console.error(`❌ Failed to process episode images for ${seriesId}/${episodeId}:`, error);
      return [];
    }
  }

  /**
   * Get image dimensions from local storage
   */
  async getImageDimensions(localPath: string): Promise<{ width: number; height: number } | null> {
    try {
      const fullPath = this.storageService.getLocalImagePath(localPath);
      const metadata = await sharp(fullPath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      console.error(`Error getting image dimensions for ${localPath}:`, error);
      return null;
    }
  }

  /**
   * Check if image exists locally
   */
  async imageExists(localPath: string): Promise<boolean> {
    return this.storageService.imageExists(localPath);
  }

  /**
   * Get local image file size
   */
  async getImageSize(localPath: string): Promise<number> {
    return this.storageService.getImageSize(localPath);
  }

  /**
   * Delete local image
   */
  async deleteImage(localPath: string): Promise<void> {
    return this.storageService.deleteImage(localPath);
  }

  /**
   * Get storage service instance
   */
  getStorageService(): ImageStorageService {
    return this.storageService;
  }

  /**
   * Legacy method - now uses local storage
   * @deprecated Use processSeriesCover or processEpisodeImages instead
   */
  async processImage(imageUrl: string): Promise<string | null> {
    console.warn('⚠️ processImage is deprecated. Use processSeriesCover or processEpisodeImages instead.');
    
    // Generate a temporary ID for legacy calls
    const hash = createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
    const tempSeriesId = `temp-${hash}`;
    
    const result = await this.processSeriesCover(imageUrl, tempSeriesId);
    return result?.localPath || null;
  }
}