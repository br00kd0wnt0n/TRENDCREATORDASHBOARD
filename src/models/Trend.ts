import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface TrendAttributes {
  id: string;
  source: string;
  hashtag?: string;
  popularity?: string;
  category?: string;
  platform?: string;
  region?: string;
  aiInsights?: string;
  sentiment?: string;
  predictedGrowth?: string;
  businessOpportunities?: string[];
  relatedTrends?: string[];
  confidence?: number;
  metadata?: Record<string, any>;
  scrapedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TrendCreationAttributes extends Optional<TrendAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class Trend extends Model<TrendAttributes, TrendCreationAttributes> implements TrendAttributes {
  public id!: string;
  public source!: string;
  public hashtag?: string;
  public popularity?: string;
  public category?: string;
  public platform?: string;
  public region?: string;
  public aiInsights?: string;
  public sentiment?: string;
  public predictedGrowth?: string;
  public businessOpportunities?: string[];
  public relatedTrends?: string[];
  public confidence?: number;
  public metadata?: Record<string, any>;
  public scrapedAt!: Date;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Trend.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    hashtag: {
      type: DataTypes.STRING,
      allowNull: true
    },
    popularity: {
      type: DataTypes.STRING,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aiInsights: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sentiment: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    predictedGrowth: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    businessOpportunities: {
      type: DataTypes.JSON,
      allowNull: true
    },
    relatedTrends: {
      type: DataTypes.JSON,
      allowNull: true
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      validate: {
        min: 0,
        max: 1
      }
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    scrapedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'Trend',
    tableName: 'trends',
    timestamps: true,
    indexes: [
      { fields: ['scrapedAt'] },
      { fields: ['source'] },
      { fields: ['hashtag', 'platform'] }
    ]
  }
);

export default Trend;