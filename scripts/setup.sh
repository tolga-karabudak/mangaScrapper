#!/bin/bash

echo "🚀 Setting up Manga Scraper..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
fi

# Create storage directory
mkdir -p storage/images

# Build and start services
echo "🏗️ Building and starting services..."
docker-compose up -d --build

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec app npm run db:migrate

# Insert sample sources
echo "📊 Adding sample sources..."
docker-compose exec app node -e "
const { db } = require('./dist/config/database');
const { sources } = require('./dist/config/schema');

async function addSampleSources() {
  const sampleSources = [
    {
      id: 'themesia-golgebahcesi',
      name: 'Gölge Bahçesi',
      domain: 'https://golgebahcesi.com',
      theme: 'themesia',
      isActive: true,
      scanInterval: 60,
      categoryFilters: { blacklist: [], ignore: [] }
    },
    {
      id: 'madara-hayalistic',
      name: 'Hayalistic',
      domain: 'https://hayalistic.com.tr',
      theme: 'madara',
      isActive: true,
      scanInterval: 60,
      categoryFilters: { blacklist: [], ignore: [] }
    },
    {
      id: 'uzay-uzaymanga',
      name: 'Uzay Manga',
      domain: 'https://uzaymanga.com',
      theme: 'uzay',
      isActive: true,
      scanInterval: 60,
      categoryFilters: { blacklist: [], ignore: [] }
    }
  ];

  for (const source of sampleSources) {
    try {
      await db.insert(sources).values({
        ...source,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('✅ Added source:', source.name);
    } catch (error) {
      console.log('ℹ️ Source already exists:', source.name);
    }
  }
  process.exit(0);
}

addSampleSources();
"

echo "✅ Setup complete!"
echo ""
echo "🌐 Application is running at: http://localhost:3000"
echo "🗄️ Database is running at: localhost:5432"
echo "🔄 Redis is running at: localhost:6379"
echo "📊 Redis Commander: http://localhost:8081"
echo ""
echo "📋 Available commands:"
echo "  docker-compose logs app     # View application logs"
echo "  docker-compose logs postgres # View database logs"
echo "  docker-compose down         # Stop all services"
echo "  docker-compose up -d        # Start all services"
