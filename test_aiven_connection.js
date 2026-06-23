import mysql from 'mysql2/promise';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('--- Aiven Connection Test ---');
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('-----------------------------');

  const isAiven = process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com');
  
  // 1. Test raw connection with mysql2
  console.log('\nTesting raw connection with mysql2...');
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: (process.env.DB_PASSWORD || '').trim(),
      ssl: isAiven ? { rejectUnauthorized: false } : undefined,
    });
    console.log('✅ mysql2 connection test successful!');
    
    // Check if database exists / can query
    const [rows] = await connection.query(`SHOW DATABASES LIKE '${process.env.DB_NAME || 'twms_db'}';`);
    if (rows.length > 0) {
      console.log(`✅ Database "${process.env.DB_NAME || 'twms_db'}" exists on the server.`);
    } else {
      console.log(`⚠️ Database "${process.env.DB_NAME || 'twms_db'}" does not exist yet.`);
    }
    
    await connection.end();
  } catch (err) {
    console.error('❌ mysql2 connection test failed!');
    console.error('Error details:', err.message);
  }

  // 2. Test connection with Sequelize
  console.log('\nTesting Sequelize connection...');
  try {
    const sequelize = new Sequelize(
      process.env.DB_NAME || 'twms_db',
      process.env.DB_USER || 'root',
      (process.env.DB_PASSWORD || '').trim(),
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        dialect: 'mysql',
        logging: false,
        dialectOptions: isAiven ? { ssl: { rejectUnauthorized: false } } : {},
      }
    );

    await sequelize.authenticate();
    console.log('✅ Sequelize connection/authentication successful!');
    
    await sequelize.close();
  } catch (err) {
    console.error('❌ Sequelize connection test failed!');
    console.error('Error details:', err.message);
  }
}

testConnection();
