import { ScrapingService } from '../src/services/ScrapingService';
import { db } from '../src/config/database';
import { sources } from '../src/config/schema';
import { eq } from 'drizzle-orm';

async function testScraping() {
  const scrapingService = new ScrapingService();
  
  console.log('🧪 Starting scraping test...');

  // Get a test source
  const testSources = await db.select()
    .from(sources)
    .where(eq(sources.isActive, true))
    .limit(1);

  if (testSources.length === 0) {
    console.log('❌ No active sources found. Please activate a source first.');
    return;
  }

  const testSource = testSources[0];
  console.log(`📖 Testing with source: ${testSource.name}`);

  try {
    // Start a test scraping job
    await scrapingService.startScrapingForSource(testSource.id, 'recent');
    console.log('✅ Test job queued successfully');

    // Monitor queue status
    setInterval(async () => {
      const status = await scrapingService.getQueueStatus();
      console.log('📊 Queue status:', status);
      
      if (status.active === 0 && status.waiting === 0) {
        console.log('🎉 Test completed!');
        process.exit(0);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testScraping();