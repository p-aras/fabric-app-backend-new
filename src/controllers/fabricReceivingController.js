import { FabricReturn, DyeingMaterial, Material, FabricIssuance, Inventory, sequelize } from '../models/index.js';
import { addAuditLog } from './materialController.js';
import { Op } from 'sequelize';

// 1. GET ISSUED ROLLS FOR A LOT
export const getIssuedRolls = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }

    console.log(`📡 Fetching issued rolls from MySQL for lot: ${lotNumber}`);

    // Step 1: Find all FabricIssuance records for this lot number
    const issuances = await FabricIssuance.findAll({
      where: {
        lotNumber: String(lotNumber)
      }
    });

    // Step 2: Extract all unique barcode IDs issued for this lot
    const barcodeSet = new Set();
    issuances.forEach(iss => {
      if (iss.barcodeIds) {
        try {
          const ids = JSON.parse(iss.barcodeIds);
          if (Array.isArray(ids)) {
            ids.forEach(id => barcodeSet.add(id));
          }
        } catch (e) {
          console.error('Error parsing barcodeIds:', e);
        }
      }
    });

    const barcodeIds = Array.from(barcodeSet);
    console.log(`🔍 Found ${barcodeIds.length} unique barcodes issued for Lot ${lotNumber}:`, barcodeIds);

    // Helper to find exact issued shade for a barcode
    const findExactIssuedShade = (barcode) => {
      for (const iss of issuances) {
        if (iss.issuedItems) {
          try {
            const items = JSON.parse(iss.issuedItems);
            if (Array.isArray(items)) {
              const match = items.find(it => {
                const bcs = it.barcodeIds || [];
                return bcs.includes(barcode);
              });
              if (match && match.shade) {
                return match.shade;
              }
            }
          } catch (e) {
            console.error('Error parsing issuedItems in findExactIssuedShade:', e);
          }
        }
      }
      return null;
    };

    if (barcodeIds.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Step 3: Find these rolls in DyeingMaterial table
    const rolls = await DyeingMaterial.findAll({
      where: {
        barcodeId: barcodeIds
      }
    });

    // Also check the Material table in case some rolls are stored there
    const materials = await Material.findAll({
      where: {
        code: barcodeIds
      }
    });

    // Find all returns for this lot to calculate total returned weights
    const returns = await FabricReturn.findAll({
      where: {
        lotNumber: String(lotNumber)
      }
    });

    // Map DyeingMaterial rolls
    const mappedDyeing = rolls.map(roll => {
      const rollReturns = returns.filter(r => r.originalBarcodeId === roll.barcodeId);
      const totalReturned = rollReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || r.weight || 0), 0);
      const originalIssuedWeight = parseFloat(roll.weight) || 0;

      // Status should be set properly based on returns
      let displayStatus = roll.status;
      if (totalReturned >= originalIssuedWeight) {
        displayStatus = 'returned';
      } else if (totalReturned > 0) {
        displayStatus = 'partially_issued';
      }

      return {
        id: roll.id,
        barcodeId: roll.barcodeId,
        fabricName: roll.fabricName || 'Dyeing Fabric',
        shade: findExactIssuedShade(roll.barcodeId) || roll.shade || 'N/A',
        cmfName: roll.cmfName || roll.party || '',
        party: roll.cmfName || roll.party || '',
        originalIssuedWeight: originalIssuedWeight,
        totalReturnedWeight: totalReturned,
        fabricUsedForCutting: Math.max(0, originalIssuedWeight - totalReturned),
        status: displayStatus,
        availableToReturn: Math.max(0, originalIssuedWeight - totalReturned),
        weight: originalIssuedWeight,
        remainingWeight: Math.max(0, originalIssuedWeight - totalReturned)
      };
    });

    // Map Material rolls (in case some rolls are only in Material table)
    const mappedMaterial = materials.filter(mat => !rolls.some(r => r.barcodeId === mat.code)).map(mat => {
      const rollReturns = returns.filter(r => r.originalBarcodeId === mat.code);
      const totalReturned = rollReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || r.weight || 0), 0);
      const originalIssuedWeight = parseFloat(mat.weight) || 0;

      let displayStatus = mat.status;
      if (totalReturned >= originalIssuedWeight) {
        displayStatus = 'returned';
      } else if (totalReturned > 0) {
        displayStatus = 'partially_issued';
      }

      return {
        id: mat.id,
        barcodeId: mat.code,
        fabricName: mat.name || 'Material Fabric',
        shade: findExactIssuedShade(mat.code) || mat.color || 'N/A',
        cmfName: mat.receivedPerson || '',
        party: mat.receivedPerson || '',
        originalIssuedWeight: originalIssuedWeight,
        totalReturnedWeight: totalReturned,
        fabricUsedForCutting: Math.max(0, originalIssuedWeight - totalReturned),
        status: displayStatus,
        availableToReturn: Math.max(0, originalIssuedWeight - totalReturned),
        weight: originalIssuedWeight,
        remainingWeight: Math.max(0, originalIssuedWeight - totalReturned)
      };
    });

    // Step 4: Also fetch issued rolls from the Inventory table directly
    const issuanceIds = issuances.map(iss => iss.issuanceId).filter(Boolean);
    const orConditions = [
      {
        lot_no: String(lotNumber),
        [Op.or]: [
          { bal_pkgs: '0' },
          { issue_pkgs: '1' }
        ]
      }
    ];

    if (barcodeIds.length > 0) {
      orConditions.push({ barcode: barcodeIds });
    }
    if (issuanceIds.length > 0) {
      orConditions.push({ issue_no: issuanceIds });
    }

    const invIssuedRolls = await Inventory.findAll({
      where: {
        [Op.or]: orConditions
      }
    });

    const mappedInventory = invIssuedRolls.map(roll => {
      const rollReturns = returns.filter(r => r.originalBarcodeId === roll.barcode);
      const totalReturned = rollReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || r.weight || 0), 0);
      const originalIssuedWeight = parseFloat(roll.issue_wt || roll.mrn_wt || 0);

      let displayStatus = 'issued';
      if (totalReturned >= originalIssuedWeight) {
        displayStatus = 'returned';
      } else if (totalReturned > 0) {
        displayStatus = 'partially_issued';
      }

      return {
        id: roll.id,
        barcodeId: roll.barcode,
        fabricName: roll.item_description || 'Inventory Fabric',
        shade: findExactIssuedShade(roll.barcode) || roll.shade || 'N/A',
        cmfName: roll.party || '',
        party: roll.party || '',
        originalIssuedWeight: originalIssuedWeight,
        totalReturnedWeight: totalReturned,
        fabricUsedForCutting: Math.max(0, originalIssuedWeight - totalReturned),
        status: displayStatus,
        availableToReturn: Math.max(0, originalIssuedWeight - totalReturned),
        weight: originalIssuedWeight,
        remainingWeight: Math.max(0, originalIssuedWeight - totalReturned)
      };
    });

    const allIssuedRolls = [...mappedDyeing, ...mappedMaterial];
    const seenBarcodes = new Set(allIssuedRolls.map(r => r.barcodeId));

    mappedInventory.forEach(roll => {
      if (roll.barcodeId && !seenBarcodes.has(roll.barcodeId)) {
        allIssuedRolls.push(roll);
        seenBarcodes.add(roll.barcodeId);
      }
    });

    res.json({
      success: true,
      data: allIssuedRolls
    });
  } catch (error) {
    console.error('Error in getIssuedRolls:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET RECEIVING HISTORY FOR A LOT
export const getReceivingHistory = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }

    const history = await FabricReturn.findAll({
      where: {
        lotNumber: String(lotNumber)
      },
      order: [['id', 'DESC']]
    });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error in getReceivingHistory:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2.5 GET ALL RECEIVING/RETURNS HISTORY
export const getAllReceivingHistory = async (req, res) => {
  try {
    console.log('📡 Fetching all fabric returns/receiving logs from MySQL');
    const history = await FabricReturn.findAll({
      order: [['id', 'DESC']]
    });
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error in getAllReceivingHistory:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. STORE FABRIC RETURN/RECEIVING TRANSACTION
export const storeFabricReceiving = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      lotNumber,
      fabricName,
      cmfName,
      party,
      shade,
      barcodeId,
      originalBarcodeId,
      returnedWeight,
      weight,
      returnQuantity,
      reason,
      receivedBy,
      receivedAt,
      returnDate,
      originalIssuedWeight,
      totalReturnedWeight
    } = req.body;

    console.log(`📥 Storing fabric return for roll: ${originalBarcodeId}`);

    // Create the FabricReturn entry
    const returnRecord = await FabricReturn.create({
      lotNumber: String(lotNumber),
      fabricName: fabricName || '',
      cmfName: cmfName || party || '',
      party: party || cmfName || '',
      shade: shade || '',
      barcodeId: barcodeId || originalBarcodeId,
      originalBarcodeId: originalBarcodeId,
      returnedWeight: parseFloat(returnedWeight) || 0.00,
      weight: parseFloat(weight || returnedWeight) || 0.00,
      returnQuantity: parseInt(returnQuantity) || 1,
      reason: reason || 'Returned',
      receivedBy: receivedBy || 'System',
      receivedAt: receivedAt || new Date().toISOString(),
      returnDate: returnDate || new Date().toISOString(),
      originalIssuedWeight: parseFloat(originalIssuedWeight) || 0.00,
      totalReturnedWeight: parseFloat(totalReturnedWeight) || 0.00,
      stickerPrinted: false
    }, { transaction });

    // Find corresponding roll in DyeingMaterial to update its status
    const roll = await DyeingMaterial.findOne({
      where: { barcodeId: originalBarcodeId },
      transaction
    });

    if (roll) {
      // Calculate new total returned weight including this transaction
      const existingReturns = await FabricReturn.findAll({
        where: { originalBarcodeId },
        transaction
      });
      const totalReturnedBefore = existingReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || 0), 0);
      const newTotalReturned = totalReturnedBefore + (parseFloat(returnedWeight) || 0.00);
      const originalWeight = parseFloat(roll.weight) || 0;

      let newStatus = 'partially_issued';
      if (newTotalReturned >= originalWeight) {
        newStatus = 'in_stock'; // Fully returned, back in stock
      }

      await roll.update({ status: newStatus }, { transaction });

      // Also update matching Material record in main inventory if it exists
      const material = await Material.findOne({
        where: { code: originalBarcodeId },
        transaction
      });
      if (material) {
        await material.update({
          status: newStatus === 'in_stock' ? 'Active' : 'partially_issued',
          rolls: newStatus === 'in_stock' ? material.rolls + 1 : material.rolls,
          stockKg: Math.max(0, parseFloat(material.stockKg) + (parseFloat(returnedWeight) || 0.00))
        }, { transaction });
      }
    }

    // Add Audit Log
    await addAuditLog(
      'Material Returned',
      `Fabric Lot ${lotNumber}: Roll ${originalBarcodeId} returned ${returnedWeight} kg. Reason: ${reason}`,
      receivedBy || 'System',
      'receive'
    );

    await transaction.commit();

    res.json({
      success: true,
      data: returnRecord
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in storeFabricReceiving:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. CHECK IF A BARCODE IS ISSUED FOR A LOT
export const checkBarcode = async (req, res) => {
  try {
    const { barcodeId } = req.params;
    const { lotNumber } = req.query;

    if (!barcodeId || !lotNumber) {
      return res.status(400).json({ success: false, message: 'Barcode ID and Lot Number are required' });
    }

    console.log(`🔍 Checking barcode issue status: ${barcodeId} for Lot: ${lotNumber}`);

    let isIssued = false;

    // Check if it's listed in FabricIssuance barcode list for this lot
    const issuance = await FabricIssuance.findOne({
      where: {
        lotNumber: String(lotNumber),
        barcodeIds: {
          [Op.like]: `%${barcodeId}%`
        }
      }
    });

    if (issuance) {
      isIssued = true;
    } else {
      // Fallback: Check if DyeingMaterial or Material status is issued
      const roll = await DyeingMaterial.findOne({
        where: {
          barcodeId: barcodeId,
          status: ['issued', 'partially_issued']
        }
      });
      if (roll) {
        isIssued = true;
      } else {
        const mat = await Material.findOne({
          where: {
            code: barcodeId,
            status: ['issued', 'partially_issued']
          }
        });
        if (mat) {
          isIssued = true;
        }
      }
    }

    res.json({
      success: true,
      data: {
        issued: isIssued
      }
    });
  } catch (error) {
    console.error('Error in checkBarcode:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. GENERATE NEXT RETURN BARCODE ID (R-prefix)
export const nextReturnBarcode = async (req, res) => {
  try {
    // Find the latest return record with an R-prefix barcode
    const lastReturn = await FabricReturn.findOne({
      where: {
        newBarcodeId: {
          [Op.like]: 'R%'
        }
      },
      order: [['id', 'DESC']]
    });

    let nextNumericId = 1;
    let lastId = 0;

    if (lastReturn && lastReturn.newBarcodeId) {
      const match = lastReturn.newBarcodeId.match(/^R(\d+)$/);
      if (match) {
        lastId = parseInt(match[1], 10);
        nextNumericId = lastId + 1;
      }
    }

    const barcodeId = `R${String(nextNumericId).padStart(5, '0')}`;

    res.json({
      success: true,
      data: {
        barcodeId,
        numericId: nextNumericId,
        lastId: lastId
      }
    });
  } catch (error) {
    console.error('Error in nextReturnBarcode:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. UPDATE RETURN RECORD WITH STICKER DETAILS & REGISTER NEW ROLL
export const updateReturnSticker = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { 
      originalBarcodeId, 
      newBarcodeId, 
      stickerGeneratedAt, 
      stickerPrinted,
      location,
      receivedBy,
      authorizedBy
    } = req.body;

    console.log(`🏷️ Updating return sticker for original roll ${originalBarcodeId} -> new roll ${newBarcodeId}`);

    // Update the return record
    const returnRecord = await FabricReturn.findOne({
      where: {
        originalBarcodeId: originalBarcodeId
      },
      order: [['id', 'DESC']],
      transaction
    });

    if (!returnRecord) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Return record not found for original barcode' });
    }

    await returnRecord.update({
      newBarcodeId,
      barcodeId: newBarcodeId,
      stickerGeneratedAt,
      stickerPrinted: !!stickerPrinted,
      location: location || returnRecord.location,
      receivedBy: receivedBy || returnRecord.receivedBy,
      authorizedBy: authorizedBy || returnRecord.authorizedBy
    }, { transaction });

    // Register a new active roll in DyeingMaterial table under the new R-prefix barcode
    const originalRoll = await DyeingMaterial.findOne({
      where: { barcodeId: originalBarcodeId },
      transaction
    });

    if (originalRoll) {
      await DyeingMaterial.create({
        barcodeId: newBarcodeId,
        batchNumber: originalRoll.batchNumber || '',
        batchDate: originalRoll.batchDate || '',
        batchTime: originalRoll.batchTime || '',
        cmfName: originalRoll.cmfName || '',
        fabricName: originalRoll.fabricName || '',
        lotNumber: originalRoll.lotNumber || '',
        group: originalRoll.group || '',
        shade: originalRoll.shade || '',
        billNumber: originalRoll.billNumber || '',
        date: new Date().toISOString().slice(0, 10),
        location: location || returnRecord.location || originalRoll.location || '',
        receivedPerson: receivedBy || returnRecord.receivedBy || originalRoll.receivedPerson || '',
        authorizedPerson: authorizedBy || returnRecord.authorizedBy || originalRoll.authorizedPerson || '',
        rollNumber: 1,
        batchTotal: 1,
        batchStatus: 'completed',
        weight: parseFloat(returnRecord.returnedWeight) || 0.00,
        status: 'in_stock' // The returned roll is now in stock under the new barcode
      }, { transaction });

      // Create matching Material record for active inventory
      await Material.create({
        code: newBarcodeId,
        name: originalRoll.fabricName || originalRoll.cmfName || 'Returned Dyeing Fabric',
        category: 'Summer Fabric',
        subCategory: originalRoll.group || '',
        color: originalRoll.shade || '',
        supplier: null,
        weight: parseFloat(returnRecord.returnedWeight) || 0.00,
        rolls: 1,
        unit: 'Roll',
        location: location || returnRecord.location || originalRoll.location || '',
        status: 'Active',
        stockKg: parseFloat(returnRecord.returnedWeight) || 0.00,
        billNumber: originalRoll.billNumber || '',
        receivedPerson: receivedBy || returnRecord.receivedBy || '',
        authorizedPerson: authorizedBy || returnRecord.authorizedBy || '',
        receivedDate: new Date().toISOString().slice(0, 10),
        lotNo: originalRoll.lotNumber || ''
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Sticker details updated and return roll created in inventory.'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in updateReturnSticker:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
