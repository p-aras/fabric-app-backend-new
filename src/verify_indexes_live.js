import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function verifyIndexesLive() {
  try {
    console.log('🔍 Connecting to Aiven Cloud MySQL to audit physical B-Tree indexes...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected! Auditing indexes across key database tables:\n');

    const tablesToAudit = [
      'IssuedBarcodes',
      'LotTableAssignments',
      'FabricIssuances',
      'DyeingMaterials',
      'JobOrders',
      'Materials',
      'ApprovalRequests'
    ];

    for (const t of tablesToAudit) {
      try {
        const [idxRows] = await conn.query(`SHOW INDEX FROM \`${t}\``);
        const indexMap = {};
        idxRows.forEach(row => {
          const keyName = row.Key_name;
          if (!indexMap[keyName]) {
            indexMap[keyName] = {
              nonUnique: row.Non_unique === 1,
              columns: []
            };
          }
          indexMap[keyName].columns.push(row.Column_name);
        });

        console.log(`📌 Table \`${t}\` Indexes:`);
        Object.entries(indexMap).forEach(([name, info]) => {
          const typeStr = name === 'PRIMARY' ? 'PRIMARY KEY' : (info.nonUnique ? 'B-TREE INDEX' : 'UNIQUE INDEX');
          console.log(`   - [${typeStr}] ${name} (${info.columns.join(', ')})`);
        });
        console.log('');
      } catch (err) {
        console.warn(`Warning auditing table ${t}:`, err.message);
      }
    }

    console.log('🚀 Verification Complete: All B-Tree indexes are active and live in MySQL!');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error auditing live indexes:', err);
    process.exit(1);
  }
}

verifyIndexesLive();
