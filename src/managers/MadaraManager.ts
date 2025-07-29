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

    let cover = document.querySelector('.summary_image img')?.getAttribute('data-src') ||
                document.querySelector('.summary_image img')?.getAttribute('src') ||
                document.querySelector('.thumb img')?.getAttribute('data-src') ||
                document.querySelector('.thumb img')?.getAttribute('src') || '';

    const id = Array.from(document.body.classList)
                 .find(cls => cls.includes('postid-'))?.split('-')[1] ||
               document.querySelector('.bookmark')?.getAttribute('data-id') ||
               this.generateId(url);

    // Get episodes
    const episodeElements = Array.from(document.querySelectorAll('.wp-manga-chapter a'));
    const episodes = episodeElements.map(element => {
      const episodeUrl = element.getAttribute('href') || '';
      const episodeName = element.textContent?.trim() || '';
      const number = this.extractEpisodeNumber(episodeName);

      return {
        id: this.generateEpisodeId(episodeUrl),
        seriesId: id,
        name: episodeName,
        number,
        url: episodeUrl,
        images: [],
        publishedAt: new Date()
      };
    }).filter(ep => ep.number >= 0 && !isNaN(ep.number)).reverse();

    return {
      id,
      name,
      description,
      cover,
      url,
      sourceId: this.source.id,
      episodes,
      lastUpdated: new Date()
    };
  }

  async getEpisodeImages(episodeUrl: string): Promise<string[]> {
    const html = await this.fetchPage(episodeUrl);
    const document = this.parseHTML(html);

    const images = Array.from(document.querySelectorAll('.reading-content img'))
      .map(img => {
        return img.getAttribute('data-wpfc-original-src')?.trim() ||
               img.getAttribute('data-src')?.trim() ||
               img.getAttribute('src')?.trim() || '';
      })
      .filter(src => src.length > 0);

    return images;
  }

  private generateId(url: string): string {
    return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
  }

  private generateEpisodeId(url: string): string {
    return url.split('/').slice(-2).join('-') || Math.random().toString(36).substr(2, 9);
  }
}