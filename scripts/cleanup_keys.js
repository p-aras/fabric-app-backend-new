import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function cleanup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: (process.env.DB_PASSWORD || '').trim(),
    database: process.env.DB_NAME || 'FabricData'
  });

  try {
    console.log('Fetching indexes for Users table...');
    const [indexes] = await connection.query('SHOW INDEX FROM `Users`');
    console.log(`Found ${indexes.length} indexes.`);

    // Group indexes by Key_name
    const keys = {};
    for (const idx of indexes) {
      keys[idx.Key_name] = idx;
    }

    console.log('Active key names:', Object.keys(keys));

    // Drop duplicate email keys (usually email, email_2, email_3, etc.)
    for (const keyName of Object.keys(keys)) {
      if (keyName.startsWith('email') && keyName !== 'PRIMARY') {
        try {
          console.log(`Dropping index ${keyName}...`);
          await connection.query(`ALTER TABLE \`Users\` DROP INDEX \`${keyName}\``);
          console.log(`Successfully dropped ${keyName}`);
        } catch (e) {
          console.error(`Failed to drop index ${keyName}:`, e.message);
        }
      }
    }

    console.log('Cleanup complete!');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await connection.end();
  }
}

cleanup();
