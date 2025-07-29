import { pgTable, varchar, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  theme: varchar('theme', { length: 50 }).notNull(),
  isActive: boolean('is_active').default(true),
  scanInterval: integer('scan_interval').default(60),
  proxyConfig: jsonb('proxy_config'),
  categoryFilters: jsonb('category_filters').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const series = pgTable('series', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  description: text('description'),
  cover: varchar('cover', { length: 1000 }),
  url: varchar('url', { length: 1000 }).notNull(),
  sourceId: varchar('source_id', { length: 255 }).references(() => sources.id),
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

export const episodes = pgTable('episodes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  seriesId: varchar('series_id', { length: 255 }).references(() => series.id),
  name: varchar('name', { length: 500 }).notNull(),
  number: integer('number').notNull(),
  url: varchar('url', { length: 1000 }).notNull(),
  images: jsonb('images').default([]),
  publishedAt: timestamp('published_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

export const targets = pgTable('targets', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  url: varchar('url', { length: 1000 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  isActive: boolean('is_active').default(true),
  authConfig: jsonb('auth_config'),
  sourceFilters: jsonb('source_filters').default([]),
  createdAt: timestamp('created_at').defaultNow()
});