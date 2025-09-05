-- Initialize Ralph Loves Trends Database
-- This script creates the initial database structure

\echo 'Creating Ralph Loves Trends database...'

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Sequelize will create the trends table with proper types

-- Indexes and triggers will be created by Sequelize

\echo 'Database initialization complete!'