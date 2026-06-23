import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: (process.env.DB_PASSWORD || '').trim(),
    database: process.env.DB_NAME || 'FabricData'
  });

  try {
    console.log('Checking Materials table columns...');
    const [columns] = await connection.query('SHOW COLUMNS FROM `Materials`');
    const hasLotNo = columns.some(col => col.Field === 'lotNo');

    if (!hasLotNo) {
      console.log('Adding lotNo column to Materials table...');
      await connection.query('ALTER TABLE `Materials` ADD COLUMN `lotNo` VARCHAR(50) NULL');
      console.log('lotNo column added successfully!');
    } else {
      console.log('lotNo column already exists on Materials table.');
    }
  } catch (err) {
    console.error('Error altering table:', err);
  } finally {
    await connection.end();
  }
}

run();
