// src/managers/UzayManager.ts - Updated with image processing and local storage
import { BaseManager } from './base/BaseManager';
import type { MangaSeries } from '../types';

export class UzayManager extends BaseManager {
  name = 'Uzay';

  async getRecentSeries(page: number): Promise<MangaSeries[]> {
    return this.getFullSeries(page);
  }

  async getFullSeries(page: number): Promise<MangaSeries[]> {
    const url = `${this.source.domain}/?page=${page}`;
    const html = await this.fetchPage(url);
    const document = this.parseHTML(html);

    const mangaCards = Array.from(document.querySelectorAll('.grid.overflow-hidden:not(.justify-center) > div > a'));
    const series: MangaSeries[] = [];

    for (const card of mangaCards) {
      const href = this.remapHref(card.getAttribute('href') || '');
      if (href) {
        try {
          const seriesData = await this.getSeriesData(href);
          series.push(seriesData);
        } catch (error) {
          console.error(`Error fetching series data for ${href}:`, error);
        }
      }
    }

    console.log(`Found ${series.length} series on page ${page}`);
    return series;
  }

  async getSeriesData(url: string): Promise<MangaSeries> {
    const html = await this.fetchPage(url);
    const document = this.parseHTML(html);

    const name = document.querySelector('h1')?.textContent?.trim() || '';
    const description = document.querySelector('.summary p')?.textContent?.trim() || '';
    const coverUrl = document.querySelector('.content-info img')?.getAttribute('src') || '';
    const id = url.split('/manga/')[1]?.split('/')[0] || this.generateId(url);

    // Process cover image
    const coverResult = await this.processSeriesCover(coverUrl, id);

    // Get episodes
    const episodeElements = Array.from(document.querySelectorAll('.list-episode a'));
    const episodes: MangaSeries['episodes'] = [];

    for (const element of episodeElements) {
      const episodeName = element.querySelector('.chapternum b')?.textContent?.trim() || '';
      const episodeUrl = this.remapHref(element.getAttribute('href') || '');
      const number = this.extractEpisodeNumber(episodeName);

      if (number >= 0 && episodeUrl) {
        // Get episode images
        const imageUrls = await this.getEpisodeImages(episodeUrl);
        
        // Process episode images
        const episodeId = this.generateEpisodeId(episodeUrl);
        const imageResult = await this.processEpisodeImages(imageUrls, id, episodeId);

        episodes.push({
          id: episodeId,
          seriesId: id,
          name: episodeName,
          number,
          url: episodeUrl,
          images: imageResult.cdnUrls,
          localImagesPath: imageResult.localPaths,
          imagesFileSizes: imageResult.fileSizes,
          imagesProcessedAt: imageResult.localPaths.length > 0 ? new Date() : undefined,
          publishedAt: new Date()
        });
      }
    }

    return {
      id,
      name,
      description,
      cover: coverResult.cdnUrl,
      localCoverPath: coverResult.localPath,
      coverFileSize: coverResult.fileSize,
      coverProcessedAt: coverResult.localPath ? new Date() : undefined,
      url,
      sourceId: this.source.id,
      episodes: episodes.reverse(),
      lastUpdated: new Date()
    };
  }

  async getEpisodeImages(episodeUrl: string): Promise<string[]> {
    try {
      const html = await this.fetchPage(episodeUrl);
      const document = this.parseHTML(html);

      const scripts = Array.from(document.querySelectorAll('script'));
      const targetScript = scripts.find(script => 
        script.textContent?.includes('series_items')
      )?.textContent?.replaceAll('\\"', '"');

      if (!targetScript) {
        console.warn(`No series_items script found for: ${episodeUrl}`);
        return [];
      }

      const regex = /(?<=series_items":\[).*?(?=])/g;
      const match = targetScript.match(regex);
      
      if (!match) {
        console.warn(`No series_items data found for: ${episodeUrl}`);
        return [];
      }

      const sources = JSON.parse("[" + match[0] + "]");
      
      if (sources.length < 2) {
        console.warn(`Insufficient images found for: ${episodeUrl}`);
        return [];
      }

      const images = sources.map((source: any) => {
        if (typeof source === 'string') return source;
        if (source.path?.includes('https://')) return source.path;
        return `https://cdn1.uzaymanga.com/upload/series/${source.path}`;
      }).filter((url: string) => url && url.length > 0);

      console.log(`📖 Found ${images.length} images for episode (Uzay theme)`);
      return images;
    } catch (error) {
      console.error(`Failed to get episode images for ${episodeUrl}:`, error);
      return [];
    }
  }

  private remapHref(href: string): string {
    if (!href) return '';
    if (href.startsWith('/')) {
      return this.source.domain + href;
    }
    return href;
  }

  private generateId(url: string): string {
    return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
  }

  private generateEpisodeId(url: string): string {
    return url.split('/').slice(-2).join('-') || Math.random().toString(36).substr(2, 9);
  }
}