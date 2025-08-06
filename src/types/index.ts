export interface MangaSeries {
  id: string;
  name: string;
  description: string;
  cover: string; // CDN URL
  localCoverPath?: string; // Local file path
  coverFileSize?: number; // File size in bytes
  coverProcessedAt?: Date; // When processed
  url: string;
  sourceId: string;
  episodes: MangaEpisode[];
  lastUpdated: Date;
}

export interface MangaEpisode {
  id: string;
  seriesId: string;
  name: string;
  number: number;
  url: string;
  images: string[]; // CDN URLs
  localImagesPath?: string[]; // Local file paths
  imagesFileSizes?: { [path: string]: number }; // Path to file size mapping
  imagesProcessedAt?: Date; // When images were processed
  publishedAt: Date;
}

export interface ImageStorageResult {
  cdnUrl: string;
  localPath: string;
  fileSize: number;
  processed: boolean;
  processingError?: string;
}

export interface ImageStorageOptions {
  seriesId: string;
  episodeId?: string;
  imageIndex?: number;
  shouldUpscale?: boolean;
  shouldOptimize?: boolean;
  maxFileSize?: number; // MB
}

export interface ScrapingSource {
  id: string;
  name: string;
  domain: string;
  theme: 'themesia' | 'madara' | 'uzay';
  isActive: boolean;
  scanInterval: number; // minutes
  proxyConfig?: ProxyConfig;
  categoryFilters: {
    blacklist: string[];
    ignore: string[];
  };
}

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ScrapingTarget {
  id: string;
  name: string;
  url: string;
  type: 'wordpress' | 'custom';
  isActive: boolean;
  authConfig: any;
  sourceFilters: string[]; // source IDs to include
}

// Database types
export interface DatabaseSource {
  id: string;
  name: string;
  domain: string;
  theme: string;
  isActive: boolean | null;
  scanInterval: number | null;
  proxyConfig: unknown;
  categoryFilters: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Fastify type extensions
declare module 'fastify' {
  interface FastifyInstance {
    scrapingService: any;
    schedulerService: any;
  }
}

// Madara theme specific types
export interface Madara_Object {
  ajaxurl: string;
  nonce: string;
  [key: string]: any;
}