import sequelize from './src/config/db.js';
import { Inventory } from './src/models/index.js';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB Connection established.');
    
    const rows = await Inventory.findAll({
      limit: 10
    });
    
    console.log('INVENTORY SAMPLE ROWS:');
    rows.forEach(r => {
      console.log({
        id: r.id,
        barcode: r.barcode,
        item_description: r.item_description,
        store: r.store,
        bal_pkgs: r.bal_pkgs,
        bal_wt: r.bal_wt,
        typeof_bal_wt: typeof r.bal_wt
      });
    });
    
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}
main();


