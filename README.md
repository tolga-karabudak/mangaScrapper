# Manga Scraper v2

Modern manga scraping system built with Playwright, TypeScript, and PostgreSQL.

## Features

- **Multi-theme Support**: Themesia, Madara, and Uzay themes
- **Playwright Integration**: Fast and reliable web scraping
- **Queue System**: BullMQ for job management
- **Image Processing**: Automatic optimization with Sharp
- **Scheduled Scraping**: Configurable intervals per source
- **REST API**: Complete management interface
- **Docker Support**: Easy deployment and scaling

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd manga-scraper-v2
```

2. Run the setup script:
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

3. The application will be available at:
   - API: http://localhost:3000
   - Redis Commander: http://localhost:8081

### Manual Setup (Development)

1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL and Redis:
```bash
docker-compose up -d postgres redis
```

3. Create and configure `.env` file:
```bash
cp .env.example .env
```

4. Run database migrations:
```bash
npm run db:migrate
```

5. Start the application:
```bash
npm run dev
```

## API Endpoints

### Sources Management
- `GET /api/sources` - List all sources
- `POST /api/sources` - Create new source
- `PUT /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Delete source
- `POST /api/sources/:id/test` - Test source scraping

### Series Management
- `GET /api/series` - List series with pagination
- `GET /api/series/:id` - Get series with episodes
- `DELETE /api/series/:id` - Delete series

### Scraping Control
- `POST /api/scraping/start/:sourceId` - Start scraping
- `GET /api/scraping/queue/status` - Get queue status
- `POST /api/scraping/series` - Manual series scraping
- `POST /api/scraping/episode` - Manual episode scraping

### Dashboard
- `GET /api/dashboard/stats` - System statistics
- `GET /api/dashboard/recent-series` - Recent series
- `GET /api/dashboard/logs` - System logs

## Configuration

### Source Configuration

```json
{
  "id": "unique-source-id",
  "name": "Source Name",
  "domain": "https://example.com",
  "theme": "themesia|madara|uzay",
  "isActive": true,
  "scanInterval": 60,
  "proxyConfig": {
    "host": "proxy.example.com",
    "port": 8080,
    "username": "user",
    "password": "pass"
  },
  "categoryFilters": {
    "blacklist": ["adult", "mature"],
    "ignore": ["completed"]
  }
}
```

### Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:port/database
REDIS_URL=redis://host:port
STORAGE_PATH=./storage
WEBP_QUALITY=80
CONCURRENT_SCRAPERS=3
```

## Development

### Adding New Themes

1. Create a new manager class extending `BaseManager`:

```typescript
import { BaseManager } from './base/BaseManager';

export class CustomThemeManager extends BaseManager {
  name = 'CustomTheme';
  
  async getRecentSeries(page: number): Promise<MangaSeries[]> {
    // Implementation
  }
  
  // Implement other required methods
}
```

2. Register the theme in `ScrapingService`:

```typescript
private createManager(source: ScrapingSource): BaseManager {
  switch (source.theme) {
    case 'custom':
      return new CustomThemeManager(source);
    // Other cases...
  }
}
```

### Testing

```bash
# Test a specific source
npm run test:scraping

# Run unit tests
npm test

# Run integration tests
npm run test:integration
```

## Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale scrapers
docker-compose up -d --scale app=3

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

## Monitoring

### Queue Monitoring
Access Redis Commander at http://localhost:8081 to monitor:
- Active jobs
- Failed jobs
- Job statistics
- Queue health

### Database Monitoring
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres manga_scraper

# View series count
SELECT COUNT(*) FROM series;

# View recent activity
SELECT * FROM series ORDER BY created_at DESC LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Playwright Browser Issues**:
```bash
# Reinstall browsers
docker-compose exec app npx playwright install chromium
```

2. **Database Connection Issues**:
```bash
# Check PostgreSQL status
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d
```

3. **Queue Not Processing**:
```bash
# Check Redis status
docker-compose logs redis

# Restart application
docker-compose restart app
```

### Logs

```bash
# Application logs
docker-compose logs -f app

# Database logs
docker-compose logs -f postgres

# All services
docker-compose logs -f
```

## Performance Optimization

### Scaling
- Increase `CONCURRENT_SCRAPERS` for more parallel processing
- Scale application containers: `docker-compose up -d --scale app=3`
- Use Redis Cluster for large-scale deployments

### Image Processing
- Adjust `WEBP_QUALITY` for size vs quality balance
- Monitor storage disk space
- Implement CDN for image delivery

### Database
- Add indexes for frequently queried fields
- Implement database connection pooling
- Regular maintenance and vacuum operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.