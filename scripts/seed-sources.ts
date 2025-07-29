import { db } from '../src/config/database';
import { sources } from '../src/config/schema';

const themesiaSources = [
  { name: 'Gölge Bahçesi', domain: 'https://golgebahcesi.com' },
  { name: 'Adu Manga', domain: 'https://adumanga.com' },
  { name: 'Manga Koleji', domain: 'https://mangakoleji.com' },
  { name: 'Zenith Scans', domain: 'https://zenithscans.com' },
  { name: 'Alucard Scans', domain: 'https://alucardscans.com' },
  { name: 'Arcura Fansub', domain: 'https://arcurafansub.com' },
  { name: 'Nirvana Manga', domain: 'https://nirvanamanga.com' },
  { name: 'Ayatoon', domain: 'https://ayatoon.com' }
];

const madaraSources = [
  { name: 'Hayalistic', domain: 'https://hayalistic.com.tr' },
  { name: 'Sunset Manga', domain: 'https://www.sunsetmanga.com.tr' },
  { name: 'Garcia Manga', domain: 'https://garciamanga.com' },
  { name: 'Koreli Scans', domain: 'https://koreliscans.com' },
  { name: 'Webtoon Hatti', domain: 'https://webtoonhatti.me' },
  { name: 'Webtoon TR', domain: 'https://webtoontr.net' },
  { name: 'Manga WT', domain: 'https://mangawt.com' },
  { name: 'TR Manga Oku', domain: 'https://trmangaoku.com' },
  { name: 'Ragnar Scans', domain: 'https://ragnarscans.com' }
];

const uzaySources = [
  { name: 'Uzay Manga', domain: 'https://uzaymanga.com' },
  { name: 'Elder Manga', domain: 'https://eldermanga.com' },
  { name: 'Tenshi Manga', domain: 'https://tenshimanga.com' }
];

async function seedSources() {
  console.log('🌱 Seeding sources...');

  const allSources = [
    ...themesiaSources.map(s => ({ ...s, theme: 'themesia' as const })),
    ...madaraSources.map(s => ({ ...s, theme: 'madara' as const })),
    ...uzaySources.map(s => ({ ...s, theme: 'uzay' as const }))
  ];

  for (const source of allSources) {
    try {
      const id = source.domain.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '-');
      
      await db.insert(sources).values({
        id,
        name: source.name,
        domain: source.domain,
        theme: source.theme,
        isActive: false, // Start inactive for safety
        scanInterval: 60,
        categoryFilters: { blacklist: [], ignore: [] },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`✅ Added ${source.theme} source: ${source.name}`);
    } catch (error) {
      console.log(`ℹ️ Source already exists: ${source.name}`);
    }
  }

  console.log('🎉 Seeding completed!');
  process.exit(0);
}

seedSources().catch(console.error);