// src/services/ImageStorageService.ts
import { createHash } from 'crypto';
import { mkdir, writeFile, access, stat, unlink } from 'fs/promises';
import { join, extname, dirname, resolve } from 'path';
import sharp from 'sharp';
import type { ImageStorageResult, ImageStorageOptions } from '../types';

export class ImageStorageService {
  private storageDir: string;
  private maxFileSizeMB: number;

  constructor() {
    // Use environment variable or fallback to default
    const storagePath = process.env.STORAGE_PATH || './storage';
    
    // Handle Windows paths properly
    if (process.platform === 'win32' && storagePath.includes('\\')) {
      this.storageDir = resolve(storagePath, 'images');
    } else {
      this.storageDir = join(storagePath, 'images');
    }
    
    this.maxFileSizeMB = 10; // Maximum 10MB per image
    this.ensureStorageDir();
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await mkdir(this.storageDir, { recursive: true });
      console.log(`📁 Storage directory ensured: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ Error creating storage directory:', error);
    }
  }

  /**
   * Get storage directory info
   */
  getStorageInfo(): { path: string; platform: string } {
    return {
      path: this.storageDir,
      platform: process.platform
    };
  }

  /**
   * Get local image path for serving
   */
  getLocalImagePath(relativePath: string): string {
    return join(this.storageDir, relativePath);
  }

  /**
   * Check if local image exists
   */
  async imageExists(relativePath: string): Promise<boolean> {
    const fullPath = this.getLocalImagePath(relativePath);
    return this.fileExists(fullPath);
  }

  /**
   * Get image file size
   */
  async getImageSize(relativePath: string): Promise<number> {
    const fullPath = this.getLocalImagePath(relativePath);
    return this.getFileSize(fullPath);
  }

  /**
   * Delete local image
   */
  async deleteImage(relativePath: string): Promise<void> {
    const fullPath = this.getLocalImagePath(relativePath);
    try {
      await unlink(fullPath);
      console.log(`🗑️ Deleted image: ${relativePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Download and store series cover image
   */
  async storeSeriesCover(
    imageUrl: string, 
    seriesId: string, 
    options: Partial<ImageStorageOptions> = {}
  ): Promise<ImageStorageResult> {
    const seriesDir = join(this.storageDir, 'series', seriesId);
    await mkdir(seriesDir, { recursive: true });

    const fileName = `cover.webp`;
    const localPath = join(seriesDir, fileName);
    
    // Use forward slashes for relative paths regardless of platform
    const relativePath = `series/${seriesId}/${fileName}`;

    return this.downloadAndProcessImage(imageUrl, localPath, relativePath, {
      seriesId,
      shouldOptimize: true,
      shouldUpscale: options.shouldUpscale ?? false,
      ...options
    });
  }

  /**
   * Download and store episode images
   */
  async storeEpisodeImages(
    imageUrls: string[], 
    seriesId: string, 
    episodeId: string,
    options: Partial<ImageStorageOptions> = {}
  ): Promise<ImageStorageResult[]> {
    const episodeDir = join(this.storageDir, 'series', seriesId, 'episodes', episodeId);
    await mkdir(episodeDir, { recursive: true });

    const results: ImageStorageResult[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      const fileName = `${String(i + 1).padStart(3, '0')}.webp`; // 001.webp, 002.webp, etc.
      const localPath = join(episodeDir, fileName);
      
      // Use forward slashes for relative paths regardless of platform
      const relativePath = `series/${seriesId}/episodes/${episodeId}/${fileName}`;

      try {
        const result = await this.downloadAndProcessImage(imageUrl, localPath, relativePath, {
          seriesId,
          episodeId,
          imageIndex: i,
          shouldOptimize: true,
          shouldUpscale: options.shouldUpscale ?? true, // Episode images usually need upscaling
          ...options
        });
        results.push(result);
      } catch (error) {
        console.error(`❌ Failed to process image ${i + 1}/${imageUrls.length} for episode ${episodeId}:`, error);
        results.push({
          cdnUrl: imageUrl,
          localPath: relativePath,
          fileSize: 0,
          processed: false,
          processingError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Core image download and processing function
   */
  private async downloadAndProcessImage(
    imageUrl: string,
    fullLocalPath: string,
    relativePath: string,
    options: ImageStorageOptions
  ): Promise<ImageStorageResult> {
    try {
      // Check if file already exists
      if (await this.fileExists(fullLocalPath)) {
        const existingSize = await this.getFileSize(fullLocalPath);
        console.log(`🔄 Image already exists: ${relativePath} (${this.formatFileSize(existingSize)})`);
        return {
          cdnUrl: imageUrl,
          localPath: relativePath,
          fileSize: existingSize,
          processed: true
        };
      }

      // Download image
      console.log(`⬇️ Downloading image: ${imageUrl}`);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Check file size before processing
      const originalSizeMB = buffer.length / (1024 * 1024);
      if (originalSizeMB > this.maxFileSizeMB) {
        throw new Error(`Image too large: ${originalSizeMB.toFixed(2)}MB > ${this.maxFileSizeMB}MB`);
      }

      // Process image with Sharp
      const processedBuffer = await this.processImageBuffer(buffer, options);

      // Save to local storage
      await writeFile(fullLocalPath, processedBuffer);
      const finalSize = processedBuffer.length;

      console.log(`✅ Image stored: ${relativePath} (${this.formatFileSize(finalSize)})`);
      
      return {
        cdnUrl: imageUrl,
        localPath: relativePath,
        fileSize: finalSize,
        processed: true
      };

    } catch (error) {
      console.error(`❌ Error processing image ${imageUrl}:`, error);
      throw error;
    }
  }

  /**
   * Process image buffer with Sharp
   */
  private async processImageBuffer(
    buffer: Buffer, 
    options: ImageStorageOptions
  ): Promise<Buffer> {
    let processor = sharp(buffer);
    const metadata = await processor.metadata();
    const { width = 0, height = 0 } = metadata;

    console.log(`📊 Original image: ${width}x${height}`);

    // Upscale if image is too small
    if (options.shouldUpscale && (width < 800 || height < 600)) {
      const scale = Math.max(800 / width, 600 / height);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);
      
      processor = processor.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false
      });
      
      console.log(`🔍 Upscaled to: ${newWidth}x${newHeight}`);
    }

    // Always convert to WebP for optimization
    processor = processor.webp({ 
      quality: options.shouldOptimize ? 80 : 95,
      effort: 4 // Good balance between compression and speed
    });

    return await processor.toBuffer();
  }

  /**
   * Clean up orphaned images (images without database records)
   */
  async cleanupOrphanedImages(): Promise<{ deletedCount: number; freedSpace: number }> {
    // This would require database integration to check which images are orphaned
    // Implementation can be added later when needed
    console.log('🧹 Cleanup orphaned images - Not implemented yet');
    return { deletedCount: 0, freedSpace: 0 };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    averageSize: number;
  }> {
    // Implementation for storage stats
    // Can be added later for dashboard
    return {
      totalImages: 0,
      totalSize: 0,
      averageSize: 0
    };
  }

  // Utility functions
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async getFileSize(path: string): Promise<number> {
    try {
      const stats = await stat(path);
      return stats.size;
    } catch {
      return 0;
    }
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}