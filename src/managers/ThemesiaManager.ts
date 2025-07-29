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
    const cover = document.querySelector('.thumb img')?.getAttribute('src') || '';
    const id = document.querySelector('.bookmark')?.getAttribute('data-id') || this.generateId(url);

    // Get episodes
    const episodeElements = Array.from(document.querySelectorAll('#chapterlist [data-num]'));
    const episodes = episodeElements.map(episode => {
      const episodeName = episode.querySelector('.chapternum')?.textContent?.trim() || '';
      const episodeUrl = episode.querySelector('a')?.getAttribute('href') || '';
      const number = parseFloat(episode.getAttribute('data-num') || '-1');

      return {
        id: this.generateEpisodeId(episodeUrl),
        seriesId: id,
        name: episodeName,
        number,
        url: episodeUrl,
        images: [],
        publishedAt: new Date()
      };
    }).filter(ep => ep.number >= 0).reverse();

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
      return [];
    }

    // Extract images from ts_reader.run
    const jsonMatch = targetScript.textContent.match(/ts_reader\.run\((.*?)}\)/);
    if (!jsonMatch) return [];

    const imagesMatch = jsonMatch[1].match(/(?<=images":\[).*?(?=])/);
    if (!imagesMatch) return [];

    try {
      return JSON.parse(`[${imagesMatch[0]}]`) as string[];
    } catch {
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