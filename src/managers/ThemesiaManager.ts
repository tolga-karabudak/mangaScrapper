// src/managers/ThemesiaManager.ts - Updated with image processing and local storage
import { BaseManager } from './base/BaseManager';
import type { MangaSeries } from '../types';

export class ThemesiaManager extends BaseManager {
  name = 'Themesia';

  async getRecentSeries(page: number): Promise<MangaSeries[]> {
    return this.getFullSeries(page, 'update');
  }

  async getFullSeries(page: number, order: string = ''): Promise<MangaSeries[]> {
    const path = this.source.domain.includes('mangakazani') ? '/seriler' : '/manga';
    const url = `${this.source.domain}${path}/?page=${page}&order=${order}`;
    
    const html = await this.fetchPage(url);
    const document = this.parseHTML(html);
    
    const mangaCards = Array.from(document.querySelectorAll('.bsx a'));
    const series: MangaSeries[] = [];

    for (const card of mangaCards) {
      const href = card.getAttribute('href');
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
    const description = document.querySelector('[itemprop="description"] p')?.textContent?.trim() || '';
    const coverUrl = document.querySelector('.thumb img')?.getAttribute('src') || '';
    const id = document.querySelector('.bookmark')?.getAttribute('data-id') || this.generateId(url);

    // Process cover image
    const coverResult = await this.processSeriesCover(coverUrl, id);

    // Get episodes
    const episodeElements = Array.from(document.querySelectorAll('#chapterlist [data-num]'));
    const episodes: MangaSeries['episodes'] = [];

    for (const episode of episodeElements) {
      const episodeName = episode.querySelector('.chapternum')?.textContent?.trim() || '';
      const episodeUrl = episode.querySelector('a')?.getAttribute('href') || '';
      const number = parseFloat(episode.getAttribute('data-num') || '-1');

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
    const html = await this.fetchPage(episodeUrl);
    const document = this.parseHTML(html);

    // Look for the script containing ts_reader.run
    const scripts = Array.from(document.querySelectorAll('body script:not([src]):not([id]):not([class])'));
    let targetScript = scripts.find(script => script.textContent?.includes('ts_reader.run'));
    
    if (!targetScript) {
      // Check for base64 encoded scripts
      const base64Scripts = Array.from(document.querySelectorAll('script'))
        .filter(s => s.getAttribute('src')?.includes('base64'))
        .map(s => {
          const src = s.getAttribute('src');
          if (src) {
            try {
              return atob(src.split('base64,')[1]);
            } catch {
              return '';
            }
          }
          return '';
        })
        .find(content => content.includes('ts_reader.run'));

      if (base64Scripts) {
        targetScript = { textContent: base64Scripts } as any;
      }
    }

    if (!targetScript?.textContent) {
      console.warn(`No images found for episode: ${episodeUrl}`);
      return [];
    }

    // Extract images from ts_reader.run
    const jsonMatch = targetScript.textContent.match(/ts_reader\.run\((.*?)}\)/);
    if (!jsonMatch) return [];

    const imagesMatch = jsonMatch[1].match(/(?<=images":\[).*?(?=])/);
    if (!imagesMatch) return [];

    try {
      const images = JSON.parse(`[${imagesMatch[0]}]`) as string[];
      console.log(`📖 Found ${images.length} images for episode`);
      return images;
    } catch (error) {
      console.error('Failed to parse episode images:', error);
      return [];
    }
  }

  private generateId(url: string): string {
    return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
  }

  private generateEpisodeId(url: string): string {
    return url.split('/').slice(-2).join('-') || Math.random().toString(36).substr(2, 9);
  }
}