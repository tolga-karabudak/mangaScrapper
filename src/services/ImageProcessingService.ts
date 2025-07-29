import sharp from 'sharp';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export class ImageProcessingService {
  private storageDir: string;

  constructor() {
    this.storageDir = join(process.cwd(), 'storage', 'images');
    this.ensureStorageDir();
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
    }
  }

  async processImage(imageUrl: string): Promise<string | null> {
    try {
      // Download image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      const { width = 0, height = 0 } = metadata;

      // Determine processing strategy
      let processedBuffer: Buffer;
      
      if (width < 800 || height < 600) {
        // Upscale small images
        processedBuffer = await sharp(buffer)
          .resize(width * 2, height * 2, {
            kernel: sharp.kernel.lanczos3
          })
          .webp({ quality: 85 })
          .toBuffer();
      } else {
        // Optimize larger images
        processedBuffer = await sharp(buffer)
          .webp({ quality: 80 })
          .toBuffer();
      }

      // Generate filename
      const hash = createHash('md5').update(buffer).digest('hex');
      const filename = `${hash}.webp`;
      const filepath = join(this.storageDir, filename);

      // Save processed image
      await writeFile(filepath, processedBuffer);

      // Return relative path for database storage
      return `/storage/images/${filename}`;

    } catch (error) {
      console.error(`Error processing image ${imageUrl}:`, error);
      return null;
    }
  }

  async getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null> {
    try {
      const metadata = await sharp(imagePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      console.error(`Error getting image dimensions for ${imagePath}:`, error);
      return null;
    }
  }
}