-- Initialize Ralph Loves Trends Database
-- This script creates the initial database structure

\echo 'Creating Ralph Loves Trends database...'

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types
DO $$ BEGIN
    CREATE TYPE sentiment_type AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE growth_type AS ENUM ('increasing', 'stable', 'declining');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create trends table if it doesn't exist
CREATE TABLE IF NOT EXISTS trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(255) NOT NULL,
    hashtag VARCHAR(255),
    popularity VARCHAR(255),
    category VARCHAR(255),
    platform VARCHAR(100),
    region VARCHAR(100),
    ai_insights TEXT,
    sentiment sentiment_type,
    predicted_growth growth_type,
    business_opportunities JSON,
    related_trends JSON,
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSON,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trends_scraped_at ON trends(scraped_at);
CREATE INDEX IF NOT EXISTS idx_trends_platform ON trends(platform);
CREATE INDEX IF NOT EXISTS idx_trends_category ON trends(category);
CREATE INDEX IF NOT EXISTS idx_trends_hashtag ON trends USING GIN(hashtag gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trends_platform_hashtag ON trends(platform, hashtag);
CREATE INDEX IF NOT EXISTS idx_trends_sentiment ON trends(sentiment);
CREATE INDEX IF NOT EXISTS idx_trends_confidence ON trends(confidence);
CREATE INDEX IF NOT EXISTS idx_trends_source ON trends(source);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_trends_updated_at ON trends;
CREATE TRIGGER update_trends_updated_at
    BEFORE UPDATE ON trends
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

\echo 'Database initialization complete!'