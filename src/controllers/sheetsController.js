import { Material, Room, DyeingMaterial, JobOrder, Inventory, Supplier, FabricIssuance } from '../models/index.js';
import { addAuditLog, checkShelfCapacity } from './materialController.js';
import { Op } from 'sequelize';
import sequelize from '../config/db.js';
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
    const type = (req.query.type || '').toLowerCase();
    let barcodeId = '';
    let nextId = 0;
    let lastId = 0;

    if (type === 'material') {
      const lastMaterial = await Material.findOne({
        where: {
          code: {
            [Op.like]: '1%'
          }
        },
        order: [['code', 'DESC']]
      });
      lastId = 1000000;
      if (lastMaterial) {
        const match = lastMaterial.code.match(/\d+/);
        if (match) lastId = parseInt(match[0], 10);
      }
      nextId = lastId + 1;
      barcodeId = String(nextId);
    } else if (type === 'dyeing') {
      const lastDyeing = await DyeingMaterial.findOne({
        where: {
          barcodeId: {
            [Op.like]: '2%'
          }
        },
        order: [['barcodeId', 'DESC']]
      });
      lastId = 2000000;
      if (lastDyeing) {
        const match = lastDyeing.barcodeId.match(/\d+/);
        if (match) lastId = parseInt(match[0], 10);
      }
      nextId = lastId + 1;
      barcodeId = String(nextId);
    } else if (type === 'fabric-stock') {
      const lastFabricStock = await Material.findOne({
        where: {
          code: {
            [Op.like]: '3%'
          }
        },
        order: [['code', 'DESC']]
      });
      lastId = 3000000;
      if (lastFabricStock) {
        const match = lastFabricStock.code.match(/\d+/);
        if (match) lastId = parseInt(match[0], 10);
      }
      nextId = lastId + 1;
      barcodeId = String(nextId);
    } else if (type === 'po' || type === 'material-against-po') {
      const lastPoMaterial = await Material.findOne({
        where: {
          code: {
            [Op.like]: '8%'
          }
        },
        order: [['code', 'DESC']]
      });
      lastId = 8000000;
      if (lastPoMaterial) {
        const match = lastPoMaterial.code.match(/\d+/);
        if (match) lastId = parseInt(match[0], 10);
      }
      nextId = lastId + 1;
      barcodeId = String(nextId);
    } else if (type === 're-add') {
      const lastReAdd = await Material.findOne({
        where: {
          code: {
            [Op.like]: '9%'
          }
        },
        order: [['code', 'DESC']]
      });
      lastId = 900000;
      if (lastReAdd) {
        const match = lastReAdd.code.match(/\d+/);
        if (match) lastId = parseInt(match[0], 10);
      }
      nextId = lastId + 1;
      barcodeId = String(nextId);
    } else {
      // Legacy Fallback matching original sequence logic
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
      lastId = Math.max(lastMatId, lastDyeingId);
      nextId = lastId + 1;
      barcodeId = `MAT${String(nextId).padStart(5, '0')}`;
    }

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
      batchTotal,
      unit,
      poNumber
    } = req.body;

    // Ensure supplier exists in the database
    if (cmfName) {
      await Supplier.findOrCreate({
        where: { name: cmfName.trim() },
        defaults: { status: 'Active' }
      });
    }

    // Determine category based on room if possible, else default to 'Summer Fabric'
    let category = 'Summer Fabric';

    // Find or create material
    const material = await Material.create({
      code: barcodeId,
      name: fabricName || cmfName || 'Dyeing Fabric',
      category: category,
      subCategory: group || '',
      color: shade || '',
      supplier: cmfName || null,
      weight: parseFloat(weight) || 0.00,
      rolls: 1, // single roll per barcode
      unit: unit || 'KGS',
      location: location || '',
      status: 'Active',
      stockKg: parseFloat(weight) || 0.00,
      billNumber: billNumber || '',
      receivedPerson: receivedPerson || '',
      authorizedPerson: authorizedPerson || '',
      receivedDate: date || new Date().toISOString().slice(0, 10),
      lotNo: lotNumber || '',
      poNumber: poNumber || null
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
      status: 'in_stock',
      unit: 'KGS'
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
    const dbUpsertData = [];

    // Fetch all FabricIssuance records to map lotNumber -> issuedAt
    let issuanceDateMap = {};
    try {
      const issuances = await FabricIssuance.findAll({
        attributes: ['lotNumber', 'issuedAt'],
        raw: true
      });
      issuances.forEach(iss => {
        if (iss.lotNumber && iss.issuedAt) {
          let dateStr = String(iss.issuedAt).trim();
          if (dateStr.includes('T')) {
            dateStr = dateStr.split('T')[0];
          }
          if (!issuanceDateMap[iss.lotNumber] || issuanceDateMap[iss.lotNumber] > dateStr) {
            issuanceDateMap[iss.lotNumber] = dateStr;
          }
        }
      });
    } catch (dbErr) {
      console.error('[Sheets API] Error querying FabricIssuance for job orders:', dbErr);
    }

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.length === 0 || (cells.length === 1 && cells[0] === '')) continue;
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = cells[index] || '';
      });

      const lotNumber = String(obj['Lot Number'] || '').trim();
      obj['fabricIssuedDate'] = issuanceDateMap[lotNumber] || '';

      parsedRows.push(obj);

      // Collect data for background bulk upsert
      if (lotNumber) {
        dbUpsertData.push({
          jobOrderNo: obj['Job Order No'] || '',
          lotNumber: lotNumber,
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
          style: obj['Style'] || '',
          priority: obj['Priority'] || obj['priority'] || ''
        });
      }
    }

    console.log(`[Sheets API] Fetched and parsed ${parsedRows.length} Job Orders. Responding to client instantly.`);

    // 1. Respond to user instantly
    res.json(parsedRows);

    // 2. Perform database upsert in background
    if (dbUpsertData.length > 0) {
      // Filter out duplicate lot numbers within this batch to prevent DB constraint errors
      const uniqueDbUpsertData = [];
      const seenLots = new Set();
      for (let j = dbUpsertData.length - 1; j >= 0; j--) {
        const item = dbUpsertData[j];
        if (!seenLots.has(item.lotNumber)) {
          seenLots.add(item.lotNumber);
          uniqueDbUpsertData.unshift(item);
        }
      }

      console.log(`[Sheets API] Syncing ${uniqueDbUpsertData.length} unique Job Orders to MySQL in background...`);
      JobOrder.bulkCreate(uniqueDbUpsertData, {
        updateOnDuplicate: [
          'jobOrderNo', 'fabric', 'brand', 'quantity', 'unit',
          'shade', 'date', 'size', 'garmentType', 'section',
          'season', 'pattern', 'style', 'priority'
        ]
      }).then(() => {
        console.log('[Sheets API] Background database sync completed successfully!');
      }).catch(bulkErr => {
        console.error('[Sheets API] Background database sync failed:', bulkErr);
      });
    }
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
      'Party': '',
      'Lot No': m.lotNo || '',
      'Location': m.location || '',
      'Rolls': m.rolls || 1
    }));

    const mappedDyeing = dyeingMaterials.map(dm => ({
      'Barcode ID': dm.barcodeId,
      'Item Description': dm.fabricName || dm.cmfName,
      'Shade': dm.shade,
      'Weight (KG)': parseFloat(dm.weight) || 0.00,
      'Status': (dm.status || 'in_stock').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
      'Party': dm.cmfName || '',
      'Lot No': dm.lotNumber || '',
      'Location': dm.location || '',
      'Rolls': dm.rollNumber || 1
    }));

    const mappedInventory = inventoryItems.map(inv => ({
      'Barcode ID': inv.barcode,
      'Item Description': inv.item_description,
      'Shade': inv.shade,
      'Weight (KG)': parseFloat(inv.bal_wt) || 0.00,
      'Status': (parseFloat(inv.bal_wt) <= 0 || (inv.bal_pkgs && parseInt(inv.bal_pkgs) <= 0)) ? 'issued' : 'in_stock',
      'Party': inv.party || '',
      'Lot No': inv.lot_no || '',
      'Location': inv.store || '',
      'Rolls': parseInt(inv.bal_pkgs) || 1
    }));

    const allRolls = [...mappedMaterials, ...mappedDyeing, ...mappedInventory];
    console.log(`[Inventory API] Loaded ${allRolls.length} rolls from database`);
    res.json(allRolls);
  } catch (error) {
    console.error('[Inventory API] Error fetching inventory rolls:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDailyInventoryReport = async (req, res) => {
  try {
    const { date } = req.query;
    let targetDateStr = date;
    if (!targetDateStr) {
      targetDateStr = new Date().toISOString().slice(0, 10);
    }

    const startOfTarget = new Date(`${targetDateStr}T00:00:00`);
    const endOfTarget = new Date(`${targetDateStr}T23:59:59.999`);

    // Query materials added on target day
    const materials = await Material.findAll({
      where: {
        [Op.or]: [
          {
            createdAt: {
              [Op.between]: [startOfTarget, endOfTarget]
            }
          },
          { receivedDate: targetDateStr }
        ]
      }
    });

    // Query dyeing materials added on target day
    const dyeingMaterials = await DyeingMaterial.findAll({
      where: {
        [Op.or]: [
          {
            createdAt: {
              [Op.between]: [startOfTarget, endOfTarget]
            }
          },
          { date: targetDateStr }
        ]
      }
    });

    const mappedMaterials = materials.map(m => ({
      type: 'Material',
      barcode: m.code,
      name: m.name,
      shade: m.color || '—',
      lotNo: m.lotNo || '—',
      location: m.location || '—',
      weight: parseFloat(m.weight) || 0,
      rolls: m.rolls || 1,
      unit: m.unit || 'Roll',
      createdAt: m.createdAt
    }));

    const mappedDyeing = dyeingMaterials.map(dm => ({
      type: 'Dyeing Material',
      barcode: dm.barcodeId,
      name: dm.fabricName || dm.cmfName,
      shade: dm.shade || '—',
      lotNo: dm.lotNumber || '—',
      location: dm.location || '—',
      weight: parseFloat(dm.weight) || 0,
      rolls: dm.rollNumber || 1,
      unit: dm.unit || 'KGS',
      createdAt: dm.createdAt
    }));

    const result = [...mappedMaterials, ...mappedDyeing];
    console.log(`[Daily Inventory Report] Found ${result.length} entries for date: ${targetDateStr}`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Daily Inventory Report] Error fetching report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getRawInventory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    // Helper to get array of values from query
    const getQueryArray = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value;
      return value.split(',').map(v => v.trim()).filter(Boolean);
    };

    // Filters
    const filterParties = getQueryArray(req.query.party);
    const filterShades = getQueryArray(req.query.shade);
    const filterStores = getQueryArray(req.query.store);
    const filterDescriptions = getQueryArray(req.query.description);
    const filterStockStatus = req.query.stockStatus || 'All'; // All, In Stock, Out of Stock

    console.log(`[Inventory API] Fetching raw inventory page ${page}...`);

    const whereClause = {};

    // Search query
    if (search) {
      whereClause[Op.or] = [
        { barcode: { [Op.like]: `%${search}%` } },
        { item_description: { [Op.like]: `%${search}%` } },
        { lot_no: { [Op.like]: `%${search}%` } },
        { shade: { [Op.like]: `%${search}%` } },
        { party: { [Op.like]: `%${search}%` } },
        { store: { [Op.like]: `%${search}%` } }
      ];
    }

    // Party filter (supports multi-select)
    if (filterParties && filterParties.length > 0) {
      whereClause.party = { [Op.in]: filterParties };
    }

    // Shade filter (supports multi-select)
    if (filterShades && filterShades.length > 0) {
      whereClause.shade = { [Op.in]: filterShades };
    }

    // Store filter (supports multi-select)
    if (filterStores && filterStores.length > 0) {
      whereClause.store = { [Op.in]: filterStores };
    }

    // Item Description filter (supports multi-select)
    if (filterDescriptions && filterDescriptions.length > 0) {
      whereClause.item_description = { [Op.in]: filterDescriptions };
    }

    // Stock Status filter
    if (filterStockStatus === 'In Stock') {
      whereClause[Op.or] = [
        { bal_pkgs: { [Op.notIn]: ['', '0', '0.00'] } },
        { bal_wt: { [Op.notIn]: ['', '0', '0.00'] } }
      ];
    } else if (filterStockStatus === 'Out of Stock') {
      whereClause[Op.and] = [
        { bal_pkgs: { [Op.in]: ['', '0', '0.00', null] } },
        { bal_wt: { [Op.in]: ['', '0', '0.00', null] } }
      ];
    }

    // Bal Pkgs filter
    if (req.query.balPkgs !== undefined && req.query.balPkgs !== '') {
      whereClause.bal_pkgs = req.query.balPkgs;
    }

    const { count, rows } = await Inventory.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['id', 'ASC']]
    });

    res.json({
      success: true,
      data: rows,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      limit
    });
  } catch (error) {
    console.error('[Inventory API] Error fetching raw inventory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getInventoryFilterValues = async (req, res) => {
  try {
    console.log('[Inventory API] Fetching distinct filter values...');

    const parties = await Inventory.findAll({
      attributes: ['party'],
      where: { party: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['party'],
      order: [['party', 'ASC']],
      raw: true
    });

    const shades = await Inventory.findAll({
      attributes: ['shade'],
      where: { shade: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['shade'],
      order: [['shade', 'ASC']],
      raw: true
    });

    const stores = await Inventory.findAll({
      attributes: ['store'],
      where: { store: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['store'],
      order: [['store', 'ASC']],
      raw: true
    });

    const descriptions = await Inventory.findAll({
      attributes: ['item_description'],
      where: { item_description: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['item_description'],
      order: [['item_description', 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      parties: parties.map(p => p.party).filter(Boolean),
      shades: shades.map(s => s.shade).filter(Boolean),
      stores: stores.map(st => st.store).filter(Boolean),
      descriptions: descriptions.map(d => d.item_description).filter(Boolean)
    });
  } catch (error) {
    console.error('[Inventory API] Error fetching filter values:', error);
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

    // Subsequent search: If found in DB and marked as fetchedFromSheet, use it
    if (dbJob && dbJob.fetchedFromSheet) {
      console.log(`[Job Order Search] Found Lot ${lotNumber} in MySQL database (fetchedFromSheet is true)`);
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

    // First time or not yet fetched: Fetch from cached/fresh Google Sheets
    console.log(`[Job Order Search] Lot ${lotNumber} not yet fetched from sheet. Loading from Google Sheets...`);

    const csvText = await getJobOrdersCsvText();
    const rows = parseCsvTextIntoRows(csvText);

    let foundRow = null;

    if (rows.length > 0) {
      const headers = rows[0];
      const targetLot = String(lotNumber).trim().toLowerCase();

      // Find the index of 'Lot Number' column
      const lotIndex = headers.findIndex(h => h.trim().toLowerCase() === 'lot number');
      if (lotIndex !== -1) {
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
      }
    }

    if (foundRow) {
      console.log(`[Job Order Search] Found Lot ${lotNumber} in Google Sheets. Syncing to database with fetchedFromSheet=true...`);
      try {
        const lotNumberClean = String(foundRow['Lot Number'] || '').trim();
        if (lotNumberClean) {
          JobOrder.upsert({
            jobOrderNo: foundRow['Job Order No'] || '',
            lotNumber: lotNumberClean,
            fabric: foundRow['Fabric'] || '',
            brand: foundRow['Brand'] || '',
            quantity: parseInt(foundRow['Quantity']) || 0,
            unit: foundRow['Unit'] || '',
            shade: foundRow['Shade'] || '',
            date: foundRow['Date'] || '',
            size: foundRow['Size'] || '',
            garmentType: foundRow['Garment Type'] || '',
            section: foundRow['Section'] || '',
            season: foundRow['Season'] || '',
            pattern: foundRow['Pattern'] || '',
            style: foundRow['Style'] || '',
            priority: foundRow['Priority'] || foundRow['priority'] || '',
            fetchedFromSheet: true
          }).then(() => {
            console.log(`[Job Order Search] Automatically synced Lot ${lotNumberClean} (fetchedFromSheet=true) to SQL database`);
          }).catch(upsertErr => {
            console.error(`[Job Order Search] Failed to auto-sync Lot ${lotNumberClean} to SQL:`, upsertErr.message);
          });
        }
      } catch (err) {
        console.error(`[Job Order Search] Error preparing auto-sync:`, err.message);
      }

      return res.json({
        success: true,
        data: foundRow,
        source: 'sheets'
      });
    }

    // Fallback 1: If it existed in JobOrder database table (even if not marked fetchedFromSheet), return that
    if (dbJob) {
      console.log(`[Job Order Search] Lot ${lotNumber} not found on Google Sheet. Falling back to existing database record.`);
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
        source: 'database_fallback'
      });
    }

    // Fallback 2: Check Inventory database table
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

    console.log(`[Job Order Search] Lot ${lotNumber} not found in Google Sheets or MySQL`);
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
          'MRN WT': parseFloat(dm.weight) || 0.00,
          'Status': (dm.status || 'in_stock').toLowerCase() === 'issued' ? 'issued' : 'in_stock',
          'Party': dm.cmfName || '',
          'cmfName': dm.cmfName || '',
          'Location': dm.location || '',
          'Unit': dm.unit || 'KGS'
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
          'cmfName': m.receivedPerson || '',
          'Location': m.location || '',
          'Unit': m.unit || 'Roll'
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
          'cmfName': inv.party || '',
          'Location': inv.location || '',
          'Unit': inv.unit || 'KGS'
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

/** ====== CUTTING Logic - Backend-side Google Sheets Fetch & Processing ====== */

const HEADER_ALIAS_TO_CANON = {
  joborderno: "Job Order No",
  "joborder no": "Job Order No",
  "job order no": "Job Order No",
  jobordeerno: "Job Order No",
  orderno: "Job Order No",
  "jo no": "Job Order No",
  fabric: "Fabric",
  brand: "Brand",
  style: "Style",
  partyname: "Party Name",
  party: "Party Name",
  garmenttype: "Garment Type",
  garment: "Garment Type",
  section: "Section",
  season: "Season",
  directstitching: "Direct Stitching",
  "direct stitching": "Direct Stitching",
  lotno: "Lot No",
  lotnumber: "Lot No",
  "lot number": "Lot No",
  date: "Date",
  status: "Status",
  priority: "Priority",
  fabricsupervisor: "FABRIC_SUPERVISOR",
  "fabric supervisor": "FABRIC_SUPERVISOR",
  fabric_supervisor: "FABRIC_SUPERVISOR"
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

function normalizeKey(s = "") {
  return norm(s);
}

function formatDateYMDToDDMMMYYYY(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts.map(p => parseInt(p, 10));
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthName = monthNames[month - 1] || "";
      return `${day} ${monthName} ${year}`;
    }
  }
  return dateStr;
}

function formatSavedAtToYMD(savedAt) {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  if (isNaN(d.getTime())) return "";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const monthName = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${monthName} ${year}`;
}

function daysAfter(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return "";
  const start = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diff = Math.floor((today - start) / MS_PER_DAY);
  return Number.isFinite(diff) ? String(diff) : "";
}

function convertValuesToObjects(values) {
  if (!values || values.length === 0) return [];
  const rawHeaders = values[0];

  const canonAtIndex = rawHeaders.map((h) => HEADER_ALIAS_TO_CANON[normalizeKey(h)] || null);
  const canonToIndex = {};
  canonAtIndex.forEach((canon, idx) => {
    if (canon && !(canon in canonToIndex)) canonToIndex[canon] = idx;
  });

  return values.slice(1).map((row) => {
    const obj = {};
    [
      "Job Order No",
      "Date",
      "Fabric",
      "Brand",
      "Style",
      "Party Name",
      "Garment Type",
      "Section",
      "Season",
      "Direct Stitching",
      "Lot No",
      "Status",
      "Priority",
      "FABRIC_SUPERVISOR"
    ].forEach((canonHeader) => {
      const idx = canonToIndex[canonHeader];
      let value = idx != null ? (row[idx] ?? "") : "";

      if (canonHeader === "Date" && value) {
        value = formatDateYMDToDDMMMYYYY(value);
      }

      obj[canonHeader] = value;
    });

    if (canonToIndex["Date"] != null) {
      const originalDate = row[canonToIndex["Date"]] ?? "";
      obj["PO Date"] = originalDate;
    } else {
      obj["PO Date"] = "";
    }

    obj["Days after PO issue"] = "";
    obj["Total Qty"] = 0;
    obj["Pending Shade"] = "";
    obj["Remarks"] = "";
    obj["Cutting Date"] = "";
    return obj;
  });
}

function parseIndexRow(header, row) {
  const hmap = {};
  header.forEach((h, i) => (hmap[normalizeKey(h)] = i));
  const get = (key) => {
    const i = hmap[key];
    return i == null || i < 0 ? "" : row[i] ?? "";
  };

  const lot = String(get("lotnumber") || get("lot number") || get("lotno")).trim();
  if (!lot) return null;

  const startRow = parseInt(get("startrow") || "0", 10);
  const numRows = parseInt(get("numrows") || "0", 10);
  const headerCols = parseInt(get("headercols") || "0", 10);
  const fabric = get("fabric");
  const garmentType = get("garmenttype") || get("garment");
  const style = get("style");
  const savedAt = get("savedat");

  const sizes = String(get("sizes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const shades = String(get("shades") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const partyName = get("partyname") || get("party name");
  const brand = get("brand");
  const cuttingQty = parseFloat(get("cuttingqty") || get("cutting qty")) || 0;
  const supervisor = get("supervisor");

  return { lot, startRow, numRows, headerCols, fabric, garmentType, style, sizes, shades, savedAt, partyName, brand, cuttingQty, supervisor };
}

function sliceCuttingMatrix(bigValues, startRow, numRows) {
  if (!Array.isArray(bigValues) || bigValues.length === 0) return [];
  if (!(startRow > 0 && numRows > 0)) return [];
  const r0 = Math.max(0, startRow - 1);
  const r1 = Math.min(bigValues.length - 1, r0 + numRows - 1);
  return bigValues.slice(r0, r1 + 1);
}

function findHeaderRowIndex(windowValues, expectedSizesNorm) {
  for (let i = 0; i < Math.min(windowValues.length, 20); i++) {
    const row = windowValues[i] || [];
    const rowText = row.map(c => String(c || "").toLowerCase());
    const hasColor = rowText.some(c => c === "color" || c === "shade" || c === "shades");
    const hasCuttingTable = rowText.some(c => c === "cutting table" || c === "cuttingtable");
    const hasSizes = expectedSizesNorm.some(sz => rowText.includes(sz));

    if (hasColor && (hasCuttingTable || hasSizes)) {
      return i;
    }
  }

  let bestMatchIdx = 0;
  let bestMatchCount = 0;
  for (let i = 0; i < Math.min(windowValues.length, 20); i++) {
    const row = windowValues[i] || [];
    const rowText = row.map(c => String(c || "").toLowerCase());
    let matchCount = 0;
    expectedSizesNorm.forEach(sz => {
      if (rowText.includes(sz)) matchCount++;
    });
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestMatchIdx = i;
    }
  }
  return bestMatchIdx;
}

function calculateTotalPCS(cuttingData, startRow, numRows, sizes = []) {
  if (!cuttingData || cuttingData.length === 0) return 0;
  if (!(startRow > 0 && numRows > 0)) return 0;

  const r0 = Math.max(0, startRow - 1);
  const r1 = Math.min(cuttingData.length - 1, r0 + numRows - 1);
  const windowValues = cuttingData.slice(r0, r1 + 1);
  if (windowValues.length === 0) return 0;

  const normalizedSizes = Array.from(
    new Set((sizes || []).map((s) => normalizeKey(s)).filter(Boolean))
  );

  const localFindHeaderRowIndex = (windowValues, expectedSizesNorm) => {
    const hasSizeToken = (rowSet) => expectedSizesNorm.some((sz) => rowSet.has(sz));
    for (let i = 0; i < windowValues.length; i++) {
      const row = windowValues[i] || [];
      const set = new Set(row.map((c) => normalizeKey(c)));
      const hasShadeHeader = set.has("color") || set.has("shade") || set.has("shades");
      if (hasShadeHeader && hasSizeToken(set)) return i;
    }
    for (let i = 0; i < windowValues.length; i++) {
      const row = windowValues[i] || [];
      const set = new Set(row.map((c) => normalizeKey(c)));
      let matches = 0;
      expectedSizesNorm.forEach((sz) => {
        if (set.has(sz)) matches++;
      });
      if (matches >= 2) return i;
    }
    return 0;
  };

  const headerRowIdx = localFindHeaderRowIndex(windowValues, normalizedSizes);
  const header = windowValues[headerRowIdx] || [];

  const hIdx = {};
  header.forEach((h, i) => {
    const k = normalizeKey(h);
    if (k && !(k in hIdx)) hIdx[k] = i;
  });

  const nonSizeColumns = new Set([
    "color", "shade", "shades", "cuttingtable", "cutting", "table", "total",
    "totalpcs", "totals", "grandtotal", "sum", "lot", "style", "fabric",
    "garment", "partyname", "brand", "section", "season"
  ]);

  let sizeColIndices = [];
  header.forEach((h, i) => {
    const normalizedHeader = normalizeKey(h);
    if (normalizedHeader && !nonSizeColumns.has(normalizedHeader)) {
      sizeColIndices.push(i);
    }
  });

  if (sizeColIndices.length === 0) {
    normalizedSizes.forEach((ns) => {
      if (ns in hIdx) sizeColIndices.push(hIdx[ns]);
    });
  }

  if (sizeColIndices.length === 0) return 0;

  const shadeColIndex = hIdx["color"] ?? hIdx["shade"] ?? hIdx["shades"] ?? 0;
  let totalQty = 0;

  for (let r = headerRowIdx + 1; r < windowValues.length; r++) {
    const row = windowValues[r] || [];
    const rawShade = String(row[shadeColIndex] || "").trim();
    const shadeKey = normalizeKey(rawShade);

    if (!shadeKey || shadeKey === "total" || shadeKey === "totals" || shadeKey === "grandtotal") {
      continue;
    }

    sizeColIndices.forEach((c) => {
      const raw = row[c];
      if (raw != null && raw !== "") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        if (!isNaN(n) && n > 0) {
          totalQty += n;
        }
      }
    });
  }
  return totalQty;
}

function computePendingShades(windowValues, sizes = [], shades = []) {
  if (!windowValues || windowValues.length === 0) {
    return new Set(shades.map(norm));
  }

  const normalizedSizes = Array.from(
    new Set((sizes || []).map((s) => normalizeKey(s)).filter(Boolean))
  );
  const headerRowIdx = findHeaderRowIndex(windowValues, normalizedSizes);
  const header = windowValues[headerRowIdx] || [];

  const hIdx = {};
  header.forEach((h, i) => {
    const k = normalizeKey(h);
    if (k && !(k in hIdx)) hIdx[k] = i;
  });

  const shadeColIndex = hIdx["color"] ?? hIdx["shade"] ?? hIdx["shades"] ?? 0;

  const nonSizeColumns = new Set([
    "color", "shade", "shades", "cuttingtable", "cutting", "table", "total",
    "totalpcs", "totals", "grandtotal", "sum", "lot", "style", "fabric",
    "garment", "partyname", "brand", "section", "season"
  ]);

  let sizeColIndices = [];
  header.forEach((h, i) => {
    const normalizedHeader = normalizeKey(h);
    if (normalizedHeader && !nonSizeColumns.has(normalizedHeader)) {
      sizeColIndices.push(i);
    }
  });

  if (sizeColIndices.length === 0) {
    normalizedSizes.forEach((ns) => {
      if (ns in hIdx) sizeColIndices.push(hIdx[ns]);
    });
  }

  if (sizeColIndices.length === 0) {
    return new Set(shades.map(norm));
  }

  const shadeStats = new Map();

  for (let r = headerRowIdx + 1; r < windowValues.length; r++) {
    const row = windowValues[r] || [];
    const rawShade = String(row[shadeColIndex] || "").trim();
    const shadeKey = normalizeKey(rawShade);

    if (!shadeKey || shadeKey === "total" || shadeKey === "totals" || shadeKey === "grandtotal") {
      continue;
    }

    let hasPositiveData = false;
    let hasAnyData = false;

    sizeColIndices.forEach((c) => {
      const raw = row[c];
      if (raw != null && raw !== "") {
        hasAnyData = true;
        const n = parseFloat(String(raw).replace(/,/g, ""));
        if (!isNaN(n) && n > 0) {
          hasPositiveData = true;
        }
      }
    });

    if (hasAnyData) {
      if (hasPositiveData) {
        shadeStats.set(shadeKey, "found-with-data");
      } else {
        if (!shadeStats.has(shadeKey) || shadeStats.get(shadeKey) === "not-found") {
          shadeStats.set(shadeKey, "found-all-zero");
        }
      }
    }
  }

  const pendingShadeKeys = new Set();
  const expectedShadeKeys = (shades || []).map((sh) => normalizeKey(sh));

  expectedShadeKeys.forEach((shadeKey) => {
    const status = shadeStats.get(shadeKey);
    // If the status is 'found-all-zero', it means the shade was entered with all 0's (cancelled).
    // It should NOT be considered pending (exclude from pendingShadeKeys).
    if (!status || status === "found-no-data") {
      pendingShadeKeys.add(shadeKey);
    }
  });
  return pendingShadeKeys;
}

function extractCuttingTables(windowValues, sizes = []) {
  if (!windowValues || windowValues.length === 0) return [];
  const normalizedSizes = Array.from(
    new Set((sizes || []).map((s) => normalizeKey(s)).filter(Boolean))
  );
  const headerRowIdx = findHeaderRowIndex(windowValues, normalizedSizes);
  if (headerRowIdx >= windowValues.length) return [];
  const header = windowValues[headerRowIdx] || [];

  const hIdx = {};
  header.forEach((h, i) => {
    const k = normalizeKey(h);
    if (k && !(k in hIdx)) hIdx[k] = i;
  });

  let tableColIndex = -1;
  for (let i = 0; i < header.length; i++) {
    const headerText = String(header[i] || "").trim();
    const normalizedHeader = normalizeKey(headerText);
    if (normalizedHeader === "cuttingtable" ||
      normalizedHeader === "cutting table" ||
      headerText === "Cutting Table") {
      tableColIndex = i;
      break;
    }
  }

  if (tableColIndex === -1) {
    return [];
  }

  const sizeColumns = [];
  const sizePatterns = ['m', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', 's', 'xs', 'xxs'];
  for (let i = 0; i < header.length; i++) {
    const headerText = String(header[i] || "").trim().toLowerCase();
    if (sizePatterns.includes(headerText) ||
      (headerText.match(/^[0-9]+$/) && parseInt(headerText) > 0) ||
      sizePatterns.some(pattern => headerText === pattern)) {
      sizeColumns.push(i);
    }
  }

  for (let i = 0; i < header.length; i++) {
    const headerText = String(header[i] || "").trim();
    const num = parseFloat(headerText);
    if (!isNaN(num) && num > 0 && num < 100 && !sizeColumns.includes(i)) {
      sizeColumns.push(i);
    }
  }

  if (sizeColumns.length === 0) {
    return [];
  }

  const uniqueTables = new Set();
  for (let r = headerRowIdx + 1; r < windowValues.length; r++) {
    const row = windowValues[r] || [];
    if (!row || row.length === 0) continue;

    const shadeValue = String(row[0] || "").trim().toLowerCase();
    if (shadeValue === "total" || shadeValue === "totals" || shadeValue === "grand total") {
      continue;
    }

    let hasPositiveData = false;
    for (const colIdx of sizeColumns) {
      if (colIdx < row.length) {
        const raw = row[colIdx];
        if (raw != null && raw !== "") {
          const n = parseFloat(String(raw).replace(/,/g, ""));
          if (!isNaN(n) && n > 0) {
            hasPositiveData = true;
            break;
          }
        }
      }
    }

    if (hasPositiveData && tableColIndex < row.length) {
      const tableValue = String(row[tableColIndex] || "").trim();
      if (tableValue && tableValue !== "" && tableValue !== "0") {
        const tables = tableValue.split(/[, \s]+/).filter(t => t && t !== "" && t !== "0");
        tables.forEach(t => uniqueTables.add(t));
      }
    }
  }

  return Array.from(uniqueTables).sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  });
}

async function fetchSheet({ sheetId, range, apiKey }) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${text}`);
  }
  return res.json();
}

// Caching variables
let cachedPendingCuttingData = null;
let lastPendingCuttingFetch = 0;
const CUTTING_CACHE_TTL = 30000; // 30 seconds

export const getPendingCuttingLots = async (req, res) => {
  try {
    const isRefresh = req.query.refresh === 'true';
    const now = Date.now();

    if (!isRefresh && cachedPendingCuttingData && (now - lastPendingCuttingFetch < CUTTING_CACHE_TTL)) {
      console.log('[Sheets API] Returning cached pending cutting data...');
      return res.json({
        success: true,
        ...cachedPendingCuttingData
      });
    }

    console.log('[Sheets API] Fetching fresh cutting data from Google Sheets...');

    const JOB_SHEET_ID = "1fKSwGBIpzWEFk566WRQ4bzQ0anJlmasoY8TwrTLQHXI";
    const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
    const JOB_RANGE = "JobOrder!A:AZ";
    const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
    const INDEX_SHEET_NAME = "Index";
    const INDEX_RANGE = `${INDEX_SHEET_NAME}!A:K`;
    const CUTTING_SHEET_NAME = "Cutting";
    const CUTTING_BIG_RANGE = `${CUTTING_SHEET_NAME}!A1:ZZ300000`;

    // 1. Fetch Job Orders
    const jobRes = await fetchSheet({ sheetId: JOB_SHEET_ID, range: JOB_RANGE, apiKey: API_KEY });
    let jobRows = convertValuesToObjects(jobRes.values);

    // Filter out cancelled status
    jobRows = jobRows.filter((r) => {
      const s = (r.Status ?? "").toString();
      const sn = norm(s);
      return !sn.startsWith("cancel");
    });

    // 2. Fetch Index sheet from Budget Report
    const idxRes = await fetchSheet({ sheetId: BUDGET_SHEET_ID, range: INDEX_RANGE, apiKey: API_KEY });
    const idxValues = idxRes.values || [];
    const idxHeader = idxValues[0] || [];
    const indexMap = new Map();
    for (let i = 1; i < idxValues.length; i++) {
      const entry = parseIndexRow(idxHeader, idxValues[i]);
      if (entry) indexMap.set(entry.lot, entry);
    }

    // 3. Fetch large Cutting matrix
    const cuttingRes = await fetchSheet({ sheetId: BUDGET_SHEET_ID, range: CUTTING_BIG_RANGE, apiKey: API_KEY });
    const bigCuttingValues = cuttingRes.values || [];

    // 4. Merge sheets and calculate pending remarks
    const lots = Array.from(
      new Set(jobRows.map((r) => String(r["Lot No"] || "").trim()).filter(Boolean))
    );

    const lotToSummary = new Map();
    const pendingListTmp = {};

    for (const lot of lots) {
      const ix = indexMap.get(lot);
      if (!ix) {
        lotToSummary.set(lot, {
          totalQty: 0,
          remarks: "",
          remarks2: "",
          remarks3: "Fabric Issue Pending",
          cuttingDate: "",
          cuttingTables: []
        });
        pendingListTmp[lot] = [];
        continue;
      }

      const cuttingDate = formatSavedAtToYMD(ix.savedAt);
      const totalQty = calculateTotalPCS(bigCuttingValues, ix.startRow, ix.numRows, ix.sizes);
      const window = sliceCuttingMatrix(bigCuttingValues, ix.startRow, ix.numRows);
      const pendingShadeKeys = computePendingShades(window, ix.sizes, ix.shades);
      const cuttingTables = extractCuttingTables(window, ix.sizes);

      const shadeKeyToOriginal = new Map((ix.shades || []).map((sh) => [norm(sh), sh]));
      const pendingList = Array.from(pendingShadeKeys).map(
        (k) => shadeKeyToOriginal.get(k) || k
      );

      let remarks = "";
      let remarks2 = "";
      let remarks3 = "";

      if (pendingShadeKeys.size > 0) {
        remarks2 = "Colour Pending";
      } else {
        remarks = "Cutting Done";
      }

      lotToSummary.set(lot, {
        totalQty,
        remarks,
        remarks2,
        remarks3,
        cuttingDate,
        cuttingTables
      });
      pendingListTmp[lot] = pendingList;
    }

    const merged = jobRows.map((r) => {
      const lot = String(r["Lot No"] || "").trim();
      const days = daysAfter(r["PO Date"]);
      const sum = lotToSummary.get(lot) || {
        totalQty: 0,
        remarks: "",
        remarks2: "",
        remarks3: lot ? "Fabric Issue Pending" : "",
        cuttingDate: "",
        cuttingTables: []
      };

      const remarksList = [sum.remarks, sum.remarks2, sum.remarks3].filter(Boolean);
      const mergedRemarks = remarksList.join(" | ");

      const cuttingTablesDisplay = sum.cuttingTables && sum.cuttingTables.length > 0
        ? sum.cuttingTables.join(", ")
        : "";

      const hasIx = lot ? indexMap.has(lot) : false;

      return {
        ...r,
        "Days after PO issue": days ?? "",
        "Total Qty": sum.totalQty,
        "Pending Shade": "",
        "Cutting Date": sum.cuttingDate || "",
        "Cutting Table": cuttingTablesDisplay,
        Remarks: mergedRemarks,
        inIndexSheet: hasIx,
      };
    });

    const result = {
      rows: merged,
      pendingListByLot: pendingListTmp,
      lastUpdated: new Date().toLocaleString()
    };

    cachedPendingCuttingData = result;
    lastPendingCuttingFetch = now;

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Sheets API] Error getting pending cutting lots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/** ====== PO Details and PO Audit API endpoints ====== */

export const fetchPoDetails = async (req, res) => {
  try {
    const { poNumber } = req.params;
    if (!poNumber) {
      return res.status(400).json({ success: false, message: 'PO number is required' });
    }

    console.log(`[PO API] Fetching details for PO: ${poNumber}`);
    const data = await fetchSheet({
      sheetId: '1hy43mDxXtGVq4jeMV_NxX25Q7tnX55NnplN7eqpT74k',
      range: 'PO_items',
      apiKey: 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk'
    });

    if (!data || !data.values) {
      return res.status(404).json({ success: false, message: 'No data found in PO spreadsheet' });
    }

    const headers = data.values[0];
    const poColIdx = headers.findIndex(h => h.toLowerCase().includes('po'));
    const lineColIdx = headers.findIndex(h => h.toLowerCase().includes('line'));
    const deptColIdx = headers.findIndex(h => h.toLowerCase().includes('dept') || h.toLowerCase().includes('department'));
    const descColIdx = headers.findIndex(h => h.toLowerCase().includes('desc'));
    const uomColIdx = headers.findIndex(h => h.toLowerCase().includes('uom'));
    const qtyColIdx = headers.findIndex(h => h.toLowerCase().includes('qty'));

    if (poColIdx === -1 || descColIdx === -1) {
      return res.status(500).json({ success: false, message: 'Invalid PO sheet headers structure' });
    }

    // Filter matching rows
    const matchingLines = [];
    const searchPo = poNumber.trim().toLowerCase();

    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i];
      const rowPo = row[poColIdx] ? row[poColIdx].trim() : '';
      if (rowPo.toLowerCase() === searchPo) {
        const dept = deptColIdx !== -1 && row[deptColIdx] ? row[deptColIdx].trim() : '';
        if (dept.toLowerCase() !== 'fabric') continue;

        matchingLines.push({
          poNumber: rowPo,
          lineNo: lineColIdx !== -1 && row[lineColIdx] ? row[lineColIdx].trim() : String(matchingLines.length + 1),
          department: dept,
          description: descColIdx !== -1 && row[descColIdx] ? row[descColIdx].trim() : '',
          uom: uomColIdx !== -1 && row[uomColIdx] ? row[uomColIdx].trim() : 'MTR',
          qty: qtyColIdx !== -1 && row[qtyColIdx] ? parseFloat(row[qtyColIdx]) || 0 : 0
        });
      }
    }

    return res.json({
      success: true,
      poNumber: poNumber,
      items: matchingLines
    });

  } catch (error) {
    console.error('[PO API] Error fetching PO details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchPoAuditReport = async (req, res) => {
  try {
    console.log('[PO Audit API] Fetching PO items from Google Sheets...');
    const data = await fetchSheet({
      sheetId: '1hy43mDxXtGVq4jeMV_NxX25Q7tnX55NnplN7eqpT74k',
      range: 'PO_items',
      apiKey: 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk'
    });

    if (!data || !data.values) {
      return res.status(404).json({ success: false, message: 'No data found in PO spreadsheet' });
    }

    const headers = data.values[0];
    const poColIdx = headers.findIndex(h => h.toLowerCase().includes('po'));
    const lineColIdx = headers.findIndex(h => h.toLowerCase().includes('line'));
    const deptColIdx = headers.findIndex(h => h.toLowerCase().includes('dept') || h.toLowerCase().includes('department'));
    const descColIdx = headers.findIndex(h => h.toLowerCase().includes('desc'));
    const uomColIdx = headers.findIndex(h => h.toLowerCase().includes('uom'));
    const qtyColIdx = headers.findIndex(h => h.toLowerCase().includes('qty'));

    if (poColIdx === -1 || descColIdx === -1) {
      return res.status(500).json({ success: false, message: 'Invalid PO sheet headers structure' });
    }

    // Extract all PO items from sheet
    const poItemsMap = {};
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i];
      const rowPo = row[poColIdx] ? row[poColIdx].trim() : '';
      if (!rowPo) continue;

      const desc = descColIdx !== -1 && row[descColIdx] ? row[descColIdx].trim() : '';
      const uom = uomColIdx !== -1 && row[uomColIdx] ? row[uomColIdx].trim() : 'MTR';
      const qty = qtyColIdx !== -1 && row[qtyColIdx] ? parseFloat(row[qtyColIdx]) || 0 : 0;
      const dept = deptColIdx !== -1 && row[deptColIdx] ? row[deptColIdx].trim() : '';
      if (dept.toLowerCase() !== 'fabric') continue;

      const key = `${rowPo.toLowerCase()}|||${desc.toLowerCase()}`;
      if (!poItemsMap[key]) {
        poItemsMap[key] = {
          poNumber: rowPo,
          description: desc,
          uom: uom,
          orderedQty: 0,
          department: dept
        };
      }
      poItemsMap[key].orderedQty += qty;
    }

    // Fetch all materials received against POs from DB
    const receivedMaterials = await Material.findAll({
      attributes: [
        'poNumber',
        'name',
        [sequelize.fn('COUNT', sequelize.col('id')), 'rollsCount'],
        [sequelize.fn('SUM', sequelize.col('weight')), 'totalWeight']
      ],
      where: {
        poNumber: {
          [Op.ne]: null
        }
      },
      group: ['poNumber', 'name']
    });

    const receivedMap = {};
    receivedMaterials.forEach(m => {
      const poNum = m.getDataValue('poNumber') || '';
      const name = m.getDataValue('name') || '';
      const key = `${poNum.toLowerCase()}|||${name.toLowerCase()}`;
      receivedMap[key] = {
        rollsCount: parseInt(m.getDataValue('rollsCount')) || 0,
        totalWeight: parseFloat(m.getDataValue('totalWeight')) || 0.00
      };
    });

    // Merge sheet PO items and DB received stats
    const auditReport = [];
    Object.keys(poItemsMap).forEach(key => {
      const item = poItemsMap[key];
      const dbReceived = receivedMap[key] || { rollsCount: 0, totalWeight: 0 };

      // Determine received qty depending on UOM
      let receivedQty = 0;
      if (item.uom.toUpperCase() === 'ROLL') {
        receivedQty = dbReceived.rollsCount;
      } else {
        receivedQty = dbReceived.totalWeight;
      }

      const diff = item.orderedQty - receivedQty;
      let status = 'Match';
      if (diff > 0.01) {
        status = 'Shortage';
      } else if (diff < -0.01) {
        status = 'Excess';
      }

      auditReport.push({
        poNumber: item.poNumber,
        department: item.department,
        description: item.description,
        uom: item.uom,
        orderedQty: item.orderedQty,
        receivedRolls: dbReceived.rollsCount,
        receivedQty: parseFloat(receivedQty.toFixed(2)),
        difference: parseFloat(diff.toFixed(2)),
        status: status
      });
    });

    return res.json({
      success: true,
      report: auditReport
    });

  } catch (error) {
    console.error('[PO Audit API] Error generating PO Audit report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const fetchIssuedLots = async (req, res) => {
  try {
    const issuances = await FabricIssuance.findAll({
      attributes: ['lotNumber'],
      group: ['lotNumber']
    });
    const lotNumbers = issuances.map(iss => String(iss.lotNumber || '').trim()).filter(Boolean);
    res.json({ success: true, lotNumbers });
  } catch (error) {
    console.error('[Sheets API] Error fetching issued lot numbers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDyeingShortageReportFromSheet = async (req, res) => {
  try {
    // 1. Fetch fresh or cached sheet CSV text
    const csvText = await getSheetDataCsvText();
    const rows = parseCsvTextIntoRows(csvText);

    // 2. Group sheet data by lotNumber and shade
    const sheetGroups = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;

      const lot = String(row[2] || '').trim();
      const party = String(row[0] || '').trim();
      const itemName = String(row[1] || '').trim();

      // Skip headers or title rows
      if (
        !lot ||
        lot.toLowerCase() === 'lot no' ||
        party.toLowerCase() === 'party' ||
        party.includes('Mohit Hosiery') ||
        party.includes('JW Status')
      ) {
        continue;
      }

      const shade = String(row[5] || '').trim();
      const bill = String(row[3] || '').trim();

      // Parse weight from Op Qty (8) or Balance (13) or Issue Qty (9)
      const rawWeight = row[8] || row[13] || row[9] || '0';
      const weight = parseFloat(String(rawWeight).replace(/,/g, '')) || 0.00;

      // Parse rolls from Op Rolls (14) or Balance Rolls (18) or Issue Rolls (15)
      const rawRolls = row[14] || row[18] || row[15] || '0';
      const rolls = parseInt(rawRolls) || 0;

      // Skip entries with no weight/rolls
      if (weight === 0 && rolls === 0) continue;

      const key = `${lot.toLowerCase()}|||${shade.toLowerCase()}`;
      if (!sheetGroups[key]) {
        sheetGroups[key] = {
          lotNumber: lot,
          shade: shade,
          billNumber: bill,
          brand: party,
          fabric: itemName,
          sentRolls: 0,
          sentWeight: 0
        };
      } else {
        if (!sheetGroups[key].billNumber && bill) {
          sheetGroups[key].billNumber = bill;
        }
      }
      sheetGroups[key].sentRolls += rolls;
      sheetGroups[key].sentWeight += weight;
    }

    // 3. Fetch received dyeing materials from database (DyeingMaterial)
    const dyeingMaterials = await DyeingMaterial.findAll();
    const receivedGroups = {};
    for (const dm of dyeingMaterials) {
      const lot = String(dm.lotNumber || '').trim().toLowerCase();
      if (!lot) continue;

      // Check if shade contains a '/' (issued / received) and use the issued part to match sheet's Issue Shade
      let shade = String(dm.shade || '').trim().toLowerCase();
      if (shade.includes(' / ')) {
        shade = shade.split(' / ')[0].trim();
      }

      const key = `${lot}|||${shade}`;
      if (!receivedGroups[key]) {
        receivedGroups[key] = {
          receivedRolls: 0,
          receivedWeight: 0
        };
      }
      receivedGroups[key].receivedRolls += 1;
      receivedGroups[key].receivedWeight += parseFloat(dm.weight) || 0.00;
    }

    // 4. Compare sheet (sent) vs DB (received) to compute shortage report
    const reportData = [];
    for (const key of Object.keys(sheetGroups)) {
      const sGroup = sheetGroups[key];
      const rGroup = receivedGroups[key] || { receivedRolls: 0, receivedWeight: 0 };

      const sentRolls = sGroup.sentRolls;
      const sentWeight = sGroup.sentWeight;
      const receivedRolls = rGroup.receivedRolls;
      const receivedWeight = rGroup.receivedWeight;

      const rollDiff = sentRolls - receivedRolls;
      const weightDiff = sentWeight - receivedWeight;
      const shortagePct = sentWeight > 0 ? parseFloat(((weightDiff / sentWeight) * 100).toFixed(2)) : 0;

      // Report items that have some discrepancy
      if (weightDiff > 0.01 || rollDiff > 0) {
        reportData.push({
          billNumber: sGroup.billNumber || '—',
          lotNumber: sGroup.lotNumber,
          batchNumber: '—',
          brand: sGroup.brand || '—',
          fabric: sGroup.fabric || '—',
          sentRolls: sentRolls,
          receivedRolls: receivedRolls,
          rollDiff: Math.max(0, rollDiff),
          sentWeight: parseFloat(sentWeight.toFixed(2)),
          receivedWeight: parseFloat(receivedWeight.toFixed(2)),
          weightDiff: parseFloat(Math.max(0, weightDiff).toFixed(2)),
          shortagePct: shortagePct > 0 ? shortagePct : 0,
          sentShade: sGroup.shade || '—',
          status: shortagePct > 10 ? 'Reject' : 'Approved'
        });
      }
    }

    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('[Sheets API Shortage Report] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

let dailyCuttingReportCache = null;
let dailyCuttingReportCacheTime = 0;
const DAILY_CUTTING_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

export const getDailyCuttingReportData = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    
    if (!forceRefresh && dailyCuttingReportCache && (now - dailyCuttingReportCacheTime < DAILY_CUTTING_CACHE_DURATION)) {
      console.log('⚡ [Daily Cutting Report] Serving from memory cache');
      return res.json({ success: true, data: dailyCuttingReportCache });
    }

    const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
    const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
    const INDEX_SHEET_NAME = "Index";
    const INDEX_RANGE = `${INDEX_SHEET_NAME}!A:Z`;
    const CUTTING_SHEET_NAME = "Cutting";
    const CUTTING_BIG_RANGE = `${CUTTING_SHEET_NAME}!A1:ZZ300000`;

    // 1. Fetch Index sheet from Budget Report
    const idxRes = await fetchSheet({ sheetId: BUDGET_SHEET_ID, range: INDEX_RANGE, apiKey: API_KEY });
    const idxValues = idxRes.values || [];
    const idxHeader = idxValues[0] || [];
    
    // 2. Fetch large Cutting matrix
    const cuttingRes = await fetchSheet({ sheetId: BUDGET_SHEET_ID, range: CUTTING_BIG_RANGE, apiKey: API_KEY });
    const bigCuttingValues = cuttingRes.values || [];

    const completedLots = [];

    const formatSavedAtToYYYYMMDD = (savedAt) => {
      if (!savedAt) return "";
      const d = new Date(savedAt);
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    for (let i = 1; i < idxValues.length; i++) {
      const entry = parseIndexRow(idxHeader, idxValues[i]);
      if (!entry) continue;

      // Only fetch lots where cutting is completed or style/savedAt exists
      const cuttingDate = formatSavedAtToYYYYMMDD(entry.savedAt);
      if (!cuttingDate) continue;

      let totalQty = entry.cuttingQty;
      if (!totalQty || totalQty === 0) {
        totalQty = calculateTotalPCS(bigCuttingValues, entry.startRow, entry.numRows, entry.sizes);
      }

      const window = sliceCuttingMatrix(bigCuttingValues, entry.startRow, entry.numRows);
      const tablesList = extractCuttingTables(window, entry.sizes);
      const cuttingTableDisplay = tablesList && tablesList.length > 0 ? tablesList.join(", ") : "—";

      completedLots.push({
        "Lot No": entry.lot,
        "Fabric": entry.fabric || '—',
        "Style": entry.style || '—',
        "Brand": entry.brand || '—',
        "Garment Type": entry.garmentType || '—',
        "Party Name": entry.partyName || '—',
        "Cutting Table": cuttingTableDisplay,
        "Cutting Date": cuttingDate,
        "Supervisor": entry.supervisor || '—',
        "Total Qty": totalQty
      });
    }

    dailyCuttingReportCache = completedLots;
    dailyCuttingReportCacheTime = now;

    res.json({ success: true, data: completedLots });
  } catch (error) {
    console.error('[Sheets API Daily Cutting Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
