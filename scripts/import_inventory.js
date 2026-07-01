import fs from 'fs';
import readline from 'readline';
import path from 'path';
import sequelize from '../src/config/db.js';
import { Inventory } from '../src/models/index.js';

// Configuration
const CSV_FILE_PATH = 'C:\\MH-PROJECTS\\fabric_Inventory56.csv';
const BATCH_SIZE = 2000;
const TRUNCATE_TABLE = true; // Set to false if you want to append instead of replacing

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Map CSV headers to database columns
const headerMap = {
  'barcode': 'barcode',
  'item description': 'item_description',
  'unit': 'unit',
  'shade': 'shade',
  'lot no': 'lot_no',
  'rect no': 'rect_no',
  'rect  no': 'rect_no', // handle double space
  'rect date': 'rect_date',
  'party': 'party',
  'store': 'store',
  'issue no': 'issue_no',
  'issue date': 'issue_date',
  'mrn pkgs': 'mrn_pkgs',
  'issue pkgs': 'issue_pkgs',
  'adj pkgs': 'adj_pkgs',
  'bal pkgs': 'bal_pkgs',
  'mrn wt': 'mrn_wt',
  'issue wt': 'issue_wt',
  'adj wt': 'adj_wt',
  'bal wt': 'bal_wt'
};

async function runImport() {
  try {
    console.log('Connecting to the database...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.error(`Error: CSV file not found at ${CSV_FILE_PATH}`);
      process.exit(1);
    }

    if (TRUNCATE_TABLE) {
      console.log('Clearing existing data from the inventory table (truncating)...');
      await Inventory.destroy({ truncate: { cascade: true } });
      console.log('Inventory table cleared.');
    }

    console.log(`Starting import from: ${CSV_FILE_PATH}`);

    const fileStream = fs.createReadStream(CSV_FILE_PATH);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headers = [];
    let fieldMapping = []; // index -> dbFieldName
    let batch = [];
    let totalImported = 0;
    let lineCount = 0;

    for await (const line of rl) {
      lineCount++;
      if (!line.trim()) continue;

      const row = parseCSVLine(line);

      // Parse headers from the first line
      if (lineCount === 1) {
        headers = row;
        fieldMapping = headers.map(header => {
          const normalized = header.toLowerCase().replace(/\s+/g, ' ');
          return headerMap[normalized] || null;
        });
        console.log('Detected headers mapping:');
        headers.forEach((h, idx) => {
          if (fieldMapping[idx]) {
            console.log(`  - "${h}" => ${fieldMapping[idx]}`);
          }
        });
        continue;
      }

      // Construct record object
      const record = {};
      row.forEach((val, idx) => {
        const dbField = fieldMapping[idx];
        if (dbField) {
          // Clean up quotes from the parsed value
          let cleanVal = val;
          if (cleanVal.startsWith('"') && cleanVal.endsWith('"')) {
            cleanVal = cleanVal.slice(1, -1);
          }
          record[dbField] = cleanVal || null;
        }
      });

      batch.push(record);

      if (batch.length >= BATCH_SIZE) {
        await Inventory.bulkCreate(batch);
        totalImported += batch.length;
        console.log(`[Progress] Imported ${totalImported} records...`);
        batch = [];
      }
    }

    // Insert remaining records in final batch
    if (batch.length > 0) {
      await Inventory.bulkCreate(batch);
      totalImported += batch.length;
      console.log(`[Progress] Imported ${totalImported} records...`);
    }

    console.log(`\nImport Completed Successfully! Total imported: ${totalImported} records.`);
    process.exit(0);
  } catch (error) {
    console.error('Import failed with error:', error);
    process.exit(1);
  }
}

runImport();
