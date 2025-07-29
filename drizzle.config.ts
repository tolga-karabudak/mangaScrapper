import type { Config } from 'drizzle-kit';

export default {
  schema: './src/config/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/manga_scraper',
  },
} satisfies Config;