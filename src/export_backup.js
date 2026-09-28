import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from './config/db.js';
import {
  User, Room, Rack, Shelf, Supplier, Material, Grn, Issue, Transfer,
  AuditLog, DyeingMaterial, FabricIssuance, FabricReturn, JobOrder, Parta,
  Inventory, FabricChangeApproval, Table, FabricUnitConversionLog, Attendance,
  Staff, ApprovalRequest, LotTableAssignment, IssuedBarcode, CuttingSheetRecord,
  IndexSheetRecord, CuttingMatrixRecord, ShortageReport
} from './models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportBackup() {
  console.log('📦 Starting database backup export...');
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    const models = {
      User, Room, Rack, Shelf, Supplier, Material, Grn, Issue, Transfer,
      AuditLog, DyeingMaterial, FabricIssuance, FabricReturn, JobOrder, Parta,
      Inventory, FabricChangeApproval, Table, FabricUnitConversionLog, Attendance,
      Staff, ApprovalRequest, LotTableAssignment, IssuedBarcode, CuttingSheetRecord,
      IndexSheetRecord, CuttingMatrixRecord, ShortageReport
    };

    const backupData = {
      exportedAt: new Date().toISOString(),
      tables: {}
    };

    for (const [modelName, model] of Object.entries(models)) {
      try {
        const records = await model.findAll({ raw: true });
        backupData.tables[modelName] = records;
        console.log(`  └─ ${modelName}: ${records.length} records exported.`);
      } catch (err) {
        console.warn(`  └─ ${modelName}: skipped (${err.message})`);
      }
    }

    const backupPath = path.join(__dirname, '../database_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`\n🎉 Backup completed successfully! Saved to: ${backupPath}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  }
}

exportBackup();
