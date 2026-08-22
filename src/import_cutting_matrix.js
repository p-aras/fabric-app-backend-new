import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
const CUTTING_SHEET_NAME = "Cutting";
const CUTTING_RANGE = `${CUTTING_SHEET_NAME}!A1:ZZ50000`;

async function fetchSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${BUDGET_SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheets fetch error: ${response.statusText}`);
  return await response.json();
}

async function importCuttingMatrix() {
  try {
    console.log('🔒 Connecting to Aiven Cloud MySQL to create and populate CuttingMatrixRecords...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    // 1. Create table with proper B-Tree indexes
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`CuttingMatrixRecords\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`lotNumber\` VARCHAR(50) NOT NULL,
        \`cuttingTable\` VARCHAR(50) DEFAULT 'Table 1',
        \`fabric\` VARCHAR(100) NULL,
        \`style\` VARCHAR(100) NULL,
        \`garmentType\` VARCHAR(100) NULL,
        \`color\` VARCHAR(100) NOT NULL,
        \`sizeBreakdown\` TEXT NULL,
        \`totalPcs\` INT DEFAULT 0,
        \`rawRowJson\` TEXT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cmr_lot (\`lotNumber\`),
        INDEX idx_cmr_table (\`cuttingTable\`),
        INDEX idx_cmr_color (\`color\`),
        INDEX idx_cmr_lot_table (\`lotNumber\`, \`cuttingTable\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ CuttingMatrixRecords table ensured on Aiven MySQL.');
    console.log('Fetching Cutting matrix sheet from Google Sheets...');

    const res = await fetchSheet(CUTTING_RANGE);
    const rows = res.values || [];
    console.log(`Downloaded ${rows.length} raw rows from Cutting sheet.`);

    let currentLot = null;
    let currentStyle = '';
    let currentFabric = '';
    let currentGarmentType = '';
    let sizeHeaders = [];
    let importedRows = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.length === 0) continue;

      const firstCell = String(row[0] || '').trim();

      // Check for Lot Header block
      if (firstCell.startsWith('Cutting Matrix — Lot') || firstCell.startsWith('Lot Number:')) {
        if (firstCell.startsWith('Cutting Matrix — Lot')) {
          currentLot = firstCell.replace('Cutting Matrix — Lot', '').trim();
        }
        continue;
      }

      // Check row for metadata (Lot Number:, Style:, Fabric:, Garment Type:)
      const rowStr = row.map(c => String(c || '').trim()).join(' ');
      if (rowStr.includes('Lot Number:')) {
        const lotIdx = row.findIndex(c => String(c).includes('Lot Number:'));
        if (lotIdx !== -1 && row[lotIdx + 1]) {
          currentLot = String(row[lotIdx + 1]).trim();
        }
        const styleIdx = row.findIndex(c => String(c).includes('Style:'));
        if (styleIdx !== -1 && row[styleIdx + 1]) {
          currentStyle = String(row[styleIdx + 1]).trim();
        }
        continue;
      }

      if (rowStr.includes('Fabric:')) {
        const fabIdx = row.findIndex(c => String(c).includes('Fabric:'));
        if (fabIdx !== -1 && row[fabIdx + 1]) {
          currentFabric = String(row[fabIdx + 1]).trim();
        }
        const gTypeIdx = row.findIndex(c => String(c).includes('Garment Type:'));
        if (gTypeIdx !== -1 && row[gTypeIdx + 1]) {
          currentGarmentType = String(row[gTypeIdx + 1]).trim();
        }
        continue;
      }

      // Check for Color / Size Header row
      if (firstCell === 'Color' && row.length > 2) {
        sizeHeaders = row.map(c => String(c || '').trim());
        continue;
      }

      // Process Color breakdown rows
      if (currentLot && firstCell && firstCell !== 'Color' && firstCell !== 'Total' && sizeHeaders.length > 0) {
        const color = firstCell;
        const cuttingTableVal = String(row[1] || 'Table 1').trim();
        const totalPcsVal = parseInt(String(row[row.length - 1] || '0').replace(/,/g, '')) || 0;

        const sizeObj = {};
        for (let sIdx = 2; sIdx < sizeHeaders.length - 1; sIdx++) {
          const sName = sizeHeaders[sIdx];
          const sVal = parseInt(String(row[sIdx] || '0').replace(/,/g, '')) || 0;
          if (sName && sVal > 0) {
            sizeObj[sName] = sVal;
          }
        }

        try {
          await conn.query(`
            INSERT INTO CuttingMatrixRecords (lotNumber, cuttingTable, fabric, style, garmentType, color, sizeBreakdown, totalPcs, rawRowJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            currentLot,
            cuttingTableVal,
            currentFabric,
            currentStyle,
            currentGarmentType,
            color,
            JSON.stringify(sizeObj),
            totalPcsVal,
            JSON.stringify(row)
          ]);
          importedRows++;
        } catch (e) {
          console.warn(`Error inserting row for lot ${currentLot}:`, e.message);
        }
      }
    }

    console.log(`🎉 Successfully imported ${importedRows} cutting matrix color/size breakdown records into CuttingMatrixRecords table!`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error importing cutting matrix:', err);
    process.exit(1);
  }
}

importCuttingMatrix();
