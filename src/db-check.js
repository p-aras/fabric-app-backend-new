import { DyeingMaterial, FabricIssuance, FabricReturn, sequelize } from './models/index.js';

async function check() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');
    
    const dyeingCount = await DyeingMaterial.count();
    const issuanceCount = await FabricIssuance.count();
    const returnCount = await FabricReturn.count();
    
    console.log(`Counts -> DyeingMaterial: ${dyeingCount}, FabricIssuance: ${issuanceCount}, FabricReturn: ${returnCount}`);
    
    console.log('\n--- DyeingMaterial Records ---');
    const dyeing = await DyeingMaterial.findAll({ limit: 10 });
    dyeing.forEach(d => {
      console.log(`ID: ${d.id}, Barcode: ${d.barcodeId}, Lot: ${d.lotNumber}, Status: ${d.status}, Shade: ${d.shade}, Weight: ${d.weight}`);
    });
    
    console.log('\n--- FabricIssuance Records ---');
    const issuances = await FabricIssuance.findAll({ limit: 10 });
    issuances.forEach(i => {
      console.log(`ID: ${i.id}, IssuanceId: ${i.issuanceId}, Lot: ${i.lotNumber}, Barcodes: ${i.barcodeIds}`);
    });
    
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await sequelize.close();
  }
}

check();
