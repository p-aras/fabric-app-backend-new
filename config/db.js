import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Quote DB name to handle spaces
const dbName = `\`${process.env.DB_NAME}\``; // e.g., `Fabric Data`

const sequelize = new Sequelize(dbName, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  dialect: 'mysql',
  logging: false,
  dialectOptions: {
    charset: 'utf8mb4',
    multipleStatements: true,
  },
});

export default sequelize;
