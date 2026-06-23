import { FabricIssuance, DyeingMaterial, Material, Inventory } from './src/models/index.js';

async function check() {
  try {
    const lotNumber = '11030';
    console.log('--- FabricIssuance ---');
    const issuances = await FabricIssuance.findAll({ where: { lotNumber } });
    console.log(JSON.stringify(issuances, null, 2));

    const barcodes = [];
    issuances.forEach(iss => {
      if (iss.barcodeIds) {
        try {
          barcodes.push(...JSON.parse(iss.barcodeIds));
        } catch (e) {
          console.error(e);
        }
      }
    });
    console.log('Barcodes:', barcodes);

    console.log('--- DyeingMaterial ---');
    const dm = await DyeingMaterial.findAll({ where: { barcodeId: barcodes } });
    console.log(JSON.stringify(dm, null, 2));

    console.log('--- Material ---');
    const mat = await Material.findAll({ where: { code: barcodes } });
    console.log(JSON.stringify(mat, null, 2));

    console.log('--- Inventory ---');
    const inv = await Inventory.findAll({ where: { lot_no: lotNumber } });
    console.log(JSON.stringify(inv, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
