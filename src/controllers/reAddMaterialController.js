import { Material, Supplier } from '../models/index.js';
import { addAuditLog } from './materialController.js';
import { Op } from 'sequelize';

// 1. Get next barcode sequential ID for re-add (starts at 900000)
export const nextReAddBarcodeId = async (req, res) => {
  try {
    const lastReAdd = await Material.findOne({
      where: {
        code: {
          [Op.like]: '9%'
        }
      },
      order: [['code', 'DESC']]
    });

    let lastId = 900000;
    if (lastReAdd) {
      const match = lastReAdd.code.match(/\d+/);
      if (match) lastId = parseInt(match[0], 10);
    }
    const nextId = lastId + 1;
    const barcodeId = String(nextId);

    res.json({
      success: true,
      data: {
        barcodeId,
        numericId: nextId,
        lastId: lastId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Store re-added material roll data in Materials table
export const storeReAddMaterialData = async (req, res) => {
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

    // Ensure supplier exists in the database
    if (cmfName) {
      await Supplier.findOrCreate({
        where: { name: cmfName.trim() },
        defaults: { status: 'Active' }
      });
    }

    // Find or create material
    const material = await Material.create({
      code: barcodeId,
      name: fabricName || cmfName || 'Re-Added Fabric',
      category: 'Summer Fabric', // default category
      subCategory: group || '',
      color: shade || '',
      supplier: cmfName || null,
      weight: parseFloat(weight) || 0.00,
      rolls: 1, // single roll per barcode
      unit: 'KGS',
      location: location || '',
      status: 'Active',
      stockKg: parseFloat(weight) || 0.00,
      billNumber: billNumber || '',
      receivedPerson: receivedPerson || '',
      authorizedPerson: authorizedPerson || '',
      receivedDate: date || new Date().toISOString().slice(0, 10),
      lotNo: lotNumber || '',
      poNumber: null
    });

    await addAuditLog(
      'Material Re-Added',
      `Re-added Roll ${rollNumber}/${batchTotal} of Lot ${lotNumber} with barcode ${barcodeId} at shelf ${location}`,
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

// 3. Complete re-add batch log
export const completeReAddBatch = async (req, res) => {
  try {
    const {
      batchNumber,
      lotNumber,
      totalRolls,
      processedRolls,
      completedBy
    } = req.body;

    const detailText = `Re-Add Batch ${batchNumber} (${lotNumber || 'N/A'}): processed ${processedRolls} of ${totalRolls} rolls.`;

    await addAuditLog(
      'Re-Add Batch Completed',
      detailText,
      completedBy || 'System',
      'receive'
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
