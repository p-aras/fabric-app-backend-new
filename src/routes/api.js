import { Router } from 'express';
import multer from 'multer';
import sequelize from '../config/db.js';
import { FabricIssuance, DyeingMaterial, Material, Attendance, Staff } from '../models/index.js';

// Import routes
import authRoutes from './auth.js';

// Import controllers
import {
  getMaterials,
  addMaterial,
  updateMaterial,
  deleteMaterial
} from '../controllers/materialController.js';

import {
  getGRNs,
  addGRN
} from '../controllers/grnController.js';

import {
  getIssues,
  addIssue
} from '../controllers/issueController.js';

import {
  getTransfers,
  addTransfer,
  approveTransfer,
  rejectTransfer
} from '../controllers/transferController.js';

import {
  getStats
} from '../controllers/statsController.js';

import {
  getSettingsData,
  addRoom,
  updateRoom,
  deleteRoom,
  addRack,
  deleteRack,
  addShelf,
  deleteShelf,
  addSupplier,
  updateSupplier,
  deleteSupplier
} from '../controllers/settingsController.js';

import { parseBillOcr } from '../controllers/ocrController.js';

import {
  nextBarcodeId,
  storeFabricData,
  storeDyeingData,
  completeBatch,
  fetchDyeingLotDetails,
  fetchSheetDataByLot,
  fetchJobOrders,
  fetchInventoryRolls,
  getRawInventory,
  getInventoryFilterValues,
  searchJobOrderByLot,
  findRollByBarcode,
  getPendingCuttingLots,
  getDailyInventoryReport,
  fetchPoDetails,
  fetchPoAuditReport,
  fetchIssuedLots,
  getDyeingShortageReportFromSheet,
  getDailyCuttingReportData,
  getTableWiseClassification,
  debugLotCutting
} from '../controllers/sheetsController.js';

import {
  allIssuedBarcodes,
  storeFabricIssuance,
  issuanceHistory,
  getIssuanceSummary,
  syncOfflineData,
  getApprovalsByLot,
  getSupervisorIssuanceReport,
  getLocationIssuanceReport,
  getDailyFabricIssuanceReport,
  getDyeingShortageReport,
  getCutterMasterIssuanceReport
} from '../controllers/fabricIssuanceController.js';

import {
  getTables,
  addTable,
  updateTable,
  deleteTable
} from '../controllers/tableController.js';

import {
  getIssuedRolls,
  getReceivingHistory,
  getAllReceivingHistory,
  storeFabricReceiving,
  checkBarcode,
  nextReturnBarcode,
  updateReturnSticker
} from '../controllers/fabricReceivingController.js';

import {
  savePartaData,
  getPartaData,
  getPartaPendingReport
} from '../controllers/partaController.js';

import {
  nextReAddBarcodeId,
  storeReAddMaterialData,
  completeReAddBatch
} from '../controllers/reAddMaterialController.js';

// Import auth middleware
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth routes (unprotected)
router.use('/auth', authRoutes);

// Stats route (unprotected health check / dashboard endpoint)
router.get('/stats', getStats);
router.get('/health', (req, res) => res.json({ success: true }));

// Database connection check endpoint
router.get('/test-connection', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ success: true, message: 'Database connection check passed!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Connection failed!', error: err.message });
  }
});

