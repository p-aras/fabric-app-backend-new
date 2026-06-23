import { Material, Room, DyeingMaterial, JobOrder, Inventory } from '../models/index.js';
import { addAuditLog, checkShelfCapacity } from './materialController.js';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '../cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const SHEET_DATA_CACHE_PATH = path.join(CACHE_DIR, 'sheet_data.csv');
const JOB_ORDERS_CACHE_PATH = path.join(CACHE_DIR, 'job_orders.csv');

const getDefaultJobOrdersCsv = () => {
  return [
    'Job Order No,Lot Number,Fabric,Brand,Quantity,Unit,Shade,Date,Size,Garment Type,Section,Season,Pattern,Style',
    'JO-2026-001,76038,Premium Cotton Dyeing Fabric,Levi\'s,500,Pcs,Royal Blue,2026-03-27,M,T-Shirt,Sewing,Summer 2026,Solid,Classic',
    'JO-2026-002,DY-LOT-001,Cotton Dyeing Fabric,Gap,300,Pcs,Navy Blue,2026-04-17,L,Polo,Sewing,Summer 2026,Striped,Fit',
    'JO-2026-003,1001,Super Soft Cotton,Uniqlo,400,Pcs,Jet Black,2026-04-28,XL,Hoodie,Stitching,Winter 2026,Solid,Oversized',
    'JO-2026-004,1002,Pure Linen Fabric,Zara,600,Pcs,Off White,2026-05-02,S,Shirt,Sewing,Spring 2026,Solid,Casual',
    'JO-2026-005,1003,Performance Polyester,Nike,200,Pcs,Crimson Red,2026-05-10,M,Shorts,Stitching,Summer 2026,Solid,Athletic'
  ].join('\n');
};

const getDefaultSheetDataCsv = () => {
  return [
    'Mohit Hosiery (Production),,,,,,,,,,,,,,,,,,,,',
    'Fabric JW Status,,,,,,,,,,,,,,,,,,,,',
    'Report Date: 21/Jan/25 - 6:03:53 PM,,,,,,,,,,,,,,,,,,,,',
    'Party,Item Name,Lot No,Issue No,Issue Date,Issue Shade,Rect Shade,Remarks,Op Qty,Issue Qty,Receipt Qty,Shortage,Short Per,Balance,Op Rolls,Issue Rolls,Rect Rolls,Grey Rolls,Balance Rolls,Std Short Per,Std Shortage',
    'Cotton CMF-76038,Premium Cotton Dyeing Fabric,76038,BILL-76038,27-Mar-26,Royal Blue,,,120.00,,,,,120.00,5,,,,5,,',
    'Dyeing CMF,Cotton Dyeing Fabric,DY-LOT-001,DY-BILL-001,17-Apr-26,Navy Blue,,,85.50,,,,,85.50,3,,,,3,,',
    'Super Soft Corp,Super Soft Cotton,1001,BILL-1001,28-Apr-26,Jet Black,,,150.25,,,,,150.25,4,,,,4,,',
    'Linen House,Pure Linen Fabric,1002,BILL-1002,02-May-26,Off White,,,210.00,,,,,210.00,6,,,,6,,',
    'Polyester Co,Performance Polyester,1003,BILL-1003,10-May-26,Crimson Red,,,95.00,,,,,95.00,2,,,,2,,'
  ].join('\n');
};

