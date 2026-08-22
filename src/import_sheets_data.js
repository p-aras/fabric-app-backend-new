import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
const INDEX_SHEET_NAME = "Index";
const INDEX_RANGE = `${INDEX_SHEET_NAME}!A:Z`;

async function fetchSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${BUDGET_SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheets fetch error: ${response.statusText}`);
  return await response.json();
}

async function importSheetsData() {
  try {
    console.log('🔒 Connecting to Aiven Cloud MySQL for Google Sheets importing...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('Fetching Index sheet from Google Sheets...');
    const idxRes = await fetchSheet(INDEX_RANGE);
    const idxValues = idxRes.values || [];
    console.log(`Downloaded ${idxValues.length} rows from Index sheet.`);

    let importedIdx = 0;

    for (let i = 0; i < idxValues.length; i++) {
      const row = idxValues[i];
      if (!row || row.length === 0) continue;

      const lot = String(row[0] || '').trim();
      // Skip if lot is empty or non-numeric header text like 'Lot'
      if (!lot || isNaN(Number(lot))) continue;

      const fabric = String(row[4] || '—').trim();
      const garmentType = String(row[5] || '—').trim();
      const style = String(row[6] || '—').trim();
      const supervisor = String(row[11] || '—').trim();
      const partyName = String(row[13] || '—').trim();
      const brand = String(row[14] || '—').trim();
      const savedAt = String(row[23] || '').trim();
      const cuttingQty = parseInt(String(row[25] || '0').replace(/,/g, '')) || 0;

      try {
        await conn.query(`
          INSERT INTO IndexSheetRecords (lotNumber, partyName, fabric, style, brand, garmentType, cuttingQty, supervisor, savedAt, rawJson)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            partyName = VALUES(partyName),
            fabric = VALUES(fabric),
            style = VALUES(style),
            brand = VALUES(brand),
            garmentType = VALUES(garmentType),
            cuttingQty = VALUES(cuttingQty),
            supervisor = VALUES(supervisor),
            savedAt = VALUES(savedAt),
            rawJson = VALUES(rawJson)
        `, [lot, partyName, fabric, style, brand, garmentType, cuttingQty, supervisor, savedAt, JSON.stringify(row)]);
        importedIdx++;
      } catch (e) {
        console.warn(`Warning importing lot ${lot}:`, e.message);
      }
    }

    console.log(`🎉 Successfully imported ${importedIdx} valid index sheet records into IndexSheetRecords table!`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error importing sheets data:', err);
    process.exit(1);
  }
}

importSheetsData();
