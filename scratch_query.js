import sequelize from './src/config/db.js';
import { FabricIssuance, DyeingMaterial, Material, Inventory } from './src/models/index.js';

async function checkData() {
  try {
    await sequelize.authenticate();
    console.log('Connected to Database.');

    const issuances = await FabricIssuance.findAll({
      limit: 10,
      order: [['id', 'DESC']]
    });

    console.log('--- RECENT FABRIC ISSUANCES ---');
    for (const iss of issuances) {
      console.log(`ID: ${iss.id}, Issuance ID: ${iss.issuanceId}, Lot Number: "${iss.lotNumber}", Job Order: "${iss.jobOrderNo}"`);
      console.log(`Barcode IDs: ${iss.barcodeIds}`);
      console.log(`Issued Items: ${iss.issuedItems}`);
      console.log('-----------------------------------');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkData();
