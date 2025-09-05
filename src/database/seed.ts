import { sequelize, logger } from '../config/database';
import Trend from '../models/Trend';

const sampleTrends = [
  {
    source: 'Sample Data',
    hashtag: '#TechTrends2024',
    popularity: 'High',
    category: 'Technology',
    platform: 'TikTok',
    region: 'Global',
    aiInsights: 'Technology trends continue to dominate social platforms with AI and automation being key drivers',
    sentiment: 'positive' as const,
    predictedGrowth: 'increasing' as const,
    businessOpportunities: ['AI consultancy services', 'Tech education platforms', 'Automation tools'],
    relatedTrends: ['#AIRevolution', '#AutomationFuture'],
    confidence: 0.85,
    scrapedAt: new Date()
  },
  {
    source: 'Sample Data',
    hashtag: '#SustainableLiving',
    popularity: 'Medium',
    category: 'Lifestyle',
    platform: 'Pinterest',
    region: 'North America',
    aiInsights: 'Growing awareness of environmental issues driving sustainable lifestyle trends',
    sentiment: 'positive' as const,
    predictedGrowth: 'stable' as const,
    businessOpportunities: ['Eco-friendly products', 'Sustainable fashion', 'Green energy solutions'],
    relatedTrends: ['#ZeroWaste', '#EcoFriendly'],
    confidence: 0.78,
    scrapedAt: new Date()
  },
  {
    source: 'Sample Data',
    hashtag: '#RemoteWorkLife',
    popularity: 'High',
    category: 'Business',
    platform: 'Twitter/X',
    region: 'Global',
    aiInsights: 'Remote work culture continues to evolve with new tools and methodologies emerging',
    sentiment: 'neutral' as const,
    predictedGrowth: 'stable' as const,
    businessOpportunities: ['Productivity software', 'Virtual collaboration tools', 'Remote team building'],
    relatedTrends: ['#DigitalNomad', '#WorkFromAnywhere'],
    confidence: 0.72,
    scrapedAt: new Date()
  }
];

async function seedDatabase(): Promise<void> {
  try {
    logger.info('Starting database seeding...');

    await sequelize.authenticate();
    logger.info('Database connection established');

    const existingTrends = await Trend.count();
    if (existingTrends > 0) {
      logger.info(`Database already contains ${existingTrends} trends. Skipping seed.`);
      return;
    }

    const createdTrends = await Trend.bulkCreate(sampleTrends);
    logger.info(`Successfully seeded ${createdTrends.length} sample trends`);

    await sequelize.close();
    logger.info('Database seeding completed');

  } catch (error) {
    logger.error('Database seeding failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

export { seedDatabase };