export const nextBarcodeId = async (req, res) => {
  try {
    const lastMaterial = await Material.findOne({
      order: [['code', 'DESC']]
    });
    const lastDyeing = await DyeingMaterial.findOne({
      order: [['barcodeId', 'DESC']]
    });

    const getNumericId = (barcode) => {
      if (!barcode) return 0;
      const match = barcode.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const lastMatId = lastMaterial ? getNumericId(lastMaterial.code) : 0;
    const lastDyeingId = lastDyeing ? getNumericId(lastDyeing.barcodeId) : 0;
    const lastId = Math.max(lastMatId, lastDyeingId);
    const nextId = lastId + 1;
    const barcodeId = `MAT${String(nextId).padStart(5, '0')}`;

    res.json({
      success: true,
      data: {
        barcodeId,
        numericId: nextId,
        lastId: lastId
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const storeFabricData = async (req, res) => {
  try {
    const {
      barcodeId,
      cmfName,
      fabricName,
      shade,
      lotNumber,
      group,
      billNumber,
      date,
      location,
      receivedPerson,
      authorizedPerson,
      weight,
      rollNumber,
      batchTotal
    } = req.body;

    // Determine category based on room if possible, else default to 'Summer Fabric'
    let category = 'Summer Fabric';

    // Find or create material
    const material = await Material.create({
      code: barcodeId,
      name: fabricName || cmfName || 'Dyeing Fabric',
      category: category,
      subCategory: group || '',
      color: shade || '',
      supplier: null, // default
      weight: parseFloat(weight) || 0.00,
      rolls: 1, // single roll per barcode
      unit: 'Roll',
      location: location || '',
      status: 'Active',
      stockKg: parseFloat(weight) || 0.00,
      billNumber: billNumber || '',
      receivedPerson: receivedPerson || '',
      authorizedPerson: authorizedPerson || '',
      receivedDate: date || new Date().toISOString().slice(0, 10),
      lotNo: lotNumber || ''
    });

    await addAuditLog(
      'Material Received',
      `Roll ${rollNumber}/${batchTotal} of Lot ${lotNumber} received with barcode ${barcodeId} at shelf ${location}`,
      receivedPerson || 'System',
      'receive'
    );

    res.json({
      success: true,
      data: material
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const storeDyeingData = async (req, res) => {
  try {
    const {
      barcodeId,
      cmfName,
      fabricName,
      shade,
      lotNumber,
      group,
      billNumber,
      date,
      location,
      receivedPerson,
      authorizedPerson,
      weight,
      rollNumber,
      batchTotal,
      batchNumber,
      batchDate,
      batchTime,
      timestamp,
      generatedAt
    } = req.body;

    const rollsVal = 1;
    await checkShelfCapacity(location, rollsVal);

    const dyeingMaterial = await DyeingMaterial.create({
      barcodeId: barcodeId,
      batchNumber: batchNumber || '',
      batchDate: batchDate || '',
      batchTime: batchTime || '',
      cmfName: cmfName || '',
      fabricName: fabricName || 'Dyeing Fabric',
      lotNumber: lotNumber || '',
      group: group || '',
      shade: shade || '',
      billNumber: billNumber || '',
      date: date || new Date().toISOString().slice(0, 10),
      location: location || '',
      receivedPerson: receivedPerson || '',
      authorizedPerson: authorizedPerson || '',
      rollNumber: parseInt(rollNumber) || 1,
      batchTotal: parseInt(batchTotal) || 1,
      batchStatus: 'completed',
      weight: parseFloat(weight) || 0.00,
      generatedAt: generatedAt || new Date().toLocaleTimeString(),
      timestamp: timestamp || new Date().toISOString(),
      status: 'in_stock'
    });

    await addAuditLog(
      'Material Received',
      `Roll ${rollNumber}/${batchTotal} of Lot ${lotNumber} received with barcode ${barcodeId} at shelf ${location} (Dyeing)`,
      receivedPerson || 'System',
      'receive'
    );

    res.json({
      success: true,
      data: dyeingMaterial
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const completeBatch = async (req, res) => {
  try {
    const {
      batchNumber,
      lotNumber,
      totalRolls,
      processedRolls,
      completedBy,
      message
    } = req.body;

    const detailText = message || `Batch ${batchNumber} (${lotNumber || 'N/A'}): processed ${processedRolls} of ${totalRolls} rolls.`;

    await addAuditLog(
      'Batch Completed',
      detailText,
      completedBy || 'System',
      'receive'
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const fetchDyeingLotDetails = async (req, res) => {
  try {
    const { lotNumber } = req.query;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'lotNumber is required' });
    }

    // Try to lookup from database first (query DyeingMaterial table by lotNumber or barcodeId)
    const existing = await DyeingMaterial.findOne({
      where: {
        [Op.or]: [
          { barcodeId: lotNumber },
          { lotNumber: lotNumber }
        ]
      }
    });

    if (existing) {
      // Split shade into issued and received if combined
      let issuedShade = existing.shade || 'Sky Blue';
      let receivedShade = '';
      if (issuedShade.includes(' / ')) {
        const parts = issuedShade.split(' / ');
        issuedShade = parts[0];
        receivedShade = parts[1];
      }

      return res.json({
        success: true,
        data: {
          cmfName: existing.cmfName,
          fabricName: existing.fabricName,
          group: existing.group,
          issuedShade: issuedShade,
          receivedShade: receivedShade,
          billNumber: existing.billNumber || '',
          date: existing.date,
          receivedPerson: existing.receivedPerson || '',
          authorizedPerson: existing.authorizedPerson || '',
          totalRolls: existing.batchTotal || 1
        }
      });
    }

    // Fallback Mock Lots
    const mockLots = {
      '76038': {
        cmfName: 'Cotton CMF-76038',
        fabricName: 'Premium Cotton Dyeing Fabric',
        group: 'Dyeing Group A',
        issuedShade: 'Royal Blue',
        receivedShade: '',
        billNumber: 'BILL-76038',
        totalRolls: 5,
        receivedPerson: 'Dyeing Operator',
        authorizedPerson: 'Dyeing Manager',
      },
      'DY-LOT-001': {
        cmfName: 'Dyeing CMF',
        fabricName: 'Cotton Dyeing Fabric',
        group: 'Dyeing Group A',
        issuedShade: 'Navy Blue',
        receivedShade: '',
        billNumber: 'DY-BILL-001',
        totalRolls: 3,
        receivedPerson: 'Dyeing Operator',
        authorizedPerson: 'Dyeing Manager',
      }
    };

    const data = mockLots[lotNumber] || {
      cmfName: `CMF-${lotNumber}`,
      fabricName: `Dyeing Fabric ${lotNumber}`,
      group: 'Dyeing Group A',
      issuedShade: 'Sky Blue',
      receivedShade: '',
      billNumber: `BILL-${lotNumber}`,
      totalRolls: 4,
      receivedPerson: 'Dyeing Operator',
      authorizedPerson: 'Dyeing Manager',
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// In-memory cache for Google Sheet CSV data
let cachedCsvText = null;
let cacheTimestamp = 0;
let cachedJobOrdersCsvText = null;
let jobOrdersCacheTimestamp = 0;
const CACHE_TTL_MS = 15000; // 15 seconds TTL

const getSheetDataCsvText = async () => {
  const now = Date.now();
  if (cachedCsvText && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedCsvText;
  }

  try {
    console.log('[Sheets API] Fetching fresh CSV from Google Sheets...');
    const response = await fetch('https://docs.google.com/spreadsheets/d/1SKGM8tsZ6nCJbCsY9M-eUKaS-ohSLM3Vi8bRKD4w0IA/export?format=csv&gid=583466343');
    if (!response.ok) {
      throw new Error(`Failed to fetch from Google Sheets: ${response.status}`);
    }
    const csvText = await response.text();
    cachedCsvText = csvText;
    cacheTimestamp = now;
    // Save to disk cache asynchronously
    fs.promises.writeFile(SHEET_DATA_CACHE_PATH, csvText, 'utf8').catch(err => {
      console.error('[Sheets API] Error saving Sheet Data to disk cache:', err);
    });
    return csvText;
  } catch (fetchErr) {
    console.warn('[Sheets API] Offline/Network error fetching Sheet Data. Falling back to cache...', fetchErr.message);
    if (fs.existsSync(SHEET_DATA_CACHE_PATH)) {
      const csvText = fs.readFileSync(SHEET_DATA_CACHE_PATH, 'utf8');
      cachedCsvText = csvText;
      cacheTimestamp = now;
      return csvText;
    } else {
      console.log('[Sheets API] No disk cache found for Sheet Data. Seeding mock data.');
      const seedData = getDefaultSheetDataCsv();
      try {
        fs.writeFileSync(SHEET_DATA_CACHE_PATH, seedData, 'utf8');
      } catch (writeErr) {
        console.error('[Sheets API] Failed to seed mock Sheet Data CSV:', writeErr);
      }
      cachedCsvText = seedData;
      cacheTimestamp = now;
      return seedData;
    }
  }
};

const getJobOrdersCsvText = async () => {
  const now = Date.now();
  if (cachedJobOrdersCsvText && (now - jobOrdersCacheTimestamp < CACHE_TTL_MS)) {
    return cachedJobOrdersCsvText;
  }

  try {
    console.log('[Sheets API] Fetching fresh Job Orders CSV from Google Sheets...');
    const response = await fetch('https://docs.google.com/spreadsheets/d/1fKSwGBIpzWEFk566WRQ4bzQ0anJlmasoY8TwrTLQHXI/export?format=csv&gid=0');
    if (!response.ok) {
      throw new Error(`Failed to fetch Job Orders from Google Sheets: ${response.status}`);
    }
    const csvText = await response.text();
    cachedJobOrdersCsvText = csvText;
    jobOrdersCacheTimestamp = now;
    // Save to disk cache asynchronously
    fs.promises.writeFile(JOB_ORDERS_CACHE_PATH, csvText, 'utf8').catch(err => {
      console.error('[Sheets API] Error saving Job Orders to disk cache:', err);
    });
    return csvText;
  } catch (fetchErr) {
    console.warn('[Sheets API] Offline/Network error fetching Job Orders. Falling back to cache...', fetchErr.message);
    if (fs.existsSync(JOB_ORDERS_CACHE_PATH)) {
      const csvText = fs.readFileSync(JOB_ORDERS_CACHE_PATH, 'utf8');
      cachedJobOrdersCsvText = csvText;
      jobOrdersCacheTimestamp = now;
      return csvText;
    } else {
      console.log('[Sheets API] No disk cache found for Job Orders. Seeding mock data.');
      const seedData = getDefaultJobOrdersCsv();
      try {
        fs.writeFileSync(JOB_ORDERS_CACHE_PATH, seedData, 'utf8');
      } catch (writeErr) {
        console.error('[Sheets API] Failed to seed mock Job Orders CSV:', writeErr);
      }
      cachedJobOrdersCsvText = seedData;
      jobOrdersCacheTimestamp = now;
      return seedData;
    }
  }
};

const parseSheetDate = (dateStr) => {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  // Try parsing DD-Mmm-YY, e.g. 27-Mar-26 or 17-Apr-26 or DD/Mmm/YY
  const normalizedDate = dateStr.replace(/\//g, '-');
  const parts = normalizedDate.split('-');
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let monthName = parts[1].toLowerCase();
    let year = parseInt(parts[2], 10);

    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    let month = null;
    for (const [key, val] of Object.entries(months)) {
      if (monthName.startsWith(key)) {
        month = val;
        break;
      }
    }

    if (month && !isNaN(day) && !isNaN(year)) {
      if (year < 100) {
        year = 2000 + year;
      }
      const dayStr = String(day).padStart(2, '0');
      return `${year}-${month}-${dayStr}`;
    }
  }

  // Fallback to standard parsing
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) { }

  return new Date().toISOString().split('T')[0];
};

// CSV Line parser helper
const parseCsvLine = (line) => {
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
};

// Robust CSV text parser that handles quoted newlines correctly
const parseCsvTextIntoRows = (csvText) => {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF
      }
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
};

export const fetchSheetDataByLot = async (req, res) => {
  try {
    const { lotNo } = req.params;
    if (!lotNo) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }

    console.log(`[Sheets API] Request received for Lot Number: ${lotNo}`);
    const csvText = await getSheetDataCsvText();

    const rows = parseCsvTextIntoRows(csvText);

    // Find the row that matches lotNo
    const targetLot = String(lotNo).trim().toLowerCase();
    let foundCells = null;

    for (const cells of rows) {
      if (cells.length === 0 || (cells.length === 1 && cells[0] === '')) continue;
      // Ensure the row has enough columns (Lot No is at index 2) and isn't a header row (starts with Party, SEL, Barcode, etc.)
      if (cells.length > 2 && cells[0] !== 'Party' && cells[2] !== 'Lot No' && cells[0] !== 'Mohit Hosiery (Production)') {
        const cellLot = String(cells[2]).trim().toLowerCase();
        if (cellLot === targetLot) {
          foundCells = cells;
          break;
        }
      }
    }

    if (!foundCells) {
      console.log(`[Sheets API] Lot ${lotNo} not found in CSV. Returning simulated mock fallback.`);
      const mockData = {
        cmfName: `CMF-${lotNo.toUpperCase()}`,
        fabricName: `Dyeing Fabric ${lotNo.toUpperCase()}`,
        group: 'Dyeing Group A',
        shade: 'SKY BLUE',
        lotNumber: String(lotNo),
        billNumber: '', // manual
        date: new Date().toISOString().split('T')[0], // show current date
        totalRolls: 5,
        weight: 120.00
      };
      return res.json({
        success: true,
        data: mockData,
        isMock: true
      });
    }

    // Parse and clean weight from Balance (index 13) or Op Qty (index 8)
    const rawWeight = foundCells[13] || foundCells[8] || '0';
    const cleanWeight = parseFloat(rawWeight.replace(/,/g, '')) || 0.00;

    const mappedData = {
      cmfName: foundCells[0] || 'Dyeing CMF', // Party
      fabricName: foundCells[1] || 'Cotton Dyeing Fabric', // Item Name
      group: foundCells[1] || 'Dyeing Group A', // Item Name
      shade: foundCells[5] || 'Dyeing Shade X', // Issue Shade
      lotNumber: String(foundCells[2]), // Lot No
      billNumber: foundCells[3] || '', // Issue No
      date: parseSheetDate(foundCells[4]), // Issue Date
      totalRolls: parseInt(foundCells[18]) || parseInt(foundCells[14]) || 1, // Balance Rolls / Op Rolls
      weight: cleanWeight
    };

    console.log(`[Sheets API] Found Lot ${lotNo} in CSV:`, mappedData);
    res.json({
      success: true,
      data: mappedData
    });

  } catch (error) {
    console.error('[Sheets API] Error fetching sheet data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchJobOrders = async (req, res) => {
  try {
    const csvText = await getJobOrdersCsvText();
    const rows = parseCsvTextIntoRows(csvText);

    if (rows.length === 0) {
      return res.json([]);
    }

    const headers = rows[0];
    const parsedRows = [];

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.length === 0 || (cells.length === 1 && cells[0] === '')) continue;
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = cells[index] || '';
      });
      parsedRows.push(obj);
      // Upsert into MySQL JobOrder table
      try {
        await JobOrder.upsert({
          jobOrderNo: obj['Job Order No'] || '',
          lotNumber: obj['Lot Number'] || '',
          fabric: obj['Fabric'] || '',
          brand: obj['Brand'] || '',
          quantity: parseInt(obj['Quantity']) || 0,
          unit: obj['Unit'] || '',
          shade: obj['Shade'] || '',
          date: obj['Date'] || '',
          size: obj['Size'] || '',
          garmentType: obj['Garment Type'] || '',
          section: obj['Section'] || '',
          season: obj['Season'] || '',
          pattern: obj['Pattern'] || '',
          style: obj['Style'] || ''
        });
      } catch (upsertErr) {
        console.error('Error upserting JobOrder:', upsertErr);
      }
    }

    console.log(`[Sheets API] Loaded ${parsedRows.length} Job Orders from Google Sheets`);
    res.json(parsedRows);
  } catch (error) {
    console.error('[Sheets API] Error fetching job orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchInventoryRolls = async (req, res) => {
  try {
    console.log('[Inventory API] Fetching all inventory rolls...');

    // Fetch from Material
    const materials = await Material.findAll();

    // Fetch from DyeingMaterial
    const dyeingMaterials = await DyeingMaterial.findAll();

    // Fetch from Inventory
    const inventoryItems = await Inventory.findAll();

    const mappedMaterials = materials.map(m => ({
      'Barcode ID': m.code,
      'Item Description': m.name,
      'Shade': m.color,
      'Weight (KG)': parseFloat(m.weight) || 0.00,
      'Status': (m.status || 'Active').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
      'Party': ''
    }));

    const mappedDyeing = dyeingMaterials.map(dm => ({
      'Barcode ID': dm.barcodeId,
      'Item Description': dm.fabricName || dm.cmfName,
      'Shade': dm.shade,
      'Weight (KG)': parseFloat(dm.weight) || 0.00,
      'Status': (dm.status || 'in_stock').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
      'Party': dm.cmfName || ''
    }));

    const mappedInventory = inventoryItems.map(inv => ({
      'Barcode ID': inv.barcode,
      'Item Description': inv.item_description,
      'Shade': inv.shade,
      'Weight (KG)': parseFloat(inv.bal_wt) || 0.00,
      'Status': (parseFloat(inv.bal_wt) <= 0 || (inv.bal_pkgs && parseInt(inv.bal_pkgs) <= 0)) ? 'issued' : 'in_stock',
      'Party': inv.party || ''
    }));

    const allRolls = [...mappedMaterials, ...mappedDyeing, ...mappedInventory];
    console.log(`[Inventory API] Loaded ${allRolls.length} rolls from database`);
    res.json(allRolls);
  } catch (error) {
    console.error('[Inventory API] Error fetching inventory rolls:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const searchJobOrderByLot = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }

    console.log(`[Job Order Search] Checking MySQL database first for Lot: ${lotNumber}`);
    const dbJob = await JobOrder.findOne({
      where: { lotNumber: String(lotNumber).trim() }
    });

    if (dbJob) {
      console.log(`[Job Order Search] Found Lot ${lotNumber} in MySQL database`);
      // Map back to frontend expected header names
      const mappedData = {
        'Job Order No': dbJob.jobOrderNo,
        'Lot Number': dbJob.lotNumber,
        'Fabric': dbJob.fabric,
        'Brand': dbJob.brand,
        'Quantity': dbJob.quantity,
        'Unit': dbJob.unit,
        'Shade': dbJob.shade,
        'Date': dbJob.date,
        'Size': dbJob.size,
        'Garment Type': dbJob.garmentType,
        'Section': dbJob.section,
        'Season': dbJob.season,
        'Pattern': dbJob.pattern,
        'Style': dbJob.style
      };
      return res.json({
        success: true,
        data: mappedData,
        source: 'database'
      });
    }

    // Check Inventory database table
    console.log(`[Job Order Search] Checking MySQL Inventory table for Lot: ${lotNumber}`);
    const inventoryRecords = await Inventory.findAll({
      where: { lot_no: String(lotNumber).trim() }
    });

    if (inventoryRecords && inventoryRecords.length > 0) {
      console.log(`[Job Order Search] Found Lot ${lotNumber} in MySQL Inventory table with ${inventoryRecords.length} records`);
      
      const firstRecord = inventoryRecords[0];
      
      // Aggregate all unique shades from the inventory records
      const shades = [...new Set(inventoryRecords.map(r => r.shade).filter(Boolean))].join(', ');
      
      // Sum the bal_pkgs or mrn_pkgs
      let totalQty = 0;
      inventoryRecords.forEach(r => {
        const pkgs = parseInt(r.bal_pkgs) || parseInt(r.mrn_pkgs) || 0;
        totalQty += pkgs;
      });
      
      const mappedData = {
        'Job Order No': firstRecord.rect_no || `JO-${lotNumber}`,
        'Lot Number': lotNumber,
        'Fabric': firstRecord.item_description || 'Unknown Fabric',
        'Brand': firstRecord.party || firstRecord.store || 'Unknown Brand',
        'Quantity': totalQty || inventoryRecords.length,
        'Unit': firstRecord.unit || 'Roll',
        'Shade': shades || 'Unknown Shade',
        'Date': firstRecord.rect_date || firstRecord.issue_date || new Date().toISOString().split('T')[0],
        'Size': 'N/A',
        'Garment Type': 'N/A',
        'Section': 'N/A',
        'Season': 'N/A',
        'Pattern': 'N/A',
        'Style': 'N/A'
      };
      
      return res.json({
        success: true,
        data: mappedData,
        source: 'database_inventory'
      });
    }

    console.log(`[Job Order Search] Lot ${lotNumber} NOT found in MySQL database. Loading from cached/fresh Google Sheets...`);

    const csvText = await getJobOrdersCsvText();
    const rows = parseCsvTextIntoRows(csvText);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No job orders found on sheet' });
    }

    const headers = rows[0];
    const targetLot = String(lotNumber).trim().toLowerCase();
    let foundRow = null;

    // Find the index of 'Lot Number' column
    const lotIndex = headers.findIndex(h => h.trim().toLowerCase() === 'lot number');
    if (lotIndex === -1) {
      throw new Error('Lot Number column not found in Google Sheets headers');
    }

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.length > lotIndex) {
        const cellLot = String(cells[lotIndex]).trim().toLowerCase();
        if (cellLot === targetLot) {
          let obj = {};
          headers.forEach((header, index) => {
            obj[header] = cells[index] || '';
          });
          foundRow = obj;
          break;
        }
      }
    }

    if (foundRow) {
      console.log(`[Job Order Search] Found Lot ${lotNumber} in Google Sheets`);
      return res.json({
        success: true,
        data: foundRow,
        source: 'sheets'
      });
    }

    console.log(`[Job Order Search] Lot ${lotNumber} not found in Google Sheets`);
    return res.status(404).json({ success: false, message: 'Lot Number not found' });
  } catch (error) {
    console.error('[Job Order Search] Error searching job order:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const findRollByBarcode = async (req, res) => {
  try {
    const { barcodeId } = req.params;
    if (!barcodeId) {
      return res.status(400).json({ success: false, message: 'Barcode ID is required' });
    }

    console.log(`🔍 [Inventory API] Looking up roll for barcode: ${barcodeId}`);

    // Try finding in DyeingMaterial first
    const dm = await DyeingMaterial.findOne({
      where: {
        barcodeId: String(barcodeId).trim()
      }
    });

    if (dm) {
      console.log(`✅ [Inventory API] Found roll ${barcodeId} in DyeingMaterial database`);
      return res.json({
        success: true,
        data: {
          'Barcode ID': dm.barcodeId,
          'Item Description': dm.fabricName || dm.cmfName,
          'Shade': dm.shade,
          'Weight (KG)': parseFloat(dm.weight) || 0.00,
          'Status': (dm.status || 'in_stock').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
          'Party': dm.cmfName || '',
          'cmfName': dm.cmfName || ''
        }
      });
    }

    // Try finding in Material
    const m = await Material.findOne({
      where: {
        code: String(barcodeId).trim()
      }
    });

    if (m) {
      console.log(`✅ [Inventory API] Found roll ${barcodeId} in Material database`);
      return res.json({
        success: true,
        data: {
          'Barcode ID': m.code,
          'Item Description': m.name,
          'Shade': m.color,
          'Weight (KG)': parseFloat(m.weight) || 0.00,
          'Status': (m.status || 'Active').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
          'Party': m.receivedPerson || '',
          'cmfName': m.receivedPerson || ''
        }
      });
    }

    // Try finding in Inventory
    const inv = await Inventory.findOne({
      where: {
        barcode: String(barcodeId).trim()
      }
    });

    if (inv) {
      console.log(`✅ [Inventory API] Found roll ${barcodeId} in Inventory database`);
      return res.json({
        success: true,
        data: {
          'Barcode ID': inv.barcode,
          'Item Description': inv.item_description,
          'Shade': inv.shade,
          'Weight (KG)': parseFloat(inv.bal_wt) || parseFloat(inv.mrn_wt) || 0.00,
          'Status': (parseFloat(inv.bal_wt) <= 0 || (inv.bal_pkgs && parseInt(inv.bal_pkgs) <= 0)) ? 'issued' : 'in_stock',
          'Party': inv.party || '',
          'cmfName': inv.party || ''
        }
      });
    }

    console.warn(`⚠️ [Inventory API] Barcode ${barcodeId} NOT found in database`);
    return res.status(404).json({
      success: false,
      message: `Barcode ID "${barcodeId}" not found in inventory`
    });

  } catch (error) {
    console.error('Error in findRollByBarcode:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};