router.get('/debug-lot/:lotNumber', async (req, res) => {
  try {
    const { lotNumber } = req.params;
    const issuances = await FabricIssuance.findAll({ where: { lotNumber: String(lotNumber) } });
    const barcodeSet = new Set();
    issuances.forEach(iss => {
      if (iss.barcodeIds) {
        try {
          const ids = JSON.parse(iss.barcodeIds);
          if (Array.isArray(ids)) ids.forEach(id => barcodeSet.add(id));
        } catch (e) {}
      }
    });
    const barcodeIds = Array.from(barcodeSet);
    const dyeingMaterials = await DyeingMaterial.findAll({ where: { barcodeId: barcodeIds } });
    const materials = await Material.findAll({ where: { code: barcodeIds } });
    res.json({
      success: true,
      lotNumber,
      issuancesCount: issuances.length,
      barcodeIdsCount: barcodeIds.length,
      barcodeIds,
      dyeingMaterialsFound: dyeingMaterials.length,
      materialsFound: materials.length,
      dyeingMaterials: dyeingMaterials.map(d => ({ barcodeId: d.barcodeId, shade: d.shade, weight: d.weight, status: d.status })),
      materials: materials.map(m => ({ code: m.code, name: m.name, weight: m.weight }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/debug-lot-cutting/:lot', debugLotCutting);

router.get('/debug-issuances', async (req, res) => {
  try {
    const issuances = await FabricIssuance.findAll({ raw: true });
    res.json({ count: issuances.length, sample: issuances.slice(0, 100) });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// Google Sheets / Barcode generation endpoints (unprotected)
router.get('/google-sheets/next-barcode-id', nextBarcodeId);
router.get('/google-sheets/fetch-dyeing-lot-details', fetchDyeingLotDetails);
router.get('/google-sheets/fetch-by-lot/:lotNo(*)', fetchSheetDataByLot);
router.get('/google-sheets/job-orders', fetchJobOrders);
router.get('/google-sheets/fabric-rolls', fetchInventoryRolls);
router.get('/google-sheets/pending-cutting', getPendingCuttingLots);
router.get('/google-sheets/issued-lots', fetchIssuedLots);
router.get('/reports/daily-cutting-completed', getDailyCuttingReportData);
router.get('/reports/table-wise-classification', getTableWiseClassification);

router.get('/inventory', getRawInventory);
router.get('/reports/daily-inventory-quantity', getDailyInventoryReport);
router.get('/inventory/filter-values', getInventoryFilterValues);
router.get('/google-sheets/fabric-roll/:barcodeId', findRollByBarcode);
router.post('/google-sheets/store-fabric-data', storeFabricData);
router.post('/google-sheets/store-dyeing-data', storeDyeingData);
router.post('/batch/complete', completeBatch);

// Re-Add Material endpoints (unprotected)
router.get('/re-add-material/next-barcode-id', nextReAddBarcodeId);
router.post('/re-add-material/store', storeReAddMaterialData);
router.post('/re-add-material/complete-batch', completeReAddBatch);

// Purchase Order fetch and audit endpoints
router.get('/po/details/:poNumber', fetchPoDetails);
router.get('/po/audit', fetchPoAuditReport);


// Local Parta CRUD endpoints (saves in MySQL if kharcha is 0)
router.post('/parta/save', savePartaData);
router.get('/parta/load/:lotNumber', getPartaData);
router.get('/parta/pending-report', getPartaPendingReport);

// Job Order search endpoints (unprotected for offline/sheet integration)
router.get('/job-orders/search/:lotNumber', searchJobOrderByLot);

// Fabric Issuance Endpoints (unprotected for offline/sheet integration)
router.get('/all-issued-barcodes', allIssuedBarcodes);
router.post('/store-fabric-issuance', storeFabricIssuance);
router.get('/issuance-history/:lotNumber', issuanceHistory);
router.get('/issuance-summary/:lotNumber', getIssuanceSummary);
router.get('/fabric-approvals/:lotNumber', getApprovalsByLot);
router.post('/sync-offline-data', syncOfflineData);
router.get('/reports/supervisor-issuance', getSupervisorIssuanceReport);
router.get('/reports/location-issuance', getLocationIssuanceReport);
router.get('/reports/daily-fabric-issuance', getDailyFabricIssuanceReport);
router.get('/reports/dyeing-shortage', getDyeingShortageReport);
router.get('/reports/dyeing-shortage-sheet', getDyeingShortageReportFromSheet);
router.get('/reports/cutter-master-issuance', getCutterMasterIssuanceReport);
// Fabric Receiving Endpoints
router.get('/fabric-receiving/issued-rolls/:lotNumber', getIssuedRolls);
router.get('/fabric-receiving/receiving-history', getAllReceivingHistory);
router.get('/fabric-receiving/receiving-history/:lotNumber', getReceivingHistory);
router.post('/fabric-receiving/store-fabric-receiving', storeFabricReceiving);
router.get('/fabric-receiving/check-barcode/:barcodeId', checkBarcode);
router.get('/fabric-receiving/next-return-barcode', nextReturnBarcode);
router.post('/fabric-receiving/update-return-sticker', updateReturnSticker);

// Protected routes using authMiddleware
router.use(authMiddleware);

// Materials CRUD
router.get('/materials', getMaterials);
router.post('/materials', addMaterial);
router.put('/materials/:id', updateMaterial);
router.delete('/materials/:id', deleteMaterial);

// Goods Receiving (GRN)
router.get('/grns', getGRNs);
router.post('/grns', addGRN);

// Stock Dispatch (Issues)
router.get('/issues', getIssues);
router.post('/issues', addIssue);

// Location Transfers
router.get('/transfers', getTransfers);
router.post('/transfers', addTransfer);
router.post('/transfers/:id/approve', approveTransfer);
router.post('/transfers/:id/reject', rejectTransfer);

// General Settings Data
router.get('/settings', getSettingsData);

// Rooms Management
router.post('/rooms', addRoom);
router.put('/rooms/:id', updateRoom);
router.delete('/rooms/:id', deleteRoom);

// Racks Management
router.post('/racks', addRack);
router.delete('/racks/:id', deleteRack);

// Shelves Management
router.post('/shelves', addShelf);
router.delete('/shelves/:id', deleteShelf);

// Suppliers Management
router.post('/suppliers', addSupplier);
router.put('/suppliers/:id', updateSupplier);
router.delete('/suppliers/:id', deleteSupplier);

// OCR Bill Parser
router.post('/ocr/parse-bill', upload.single('bill'), parseBillOcr);

// Tables Management
router.get('/tables', getTables);
router.post('/tables', addTable);
router.put('/tables/:id', updateTable);
router.delete('/tables/:id', deleteTable);

// --- ATTENDANCE ENDPOINTS ---
router.post('/attendance', async (req, res) => {
  try {
    const { date, department, hodName, hodStatus, supervisors, helpers, masters, mastersCount, hods } = req.body;
    if (!date || !department) {
      return res.status(400).json({ success: false, message: 'Date and department are required.' });
    }

    const parsedHods = Array.isArray(hods) ? hods : JSON.parse(hods || '[]');
    const firstHodName = parsedHods[0]?.name || hodName || '';
    const firstHodStatus = parsedHods[0]?.status || hodStatus || '';

    let record = await Attendance.findOne({ where: { date, department } });
    if (record) {
      record.hodName = firstHodName;
      record.hodStatus = firstHodStatus;
      record.hods = typeof hods === 'string' ? hods : JSON.stringify(hods || []);
      record.supervisors = typeof supervisors === 'string' ? supervisors : JSON.stringify(supervisors || []);
      record.helpers = typeof helpers === 'string' ? helpers : JSON.stringify(helpers || []);
      record.masters = typeof masters === 'string' ? masters : JSON.stringify(masters || []);
      record.mastersCount = parseInt(mastersCount) || 0;
      await record.save();
    } else {
      record = await Attendance.create({
        date,
        department,
        hodName: firstHodName,
        hodStatus: firstHodStatus,
        hods: typeof hods === 'string' ? hods : JSON.stringify(hods || []),
        supervisors: typeof supervisors === 'string' ? supervisors : JSON.stringify(supervisors || []),
        helpers: typeof helpers === 'string' ? helpers : JSON.stringify(helpers || []),
        masters: typeof masters === 'string' ? masters : JSON.stringify(masters || []),
        mastersCount: parseInt(mastersCount) || 0
      });
    }

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const { date } = req.query;
    const where = {};
    if (date) {
      where.date = date;
    }
    const list = await Attendance.findAll({ where, order: [['date', 'DESC'], ['department', 'ASC']] });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Attendance.findByPk(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    }
    await record.destroy();
    res.json({ success: true, message: 'Attendance record deleted successfully.' });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STAFF MASTER REGISTRY ENDPOINTS ---
router.get('/staff', async (req, res) => {
  try {
    const list = await Staff.findAll({ order: [['role', 'ASC'], ['name', 'ASC']] });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching staff registry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/staff', async (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name || !name.trim() || !role) {
      return res.status(400).json({ success: false, message: 'Name and Role are required.' });
    }
    const member = await Staff.create({
      name: name.trim(),
      role: role.trim()
    });
    res.json({ success: true, data: member });
  } catch (error) {
    console.error('Error adding staff member:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/staff/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Staff.findByPk(id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }
    await member.destroy();
    res.json({ success: true, message: 'Staff member removed successfully.' });
  } catch (error) {
    console.error('Error removing staff member:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
