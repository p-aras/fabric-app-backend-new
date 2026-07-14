import sequelize from './src/config/db.js';
import { Material, DyeingMaterial } from './src/models/index.js';
import { Op } from 'sequelize';

async function test() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB.');
    
    const materials = await Material.findAll({
      where: {
        code: {
          [Op.like]: '9%'
        }
      }
    });
    console.log(`Found ${materials.length} Materials starting with 9:`);
    materials.forEach(m => {
      console.log(`- Code: ${m.code}, Name: ${m.name}, Lot: ${m.lotNo}, Location: ${m.location}`);
    });

    const dyeing = await DyeingMaterial.findAll({
      where: {
        barcodeId: {
          [Op.like]: '9%'
        }
      }
    });
    console.log(`Found ${dyeing.length} DyeingMaterials starting with 9:`);
    dyeing.forEach(d => {
      console.log(`- BarcodeId: ${d.barcodeId}, Lot: ${d.lotNumber}`);
    });
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit();
  }
}
test();
