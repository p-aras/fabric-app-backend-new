import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Force MySQL dialect
export const getActiveDialect = () => 'mysql';

const isAiven = process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com');
const dialectOptions = isAiven ? { ssl: { rejectUnauthorized: false } } : {};

const sequelize = new Sequelize(
  process.env.DB_NAME || 'twms_db',
  process.env.DB_USER || 'root',
  (process.env.DB_PASSWORD || '').trim(),
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;
