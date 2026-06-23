import sequelize from './src/config/db.js';
import models from './src/models/index.js'; // imports and registers all models

async function testSync() {
  try {
    await sequelize.authenticate();
    console.log('Successfully authenticated with Sequelize.');
    
    console.log('Starting sync (force: true)...');
    await sequelize.sync({ force: true });
    console.log('Sync completed successfully!');
  } catch (err) {
    console.error('❌ Sync failed!');
    console.error('Error message:', err.message);
    if (err.parent) {
      console.error('Parent error details:', err.parent);
    }
    if (err.sql) {
      console.error('SQL query that failed:', err.sql);
    }
  } finally {
    process.exit();
  }
}

testSync();
