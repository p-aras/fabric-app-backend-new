import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'twms_db',
  process.env.DB_USER || 'root',
  (process.env.DB_PASSWORD || '').trim(),
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com') ? { ssl: { rejectUnauthorized: false } } : {},
  }
);

async function check() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected!');

    const [tables] = await sequelize.query('SHOW TABLES');
    console.log('Tables in database:', tables);

    // Try uppercase
    try {
      const [cols] = await sequelize.query('DESCRIBE `Materials`');
      console.log('Columns in Materials (Uppercase):', cols.map(c => c.Field));
    } catch (e) {
      console.log('Materials (Uppercase) DESCRIBE failed:', e.message);
    }

    // Try lowercase
    try {
      const [cols] = await sequelize.query('DESCRIBE `materials`');
      console.log('Columns in materials (Lowercase):', cols.map(c => c.Field));
    } catch (e) {
      console.log('materials (Lowercase) DESCRIBE failed:', e.message);
    }

  } catch (err) {
    console.error('Database connection error:', err.message);
  } finally {
    await sequelize.close();
  }
}

check();
