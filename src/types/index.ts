export interface MangaSeries {
  id: string;
  name: string;
  description: string;
  cover: string;
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
  images: string[];
  publishedAt: Date;
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

// Madara theme specific types
export interface Madara_Object {
  ajaxurl: string;
  nonce: string;
  [key: string]: any;
}