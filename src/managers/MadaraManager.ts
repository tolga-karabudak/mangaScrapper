// src/managers/MadaraManager.ts - Updated with image processing and local storage
import { BaseManager } from './base/BaseManager';
import type { MangaSeries } from '../types';

export class MadaraManager extends BaseManager {
  name = 'Madara';

  async getRecentSeries(page: number): Promise<MangaSeries[]> {
    return this.getFullSeries(page, 'update');
  }

  async getFullSeries(page: number, order: string = ''): Promise<MangaSeries[]> {
    const url = `${this.source.domain}/manga?page=${page}&order=${order}`;
    const html = await this.fetchPage(url);
    const document = this.parseHTML(html);

    let selector = '.listupd a';
    let mangaCards = Array.from(document.querySelectorAll(selector));
    
    if (mangaCards.length === 0) {
      selector = '.manga .item-thumb a';
      mangaCards = Array.from(document.querySelectorAll(selector));
    }

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

    const name = document.querySelector('.post-title h1')?.textContent?.trim() ||
                  document.querySelector('h1.entry-title')?.textContent?.trim() || '';

    const description = document.querySelector('.description-summary p')?.textContent?.trim() ||
                       document.querySelector('.entry-content')?.textContent?.trim() || '';

    const coverUrl = document.querySelector('.summary_image img')?.getAttribute('data-src') ||
                     document.querySelector('.summary_image img')?.getAttribute('src') ||
                     document.querySelector('.thumb img')?.getAttribute('data-src') ||
                     document.querySelector('.thumb img')?.getAttribute('src') || '';

    const id = Array.from(document.body.classList)
                 .find(cls => cls.includes('postid-'))?.split('-')[1] ||
               document.querySelector('.bookmark')?.getAttribute('data-id') ||
               this.generateId(url);

    // Process cover image
    const coverResult = await this.processSeriesCover(coverUrl, id);

    // Get episodes
    const episodeElements = Array.from(document.querySelectorAll('.wp-manga-chapter a'));
    const episodes: MangaSeries['episodes'] = [];

    for (const element of episodeElements) {
      const episodeUrl = element.getAttribute('href') || '';
      const episodeName = element.textContent?.trim() || '';
      const number = this.extractEpisodeNumber(episodeName);

      if (number >= 0 && !isNaN(number) && episodeUrl) {
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

      const images = Array.from(document.querySelectorAll('.reading-content img'))
        .map(img => {
          return img.getAttribute('data-wpfc-original-src')?.trim() ||
                 img.getAttribute('data-src')?.trim() ||
                 img.getAttribute('src')?.trim() || '';
        })
        .filter(src => src.length > 0);

      console.log(`📖 Found ${images.length} images for episode (Madara theme)`);
      return images;
    } catch (error) {
      console.error(`Failed to get episode images for ${episodeUrl}:`, error);
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