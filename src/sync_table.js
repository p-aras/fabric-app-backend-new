import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Connecting to Aiven MySQL...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('Connected to Aiven MySQL! Creating LotTableAssignments table...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`LotTableAssignments\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`lotNumber\` VARCHAR(50) NOT NULL,
        \`tableNo\` VARCHAR(50) NOT NULL,
        \`jobOrderNo\` VARCHAR(50) NULL,
        \`fabric\` VARCHAR(100) NULL,
        \`shade\` VARCHAR(100) NULL,
        \`totalRolls\` INT DEFAULT 0,
        \`totalWeight\` DECIMAL(10,2) DEFAULT 0.00,
        \`status\` VARCHAR(30) DEFAULT 'Cutting Pending',
        \`issuedBy\` VARCHAR(100) NULL,
        \`issuedAt\` VARCHAR(50) NULL,
        \`completedAt\` VARCHAR(50) NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ Success! LotTableAssignments table created in Aiven MySQL.');

    // Now backfill past FabricIssuance records into LotTableAssignments
    console.log('Checking past FabricIssuances...');
    const [rows] = await conn.query('SELECT * FROM FabricIssuances');
    console.log(`Found ${rows.length} FabricIssuance records.`);

    let inserted = 0;
    for (const fsItem of rows) {
      let items = [];
      try { items = fsItem.issuedItems ? JSON.parse(fsItem.issuedItems) : []; } catch (e) {}
      if (Array.isArray(items) && items.length > 0) {
        for (const it of items) {
          if (it.tableNumber) {
            await conn.query(
              `INSERT INTO LotTableAssignments (lotNumber, tableNo, jobOrderNo, fabric, shade, totalRolls, totalWeight, status, issuedBy, issuedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                String(fsItem.lotNumber),
                String(it.tableNumber),
                String(fsItem.jobOrderNo || ''),
                String(fsItem.fabric || ''),
                String(it.shade || ''),
                parseInt(it.qty) || 0,
                parseFloat(it.weight) || 0,
                'Cutting Pending',
                String(fsItem.issuedBy || 'System'),
                String(fsItem.issuedAt || new Date().toISOString())
              ]
            );
            inserted++;
          }
        }
      }
    }

    console.log(`✅ Successfully backfilled ${inserted} lot table assignments into LotTableAssignments table!`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error executing sync script:', err);
    process.exit(1);
  }
}

run();
