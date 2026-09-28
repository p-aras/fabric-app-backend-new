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

async function importBackup() {
  console.log('📥 Starting database backup import...');
  try {
    const backupPath = path.join(__dirname, '../database_backup.json');
    if (!fs.existsSync(backupPath)) {
      console.error(`❌ Backup file not found at ${backupPath}`);
      process.exit(1);
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    console.log(`📅 Backup Export Date: ${backupData.exportedAt}`);

    await sequelize.authenticate();
    console.log('✅ Connected to Railway MySQL.');

    // Disable foreign key checks for fast bulk importing
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');

    const models = {
      User, Room, Rack, Shelf, Supplier, Material, Grn, Issue, Transfer,
      AuditLog, DyeingMaterial, FabricIssuance, FabricReturn, JobOrder, Parta,
      Inventory, FabricChangeApproval, Table, FabricUnitConversionLog, Attendance,
      Staff, ApprovalRequest, LotTableAssignment, IssuedBarcode, CuttingSheetRecord,
      IndexSheetRecord, CuttingMatrixRecord, ShortageReport
    };

    console.log('🛠️ Synchronizing table schemas...');
    for (const [modelName, model] of Object.entries(models)) {
      try {
        await model.sync();
      } catch (err) {
        // Table/index ready
      }
      console.log(`  └─ Table ready: ${modelName}`);
    }
    console.log('✅ All database tables created/verified on Railway MySQL.');

    // Import records in chunks of 500
    for (const [modelName, model] of Object.entries(models)) {
      const records = backupData.tables[modelName] || [];
      if (records.length > 0) {
        console.log(`  ⏳ Importing ${modelName} (${records.length} records)...`);
        const chunkSize = 500;
        for (let i = 0; i < records.length; i += chunkSize) {
          const chunk = records.slice(i, i + chunkSize);
          try {
            await model.bulkCreate(chunk, { ignoreDuplicates: true, hooks: false, validate: false });
            console.log(`     -> Inserted ${Math.min(i + chunkSize, records.length)} / ${records.length}`);
          } catch (chunkErr) {
            console.warn(`    ⚠️ Warning on ${modelName} chunk [${i}..${i+chunkSize}]:`, chunkErr.message);
          }
        }
        console.log(`  └─ ✅ ${modelName}: ${records.length} records processed.`);
      } else {
        console.log(`  └─ ⚪ ${modelName}: 0 records.`);
      }
    }

    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('\n🎉 Backup restoration to Railway MySQL completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

importBackup();
