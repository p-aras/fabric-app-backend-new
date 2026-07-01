import sequelize from '../src/config/db.js';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const [materialsRes] = await sequelize.query('SHOW CREATE TABLE Materials');
    console.log('=== Materials ===');
    console.log(materialsRes[0]['Create Table']);

    const [dyeingRes] = await sequelize.query('SHOW CREATE TABLE DyeingMaterials');
    console.log('=== DyeingMaterials ===');
    console.log(dyeingRes[0]['Create Table']);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
