import sequelize from './src/config/db.js';
import { DyeingMaterial, Material, Inventory } from './src/models/index.js';

async function checkData() {
  try {
    await sequelize.authenticate();
    console.log('Connected to Database.');

    const dms = await DyeingMaterial.findAll({ limit: 5 });
    console.log('--- DYEING MATERIALS ---');
    dms.forEach(dm => {
      console.log(`Barcode: ${dm.barcodeId}, Unit: ${dm.unit}, Status: ${dm.status}, Shade: ${dm.shade}, Lot: ${dm.lotNumber}, Fabric: ${dm.fabricName}`);
    });

    const invs = await Inventory.findAll({ limit: 5 });
    console.log('--- INVENTORY ROLLS ---');
    invs.forEach(inv => {
      console.log(`Barcode: ${inv.barcode}, Unit: ${inv.unit}, Status: ${inv.bal_wt}, Shade: ${inv.shade}, Lot: ${inv.lot_no}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkData();
