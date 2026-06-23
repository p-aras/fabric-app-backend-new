import { Router } from 'express';
import multer from 'multer';
import sequelize from '../config/db.js';

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
  searchJobOrderByLot,
  findRollByBarcode
} from '../controllers/sheetsController.js';

import {
  allIssuedBarcodes,
  storeFabricIssuance,
  issuanceHistory,
  getIssuanceSummary,
  syncOfflineData,
  getApprovalsByLot
} from '../controllers/fabricIssuanceController.js';

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

// Import auth middleware
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth routes (unprotected)
router.use('/auth', authRoutes);

// Stats route (unprotected health check / dashboard endpoint)
router.get('/stats', getStats);

// Database connection check endpoint
router.get('/test-connection', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ success: true, message: 'Database connection check passed!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Connection failed!', error: err.message });
  }
});

// Google Sheets / Barcode generation endpoints (unprotected)
router.get('/google-sheets/next-barcode-id', nextBarcodeId);
router.get('/google-sheets/fetch-dyeing-lot-details', fetchDyeingLotDetails);
router.get('/google-sheets/fetch-by-lot/:lotNo(*)', fetchSheetDataByLot);
router.get('/google-sheets/job-orders', fetchJobOrders);
router.get('/google-sheets/fabric-rolls', fetchInventoryRolls);
router.get('/google-sheets/fabric-roll/:barcodeId', findRollByBarcode);
router.post('/google-sheets/store-fabric-data', storeFabricData);
router.post('/google-sheets/store-dyeing-data', storeDyeingData);
router.post('/batch/complete', completeBatch);

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

export default router;
