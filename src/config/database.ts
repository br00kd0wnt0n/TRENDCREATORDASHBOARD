import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} ${level}: ${message}${stack ? '\n' + stack : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

const isRailwayConnection = process.env.DATABASE_URL?.includes('.rlwy.net') || process.env.POSTGRES_HOST?.includes('.rlwy.net');
const requiresSSL = process.env.NODE_ENV === 'production' || isRailwayConnection;

const sequelize = new Sequelize(
  process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DATABASE || 'trend_tracker'}`,
  {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' && !isRailwayConnection ? 
      (msg: string) => logger.debug(msg) : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: requiresSSL ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {}
  }
);

export const testConnection = async (): Promise<boolean> => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    return false;
  }
};

export { sequelize, logger };