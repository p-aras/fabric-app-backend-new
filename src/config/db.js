import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Force MySQL dialect
export const getActiveDialect = () => 'mysql';

const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

let sequelize;

if (dbUrl) {
  sequelize = new Sequelize(dbUrl, {
    dialect: 'mysql',
    logging: false,
    dialectOptions: { ssl: { rejectUnauthorized: false } },
    pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
  });
} else {
  const dbHost = process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.MYSQLPORT || process.env.DB_PORT || 3306;
  const dbUser = process.env.MYSQLUSER || process.env.DB_USER || 'root';
  const dbPassword = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '';
  const dbName = process.env.MYSQLDATABASE || process.env.DB_NAME || 'twms_db';

  const isRemote = dbHost.includes('aivencloud.com') || dbHost.includes('railway.app') || dbHost.includes('rlwy.net') || process.env.DB_SSL === 'true' || (!dbHost.includes('localhost') && !dbHost.includes('127.0.0.1'));
  const dialectOptions = isRemote ? { ssl: { rejectUnauthorized: false } } : {};

  sequelize = new Sequelize(
    dbName,
    dbUser,
    String(dbPassword).trim(),
    {
      host: dbHost,
      port: Number(dbPort),
      dialect: 'mysql',
      logging: false,
      dialectOptions,
      pool: {
        max: 20,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
    }
  );
}

export default sequelize;
