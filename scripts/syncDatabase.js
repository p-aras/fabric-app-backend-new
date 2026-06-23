import sequelize from '../src/config/db.js';
import '../src/models/index.js';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');
    await sequelize.sync({ alter: true });
    console.log('Database schemas synchronized successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during DB sync:', err);
    process.exit(1);
  }
})();
