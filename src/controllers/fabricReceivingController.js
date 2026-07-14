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
    const issuanceIds = [];
    issuances.forEach(iss => {
      if (iss.issuanceId) issuanceIds.push(iss.issuanceId);
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
    console.log(`🔍 Found ${barcodeIds.length} unique barcodes issued for Lot ${lotNumber}`);

    // Find all returns for this lot to calculate total returned weights
    const returns = await FabricReturn.findAll({
      where: {
        lotNumber: String(lotNumber)
      }
    });

    // Query databases to build a map of barcode -> actual details
    const barcodeMap = {};
    
    if (barcodeIds.length > 0) {
      const dyeingRolls = await DyeingMaterial.findAll({ where: { barcodeId: barcodeIds } });
      dyeingRolls.forEach(r => {
        barcodeMap[r.barcodeId] = {
          id: r.id,
          weight: parseFloat(r.weight) || 0,
          fabricName: r.fabricName || 'Dyeing Fabric',
          shade: r.shade,
          status: r.status,
          cmfName: r.cmfName || r.party || '',
          party: r.cmfName || r.party || ''
        };
      });

      const materialRolls = await Material.findAll({ where: { code: barcodeIds } });
      materialRolls.forEach(m => {
        if (!barcodeMap[m.code]) {
          barcodeMap[m.code] = {
            id: m.id,
            weight: parseFloat(m.weight) || 0,
            fabricName: m.name || 'Material Fabric',
            shade: m.color,
            status: m.status,
            cmfName: m.receivedPerson || '',
            party: m.receivedPerson || ''
          };
        }
      });
    }

    // Also look up in Inventory
    const orConditions = [{ lot_no: String(lotNumber) }];
    if (barcodeIds.length > 0) orConditions.push({ barcode: barcodeIds });
    if (issuanceIds.length > 0) orConditions.push({ issue_no: issuanceIds });

    const invIssuedRolls = await Inventory.findAll({ where: { [Op.or]: orConditions } });
    invIssuedRolls.forEach(r => {
      if (r.barcode && !barcodeMap[r.barcode]) {
        barcodeMap[r.barcode] = {
          id: r.id,
          weight: parseFloat(r.issue_wt || r.mrn_wt || 0),
          fabricName: r.item_description || 'Inventory Fabric',
          shade: r.shade,
          status: 'issued',
          cmfName: r.party || '',
          party: r.party || ''
        };
      }
    });

    // Build the final array
    const allIssuedRolls = [];
    const processedBarcodes = new Set();

    issuances.forEach(iss => {
      if (iss.issuedItems) {
        try {
          const items = JSON.parse(iss.issuedItems);
          if (Array.isArray(items)) {
            items.forEach(item => {
              const itemShade = item.shade || 'N/A';
              const itemWeight = parseFloat(item.weight) || 0;
              const barcodes = item.barcodeIds || [];
              const rollsCount = parseInt(item.rolls) || barcodes.length || 1;

              if (barcodes.length > 0) {
                barcodes.forEach(bId => {
                  if (processedBarcodes.has(bId)) return;
                  processedBarcodes.add(bId);

                  const dbInfo = barcodeMap[bId] || {};
                  const originalIssuedWeight = dbInfo.weight !== undefined ? dbInfo.weight : (itemWeight / rollsCount);

                  const rollReturns = returns.filter(r => r.originalBarcodeId === bId);
                  const totalReturned = rollReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || r.weight || 0), 0);

                  let displayStatus = dbInfo.status || 'issued';
                  if (totalReturned >= originalIssuedWeight) {
                    displayStatus = 'returned';
                  } else if (totalReturned > 0) {
                    displayStatus = 'partially_issued';
                  }

                  allIssuedRolls.push({
                    id: dbInfo.id || bId,
                    barcodeId: bId,
                    fabricName: dbInfo.fabricName || iss.fabric || 'Fabric',
                    shade: itemShade,
                    shadeEntry: item.shadeEntry || null,
                    shadeId: item.id || null,
                    cmfName: dbInfo.cmfName || iss.issuedBy || '',
                    party: dbInfo.party || iss.issuedBy || '',
                    originalIssuedWeight,
                    totalReturnedWeight: totalReturned,
                    fabricUsedForCutting: Math.max(0, originalIssuedWeight - totalReturned),
                    status: displayStatus,
                    availableToReturn: Math.max(0, originalIssuedWeight - totalReturned),
                    weight: originalIssuedWeight,
                    remainingWeight: Math.max(0, originalIssuedWeight - totalReturned)
                  });
                });
              }
            });
          }
        } catch (e) {
          console.error('Error processing issuedItems:', e);
        }
      }
    });

    // Fallback: If no rolls were parsed from issuedItems (e.g. legacy/empty format), 
    // fall back to mapping barcodes directly from barcodeIds list
    barcodeIds.forEach(bId => {
      if (processedBarcodes.has(bId)) return;
      processedBarcodes.add(bId);

      const dbInfo = barcodeMap[bId] || {};
      const originalIssuedWeight = dbInfo.weight || 0;

      const rollReturns = returns.filter(r => r.originalBarcodeId === bId);
      const totalReturned = rollReturns.reduce((sum, r) => sum + parseFloat(r.returnedWeight || r.weight || 0), 0);

      let displayStatus = dbInfo.status || 'issued';
      if (totalReturned >= originalIssuedWeight) {
        displayStatus = 'returned';
      } else if (totalReturned > 0) {
        displayStatus = 'partially_issued';
      }

      allIssuedRolls.push({
        id: dbInfo.id || bId,
        barcodeId: bId,
        fabricName: dbInfo.fabricName || 'Fabric',
        shade: dbInfo.shade || 'N/A',
        shadeEntry: null,
        shadeId: null,
        cmfName: dbInfo.cmfName || '',
        party: dbInfo.party || '',
        originalIssuedWeight,
        totalReturnedWeight: totalReturned,
        fabricUsedForCutting: Math.max(0, originalIssuedWeight - totalReturned),
        status: displayStatus,
        availableToReturn: Math.max(0, originalIssuedWeight - totalReturned),
        weight: originalIssuedWeight,
        remainingWeight: Math.max(0, originalIssuedWeight - totalReturned)
      });
    });

    console.log(`✅ Returning ${allIssuedRolls.length} mapped issued rolls for Lot ${lotNumber}`);
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
