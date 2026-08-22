import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function createSheetTables() {
  try {
    console.log('🔒 [Sheet Tables Setup] Connecting to Aiven Cloud MySQL...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('Connected! Creating CuttingSheetRecords and IndexSheetRecords tables...');

    // 1. Create CuttingSheetRecords table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`CuttingSheetRecords\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`lotNumber\` VARCHAR(50) NOT NULL,
        \`jobOrderNo\` VARCHAR(50) NULL,
        \`partyName\` VARCHAR(100) NULL,
        \`fabric\` VARCHAR(100) NULL,
        \`shade\` VARCHAR(100) NULL,
        \`billNumber\` VARCHAR(50) NULL,
        \`opRolls\` INT DEFAULT 0,
        \`opWeight\` DECIMAL(10,2) DEFAULT 0.00,
        \`issueRolls\` INT DEFAULT 0,
        \`issueWeight\` DECIMAL(10,2) DEFAULT 0.00,
        \`balanceRolls\` INT DEFAULT 0,
        \`balanceWeight\` DECIMAL(10,2) DEFAULT 0.00,
        \`cuttingTable\` VARCHAR(50) NULL,
        \`savedAt\` VARCHAR(50) NULL,
        \`rawJson\` TEXT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_csr_lot (\`lotNumber\`),
        INDEX idx_csr_table (\`cuttingTable\`),
        INDEX idx_csr_savedAt (\`savedAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Create IndexSheetRecords table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`IndexSheetRecords\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`lotNumber\` VARCHAR(50) NOT NULL UNIQUE,
        \`jobOrderNo\` VARCHAR(50) NULL,
        \`partyName\` VARCHAR(100) NULL,
        \`fabric\` VARCHAR(100) NULL,
        \`style\` VARCHAR(100) NULL,
        \`brand\` VARCHAR(100) NULL,
        \`garmentType\` VARCHAR(100) NULL,
        \`cuttingQty\` INT DEFAULT 0,
        \`cuttingTable\` VARCHAR(50) NULL,
        \`supervisor\` VARCHAR(100) NULL,
        \`savedAt\` VARCHAR(50) NULL,
        \`rawJson\` TEXT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_isr_lot (\`lotNumber\`),
        INDEX idx_isr_table (\`cuttingTable\`),
        INDEX idx_isr_savedAt (\`savedAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ Success! CuttingSheetRecords and IndexSheetRecords tables created in Aiven MySQL.');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating sheet tables:', err);
    process.exit(1);
  }
}

createSheetTables();
