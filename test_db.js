import sequelize from './src/config/db.js';
import { DyeingMaterial } from './src/models/index.js';

async function test() {
  try {
    await sequelize.authenticate();
    console.log('Connected.');
    const count = await DyeingMaterial.count();
    console.log('DyeingMaterial count:', count);
    
    // Let's print table columns from mysql
    const [results] = await sequelize.query("SHOW COLUMNS FROM `DyeingMaterials`;");
    console.log('Columns:');
    results.forEach(r => console.log(r.Field, r.Type));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}
test();
