import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function syncIssuedBarcodes() {
  try {
    console.log('🔒 [Issued Barcodes Sync] Connecting to Aiven MySQL...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('Connected! Creating IssuedBarcodes table...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`IssuedBarcodes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`barcodeId\` VARCHAR(50) NOT NULL UNIQUE,
        \`lotNumber\` VARCHAR(50) NOT NULL,
        \`issuanceId\` VARCHAR(50) NULL,
        \`fabricName\` VARCHAR(100) NULL,
        \`shade\` VARCHAR(100) NULL,
        \`weight\` DECIMAL(10,2) DEFAULT 0.00,
        \`unit\` VARCHAR(20) DEFAULT 'KGS',
        \`issuedBy\` VARCHAR(100) NULL,
        \`department\` VARCHAR(100) NULL,
        \`issuedAt\` VARCHAR(50) NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ib_barcode (\`barcodeId\`),
        INDEX idx_ib_lot (\`lotNumber\`),
        INDEX idx_ib_issuedAt (\`issuedAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ IssuedBarcodes table created safely.');

    // Fetch all issued rolls from DyeingMaterials
    console.log('Populating IssuedBarcodes from DyeingMaterials (status = issued)...');
    const [dyeingRolls] = await conn.query("SELECT * FROM DyeingMaterials WHERE status = 'issued'");
    console.log(`Found ${dyeingRolls.length} issued rolls in DyeingMaterials.`);

    let insertedCount = 0;
    for (const roll of dyeingRolls) {
      if (roll.barcodeId) {
        try {
          await conn.query(`
            INSERT IGNORE INTO IssuedBarcodes (barcodeId, lotNumber, fabricName, shade, weight, unit, issuedBy, issuedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            String(roll.barcodeId),
            String(roll.lotNumber || '—'),
            String(roll.fabricName || '—'),
            String(roll.shade || '—'),
            parseFloat(roll.weight) || 0,
            String(roll.unit || 'KGS'),
            String(roll.receivedPerson || 'System'),
            String(roll.timestamp || new Date().toISOString())
          ]);
          insertedCount++;
        } catch (e) {}
      }
    }

    // Fetch all barcodeIds from FabricIssuances
    console.log('Populating IssuedBarcodes from FabricIssuances records...');
    const [issuances] = await conn.query("SELECT * FROM FabricIssuances");
    for (const fsItem of issuances) {
      if (fsItem.barcodeIds) {
        let bIds = [];
        try { bIds = JSON.parse(fsItem.barcodeIds); } catch (e) {}
        if (Array.isArray(bIds)) {
          for (const bId of bIds) {
            try {
              await conn.query(`
                INSERT IGNORE INTO IssuedBarcodes (barcodeId, lotNumber, issuanceId, fabricName, weight, issuedBy, department, issuedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                String(bId),
                String(fsItem.lotNumber || '—'),
                String(fsItem.issuanceId || ''),
                String(fsItem.fabric || '—'),
                0,
                String(fsItem.issuedBy || 'System'),
                String(fsItem.department || 'Production'),
                String(fsItem.issuedAt || new Date().toISOString())
              ]);
              insertedCount++;
            } catch (e) {}
          }
        }
      }
    }

    console.log(`🎉 Successfully synchronized ${insertedCount} issued barcode records into IssuedBarcodes table!`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error syncing issued barcodes:', err);
    process.exit(1);
  }
}

syncIssuedBarcodes();
