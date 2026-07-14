import { FabricIssuance, DyeingMaterial, Material, Issue, JobOrder, Inventory, FabricChangeApproval, FabricUnitConversionLog, sequelize, User, Table } from '../models/index.js';
import { addAuditLog } from './materialController.js';
import { Op } from 'sequelize';

// 1. GET ALL ISSUED BARCODES
export const allIssuedBarcodes = async (req, res) => {
  try {
    // Get issued rolls from DyeingMaterial
    const dyeingRolls = await DyeingMaterial.findAll({
      where: { status: 'issued' },
      attributes: ['barcodeId']
    });
    const barcodeSet = new Set(dyeingRolls.map(r => r.barcodeId));

    // Get issued barcodes from FabricIssuance records
    const issuances = await FabricIssuance.findAll({
      attributes: ['barcodeIds']
    });

    for (const fs of issuances) {
      if (fs.barcodeIds) {
        try {
          const ids = JSON.parse(fs.barcodeIds);
          if (Array.isArray(ids)) {
            ids.forEach(id => barcodeSet.add(id));
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }

    res.json({
      success: true,
      data: Array.from(barcodeSet)
    });
  } catch (error) {
    console.error('Error in allIssuedBarcodes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. STORE FABRIC ISSUANCE
export const storeFabricIssuance = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      lotNumber,
      jobOrderNo,
      fabric,
      brand,
      issuedItems,
      totalQuantity,
      totalWeight,
      issuedBy,
      department,
      issuedAt,
      barcodeIds,
      remarks,
      jobDetails,
      kharchaItems,
      barcodeWeights,
      matchingStatus,
      matchingPassedBy
    } = req.body;

    const issuanceId = `ISS-FAB-${Date.now()}`;

    // Create FabricIssuance record
    const issuance = await FabricIssuance.create({
      issuanceId,
      lotNumber: String(lotNumber),
      jobOrderNo: String(jobOrderNo || ''),
      fabric: String(fabric || ''),
      brand: String(brand || ''),
      totalQuantity: parseInt(totalQuantity) || 0,
      totalWeight: parseFloat(totalWeight) || 0.00,
      issuedBy: String(issuedBy || 'System'),
      department: String(department || 'Production'),
      issuedAt: String(issuedAt || new Date().toISOString()),
      status: 'completed',
      barcodeIds: JSON.stringify(barcodeIds || []),
      issuedItems: JSON.stringify(issuedItems || []),
      remarks: remarks || '',
      kharchaItems: JSON.stringify(kharchaItems || []),
      matchingStatus: matchingStatus || null,
      matchingPassedBy: matchingPassedBy || null
    }, { transaction });

    // Store FabricChangeApprovals if provided
    const { fabricChangeApprovals } = req.body;
    if (Array.isArray(fabricChangeApprovals) && fabricChangeApprovals.length > 0) {
      for (const apprv of fabricChangeApprovals) {
        await FabricChangeApproval.create({
          issuanceId,
          lotNumber: String(lotNumber),
          barcodeId: String(apprv.barcodeId),
          requiredFabric: String(apprv.requiredFabric || ''),
          scannedFabric: String(apprv.scannedFabric || ''),
          requiredShade: String(apprv.requiredShade || ''),
          scannedShade: String(apprv.scannedShade || ''),
          approvedBy: String(apprv.approvedBy || '')
        }, { transaction });
      }
      console.log(`✅ [Approval Sync] Stored ${fabricChangeApprovals.length} fabric change approvals.`);
    }

    // Store/Upsert JobOrder details if provided
    if (jobDetails) {
      await JobOrder.upsert({
        jobOrderNo: jobDetails['Job Order No'] || jobDetails.jobOrderNo || String(jobOrderNo || ''),
        lotNumber: jobDetails['Lot Number'] || jobDetails.lotNumber || String(lotNumber),
        fabric: jobDetails['Fabric'] || jobDetails.fabric || String(fabric || ''),
        brand: jobDetails['Brand'] || jobDetails.brand || String(brand || ''),
        quantity: parseInt(jobDetails['Quantity'] || jobDetails.quantity) || 0,
        unit: jobDetails['Unit'] || jobDetails.unit || '',
        shade: jobDetails['Shade'] || jobDetails.shade || '',
        date: jobDetails['Date'] || jobDetails.date || '',
        size: jobDetails['Size'] || jobDetails.size || '',
        garmentType: jobDetails['Garment Type'] || jobDetails.garmentType || '',
        section: jobDetails['Section'] || jobDetails.section || '',
        season: jobDetails['Season'] || jobDetails.season || '',
        pattern: jobDetails['Pattern'] || jobDetails.pattern || '',
        style: jobDetails['Style'] || jobDetails.style || '',
        fetchedFromSheet: true
      }, { transaction });
    }

    // Update statuses of rolls in DyeingMaterial and Material to 'issued' and create Issue records
    if (Array.isArray(barcodeIds) && barcodeIds.length > 0) {
      // Loop through barcodes to perform individual weight/unit updates if custom weights exist
      for (const barcode of barcodeIds) {
        // Retrieve original roll details from DyeingMaterial first to check if unit conversion happened
        const existingRoll = await DyeingMaterial.findOne({
          where: { barcodeId: barcode },
          transaction
        });

        const customWeight = barcodeWeights && barcodeWeights[barcode] !== undefined ? parseFloat(barcodeWeights[barcode]) : null;

        // Perform unit conversion audit logging if unit changes to KGS
        let originalUnit = '';
        let originalWeightVal = 0.00;
        let foundRoll = false;

        if (existingRoll) {
          originalUnit = String(existingRoll.unit || '').trim().toUpperCase();
          originalWeightVal = parseFloat(existingRoll.weight) || 0.00;
          foundRoll = true;
        } else {
          // Fallback to check Material table
          const existingMaterial = await Material.findOne({
            where: { code: barcode },
            transaction
          });
          if (existingMaterial) {
            originalUnit = String(existingMaterial.unit || '').trim().toUpperCase();
            originalWeightVal = parseFloat(existingMaterial.weight) || 0.00;
            foundRoll = true;
          }
        }

        if (foundRoll && customWeight !== null && originalUnit && originalUnit !== 'KGS') {
          await FabricUnitConversionLog.create({
            barcodeId: barcode,
            lotNumber: String(lotNumber),
            originalWeight: originalWeightVal,
            originalUnit: existingRoll ? existingRoll.unit : 'MTR', // Keep original case/string
            convertedWeight: customWeight,
            convertedUnit: 'KGS',
            issuanceId,
            convertedBy: String(issuedBy || 'System')
          }, { transaction });
          console.log(`📝 [Unit Conversion Log] Created conversion log for barcode ${barcode} from ${originalWeightVal} ${existingRoll ? existingRoll.unit : 'MTR'} to ${customWeight} KGS.`);
        }

        // 1. Update DyeingMaterial table
        const dmUpdate = { status: 'issued' };
        if (customWeight !== null) {
          dmUpdate.weight = customWeight;
          dmUpdate.unit = 'KGS';
        }
        await DyeingMaterial.update(
          dmUpdate,
          {
            where: { barcodeId: barcode },
            transaction
          }
        );

        // 2. Update Material table
        const material = await Material.findOne({
          where: { code: barcode },
          transaction
        });

        if (material) {
          const originalWeight = parseFloat(material.weight) || 0.00;
          const finalRollWeight = customWeight !== null ? customWeight : originalWeight;
          await material.update({
            status: 'issued',
            rolls: Math.max(0, material.rolls - 1),
            stockKg: Math.max(0.00, parseFloat(material.stockKg) - finalRollWeight),
            weight: finalRollWeight,
            unit: 'KGS'
          }, { transaction });

          const issueCount = await Issue.count({ transaction });
          const issueNo = `ISS-${new Date().getFullYear()}-${String(issueCount + 1).padStart(3, '0')}`;

          await Issue.create({
            issueNo,
            materialId: material.id,
            rolls: 1,
            department: department || 'Production',
            issuedBy: issuedBy || 'System',
            date: issuedAt ? issuedAt.split('T')[0] : new Date().toISOString().split('T')[0],
            reason: remarks || 'Issued via Barcode Scanner',
            status: 'Completed'
          }, { transaction });
        }

        // 3. Update Inventory table if exists
        const invRecord = await Inventory.findOne({
          where: { barcode: barcode },
          transaction
        });

        if (invRecord) {
          const formatDate = (date) => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = months[d.getMonth()];
            const year = String(d.getFullYear()).slice(-2);
            return `${day}-${month}-${year}`;
          };

          const invWeight = parseFloat(invRecord.bal_wt) || parseFloat(invRecord.mrn_wt) || 0.00;
          const finalInvWeight = customWeight !== null ? customWeight : invWeight;

          await invRecord.update({
            bal_wt: '0.00',
            bal_pkgs: '0',
            issue_wt: String(finalInvWeight.toFixed(2)),
            issue_pkgs: '1',
            issue_date: formatDate(new Date()),
            issue_no: issuanceId,
            unit: 'KGS'
          }, { transaction });

          console.log(`✅ [Inventory Sync] Updated barcode ${barcode} in Inventory table to issued with weight ${finalInvWeight.toFixed(2)} KGS.`);
        }
      }
    }

    // Add Audit Log
    await addAuditLog(
      'Material Issued',
      `Fabric Lot ${lotNumber}: Issued ${totalQuantity} roll(s) (${parseFloat(totalWeight).toFixed(2)} kg) to ${department}. Job Order: ${jobOrderNo}`,
      issuedBy || 'System',
      'issue'
    );

    await transaction.commit();

    res.json({
      success: true,
      data: {
        id: issuance.id,
        issuanceId
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error storing fabric issuance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET ISSUANCE HISTORY PAGINATED
export const issuanceHistory = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }

    // Get count and rows
    const { count, rows } = await FabricIssuance.findAndCountAll({
      where: { lotNumber: String(lotNumber) },
      order: [['id', 'DESC']],
      limit: pageSize,
      offset: offset
    });

    // Parse JSON fields
    const parsedRows = rows.map(row => {
      const data = row.get({ plain: true });
      try {
        data.barcodeIds = JSON.parse(data.barcodeIds || '[]');
      } catch (e) {
        data.barcodeIds = [];
      }
      try {
        data.issuedItems = JSON.parse(data.issuedItems || '[]');
        data.items = data.issuedItems; // compatibility alias
      } catch (e) {
        data.issuedItems = [];
        data.items = [];
      }
      try {
        data.kharchaItems = JSON.parse(data.kharchaItems || '[]');
      } catch (e) {
        data.kharchaItems = [];
      }
      return data;
    });

    res.json({
      success: true,
      data: parsedRows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / pageSize),
        totalRows: count,
        hasNextPage: page * pageSize < count
      }
    });
  } catch (error) {
    console.error('Error in issuanceHistory:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// New endpoint: Get aggregated issuance summary for a lot
export const getIssuanceSummary = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }
    // Fetch all issuance records for the lot
    const records = await FabricIssuance.findAll({
      where: { lotNumber: String(lotNumber) },
      attributes: ['totalQuantity', 'totalWeight', 'issuedAt', 'issuedBy']
    });
    if (!records || records.length === 0) {
      return res.status(404).json({ success: false, message: 'No issuance records found for this lot' });
    }
    // Aggregate totals and capture latest issuance info
    const summary = records.reduce((acc, rec) => {
      acc.totalQuantity += rec.totalQuantity;
      acc.totalWeight += parseFloat(rec.totalWeight) || 0;
      if (!acc.issuedAt || new Date(rec.issuedAt) > new Date(acc.issuedAt)) {
        acc.issuedAt = rec.issuedAt;
        acc.issuedBy = rec.issuedBy;
      }
      return acc;
    }, { totalQuantity: 0, totalWeight: 0, issuedAt: '', issuedBy: '' });

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error in getIssuanceSummary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. SYNC OFFLINE DATA
export const syncOfflineData = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { offlineData, dataType } = req.body;
    if (dataType !== 'issuance' || !Array.isArray(offlineData)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid data type or offline payload' });
    }

    for (const record of offlineData) {
      const {
        lotNumber,
        jobOrderNo,
        fabric,
        brand,
        issuedItems,
        totalQuantity,
        totalWeight,
        issuedBy,
        department,
        issuedAt,
        barcodeIds,
        remarks,
        offlineSavedAt,
        jobDetails,
        kharchaItems
      } = record;

      const issuanceId = `ISS-FAB-OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      await FabricIssuance.create({
        issuanceId,
        lotNumber: String(lotNumber),
        jobOrderNo: String(jobOrderNo || ''),
        fabric: String(fabric || ''),
        brand: String(brand || ''),
        totalQuantity: parseInt(totalQuantity) || 0,
        totalWeight: parseFloat(totalWeight) || 0.00,
        issuedBy: String(issuedBy || 'System'),
        department: String(department || 'Production'),
        issuedAt: String(issuedAt || new Date().toISOString()),
        status: 'completed',
        barcodeIds: JSON.stringify(barcodeIds || []),
        issuedItems: JSON.stringify(issuedItems || []),
        remarks: remarks || '',
        offlineSavedAt: offlineSavedAt || '',
        kharchaItems: JSON.stringify(kharchaItems || [])
      }, { transaction });

      // Store FabricChangeApprovals if provided offline
      const { fabricChangeApprovals } = record;
      if (Array.isArray(fabricChangeApprovals) && fabricChangeApprovals.length > 0) {
        for (const apprv of fabricChangeApprovals) {
          await FabricChangeApproval.create({
            issuanceId,
            lotNumber: String(lotNumber),
            barcodeId: String(apprv.barcodeId),
            requiredFabric: String(apprv.requiredFabric || ''),
            scannedFabric: String(apprv.scannedFabric || ''),
            requiredShade: String(apprv.requiredShade || ''),
            scannedShade: String(apprv.scannedShade || ''),
            approvedBy: String(apprv.approvedBy || '')
          }, { transaction });
        }
        console.log(`✅ [Approval Sync Offline] Stored ${fabricChangeApprovals.length} fabric change approvals.`);
      }

      if (jobDetails) {
        await JobOrder.upsert({
          jobOrderNo: jobDetails['Job Order No'] || jobDetails.jobOrderNo || String(jobOrderNo || ''),
          lotNumber: jobDetails['Lot Number'] || jobDetails.lotNumber || String(lotNumber),
          fabric: jobDetails['Fabric'] || jobDetails.fabric || String(fabric || ''),
          brand: jobDetails['Brand'] || jobDetails.brand || String(brand || ''),
          quantity: parseInt(jobDetails['Quantity'] || jobDetails.quantity) || 0,
          unit: jobDetails['Unit'] || jobDetails.unit || '',
          shade: jobDetails['Shade'] || jobDetails.shade || '',
          date: jobDetails['Date'] || jobDetails.date || '',
          size: jobDetails['Size'] || jobDetails.size || '',
          garmentType: jobDetails['Garment Type'] || jobDetails.garmentType || '',
          section: jobDetails['Section'] || jobDetails.section || '',
          season: jobDetails['Season'] || jobDetails.season || '',
          pattern: jobDetails['Pattern'] || jobDetails.pattern || '',
          style: jobDetails['Style'] || jobDetails.style || '',
          fetchedFromSheet: true
        }, { transaction });
      }

      if (Array.isArray(barcodeIds) && barcodeIds.length > 0) {
        await DyeingMaterial.update(
          { status: 'issued' },
          {
            where: { barcodeId: barcodeIds },
            transaction
          }
        );

        for (const barcode of barcodeIds) {
          const material = await Material.findOne({
            where: { code: barcode },
            transaction
          });

          if (material) {
            await material.update({
              status: 'issued',
              rolls: Math.max(0, material.rolls - 1),
              stockKg: Math.max(0.00, parseFloat(material.stockKg) - (parseFloat(material.weight) || 0.00))
            }, { transaction });

            const issueCount = await Issue.count({ transaction });
            const issueNo = `ISS-${new Date().getFullYear()}-${String(issueCount + 1).padStart(3, '0')}`;

            await Issue.create({
              issueNo,
              materialId: material.id,
              rolls: 1,
              department: department || 'Production',
              issuedBy: issuedBy || 'System',
              date: issuedAt ? issuedAt.split('T')[0] : new Date().toISOString().split('T')[0],
              reason: remarks || 'Issued via Barcode Scanner',
              status: 'Completed'
            }, { transaction });
          }

          // Also update matching record in MySQL Inventory table if exists
          const invRecord = await Inventory.findOne({
            where: { barcode: barcode },
            transaction
          });

          if (invRecord) {
            const formatDate = (date) => {
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const d = new Date(date);
              const day = String(d.getDate()).padStart(2, '0');
              const month = months[d.getMonth()];
              const year = String(d.getFullYear()).slice(-2);
              return `${day}-${month}-${year}`;
            };

            await invRecord.update({
              bal_wt: '0.00',
              bal_pkgs: '0',
              issue_wt: String(invRecord.bal_wt || invRecord.mrn_wt || '0'),
              issue_pkgs: '1',
              issue_date: formatDate(new Date()),
              issue_no: issuanceId
            }, { transaction });

            console.log(`✅ [Inventory Sync Offline] Updated barcode ${barcode} in Inventory table to issued.`);
          }
        }
      }

      await addAuditLog(
        'Material Issued',
        `[Offline Synced] Fabric Lot ${lotNumber}: Issued ${totalQuantity} roll(s) (${parseFloat(totalWeight).toFixed(2)} kg) to ${department}`,
        issuedBy || 'System',
        'issue'
      );
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('Error syncing offline data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET APPROVALS FOR A LOT
export const getApprovalsByLot = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'Lot Number is required' });
    }
    const approvals = await FabricChangeApproval.findAll({
      where: { lotNumber: String(lotNumber) },
      order: [['id', 'DESC']]
    });
    res.json({ success: true, data: approvals });
  } catch (error) {
    console.error('Error in getApprovalsByLot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET SUPERVISOR WISE ISSUANCE REPORT
export const getSupervisorIssuanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let whereClause = {};
    if (startDate || endDate) {
      whereClause.issuedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.issuedAt[Op.gte] = start.toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.issuedAt[Op.lte] = end.toISOString();
      }
    }

    const issuances = await FabricIssuance.findAll({
      where: whereClause,
      order: [['issuedAt', 'DESC']]
    });

    const report = [];

    for (const issuance of issuances) {
      const supervisor = issuance.issuedBy || 'System';
      const date = issuance.issuedAt ? issuance.issuedAt.slice(0, 10) : '';
      
      let items = [];
      try {
        items = issuance.issuedItems ? JSON.parse(issuance.issuedItems) : [];
      } catch (err) {
        console.error("Error parsing issuedItems:", err);
      }

      if (!Array.isArray(items)) {
        items = [];
      }

      if (items.length === 0) {
        report.push({
          id: `${issuance.id}-fallback`,
          date,
          supervisor,
          tableNumber: 'Not Assigned',
          rolls: issuance.totalQuantity || 0,
          weight: parseFloat(issuance.totalWeight) || 0,
          fabric: issuance.fabric || '—',
          lotNumber: issuance.lotNumber || '—',
          shade: '—'
        });
      } else {
        items.forEach((item, itemIdx) => {
          report.push({
            id: `${issuance.id}-${itemIdx}`,
            date,
            supervisor,
            tableNumber: item.tableNumber || 'Not Assigned',
            rolls: parseInt(item.qty || item.quantity) || 0,
            weight: parseFloat(item.weight) || 0,
            fabric: issuance.fabric || '—',
            lotNumber: issuance.lotNumber || '—',
            shade: item.shade || '—'
          });
        });
      }
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('[Supervisor Issuance Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET LOCATION WISE ISSUANCE REPORT
export const getLocationIssuanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let whereClause = {};
    if (startDate || endDate) {
      whereClause.issuedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.issuedAt[Op.gte] = start.toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.issuedAt[Op.lte] = end.toISOString();
      }
    }

    const issuances = await FabricIssuance.findAll({
      where: whereClause,
      order: [['issuedAt', 'DESC']]
    });

    const allBarcodes = [];
    for (const issuance of issuances) {
      let barcodeIds = [];
      try {
        barcodeIds = issuance.barcodeIds ? JSON.parse(issuance.barcodeIds) : [];
      } catch (err) {
        try {
          const items = issuance.issuedItems ? JSON.parse(issuance.issuedItems) : [];
          barcodeIds = items.flatMap(item => item.barcodeIds || []);
        } catch (itemErr) {
          console.error("Error parsing barcodes/items:", itemErr);
        }
      }
      if (Array.isArray(barcodeIds)) {
        allBarcodes.push(...barcodeIds);
      }
    }

    const barcodeLocationMap = {};

    if (allBarcodes.length > 0) {
      const [materials, dyeingMaterials] = await Promise.all([
        Material.findAll({
          where: { code: allBarcodes },
          attributes: ['code', 'location']
        }),
        DyeingMaterial.findAll({
          where: { barcodeId: allBarcodes },
          attributes: ['barcodeId', 'location']
        })
      ]);

      materials.forEach(m => {
        barcodeLocationMap[m.code] = m.location || 'Not Assigned';
      });

      dyeingMaterials.forEach(dm => {
        barcodeLocationMap[dm.barcodeId] = dm.location || 'Not Assigned';
      });
    }

    const report = [];

    for (const issuance of issuances) {
      const date = issuance.issuedAt ? issuance.issuedAt.slice(0, 10) : '';
      const supervisor = issuance.issuedBy || 'System';
      
      let items = [];
      try {
        items = issuance.issuedItems ? JSON.parse(issuance.issuedItems) : [];
      } catch (err) {
        console.error("Error parsing issuedItems:", err);
      }

      if (!Array.isArray(items)) {
        items = [];
      }

      if (items.length === 0) {
        report.push({
          id: `${issuance.id}-fallback`,
          date,
          location: 'Not Assigned',
          rolls: issuance.totalQuantity || 0,
          weight: parseFloat(issuance.totalWeight) || 0,
          fabric: issuance.fabric || '—',
          lotNumber: issuance.lotNumber || '—',
          shade: '—',
          supervisor
        });
      } else {
        items.forEach((item, itemIdx) => {
          const itemBarcodes = item.barcodeIds || [];
          
          if (itemBarcodes.length === 0) {
            report.push({
              id: `${issuance.id}-${itemIdx}-no-barcodes`,
              date,
              location: 'Not Assigned',
              rolls: parseInt(item.qty || item.quantity) || 0,
              weight: parseFloat(item.weight) || 0,
              fabric: issuance.fabric || '—',
              lotNumber: issuance.lotNumber || '—',
              shade: item.shade || '—',
              supervisor
            });
          } else {
            const locationGroups = {};
            
            itemBarcodes.forEach(bc => {
              const loc = barcodeLocationMap[bc] || 'Not Assigned';
              if (!locationGroups[loc]) {
                locationGroups[loc] = [];
              }
              locationGroups[loc].push(bc);
            });

            const totalItemBarcodes = itemBarcodes.length;
            const totalItemWeight = parseFloat(item.weight) || 0;
            const totalItemRolls = parseInt(item.qty || item.quantity) || 0;

            Object.entries(locationGroups).forEach(([loc, barcodesInLoc], locIdx) => {
              const rollsInLoc = barcodesInLoc.length;
              const weightInLoc = totalItemBarcodes > 0 ? (totalItemWeight * (rollsInLoc / totalItemBarcodes)) : 0;

              report.push({
                id: `${issuance.id}-${itemIdx}-${locIdx}`,
                date,
                location: loc,
                rolls: rollsInLoc,
                weight: parseFloat(weightInLoc.toFixed(2)),
                fabric: issuance.fabric || '—',
                lotNumber: issuance.lotNumber || '—',
                shade: item.shade || '—',
                supervisor
              });
            });
          }
        });
      }
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('[Location Issuance Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET CUTTER MASTER WISE ISSUANCE REPORT
export const getCutterMasterIssuanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let whereClause = {};
    if (startDate || endDate) {
      whereClause.issuedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.issuedAt[Op.gte] = start.toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.issuedAt[Op.lte] = end.toISOString();
      }
    }

    const [issuances, tables] = await Promise.all([
      FabricIssuance.findAll({
        where: whereClause,
        order: [['issuedAt', 'DESC']]
      }),
      Table.findAll({
        include: [
          { model: User, as: 'Supervisor', attributes: ['name'] },
          { model: User, as: 'CutterMaster', attributes: ['name'] }
        ]
      })
    ]);

    // Map table name to table details for fast O(1) matching
    const tableMap = {};
    tables.forEach(t => {
      if (t.name) {
        tableMap[t.name.toLowerCase().trim()] = t;
      }
    });

    const report = [];

    for (const issuance of issuances) {
      const date = issuance.issuedAt ? issuance.issuedAt.slice(0, 10) : '';
      
      let items = [];
      try {
        items = issuance.issuedItems ? JSON.parse(issuance.issuedItems) : [];
      } catch (err) {
        console.error("Error parsing issuedItems in CutterMasterReport:", err);
      }

      if (!Array.isArray(items)) {
        items = [];
      }

      if (items.length === 0) {
        report.push({
          id: `${issuance.id}-fallback`,
          date,
          cutterMaster: 'Unassigned',
          supervisor: 'Unassigned',
          tableNumber: 'Not Assigned',
          rolls: issuance.totalQuantity || 0,
          weight: parseFloat(issuance.totalWeight) || 0,
          fabric: issuance.fabric || '—',
          lotNumber: issuance.lotNumber || '—',
          shade: '—'
        });
      } else {
        items.forEach((item, itemIdx) => {
          const itemTableStr = String(item.tableNumber || '').trim();
          const tableKey = itemTableStr.toLowerCase();
          const tableObj = tableMap[tableKey];

          const cutterMaster = tableObj && tableObj.CutterMaster ? tableObj.CutterMaster.name : 'Unassigned';
          const supervisor = tableObj && tableObj.Supervisor ? tableObj.Supervisor.name : 'Unassigned';

          report.push({
            id: `${issuance.id}-${itemIdx}`,
            date,
            cutterMaster,
            supervisor,
            tableNumber: itemTableStr || 'Not Assigned',
            rolls: parseInt(item.qty || item.quantity) || 0,
            weight: parseFloat(item.weight) || 0,
            fabric: issuance.fabric || '—',
            lotNumber: issuance.lotNumber || '—',
            shade: item.shade || '—'
          });
        });
      }
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('[Cutter Master Issuance Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. GET DAILY FABRIC ISSUANCE REPORT (FILTERED BY DATE, TABLE, FABRIC)
export const getDailyFabricIssuanceReport = async (req, res) => {
  try {
    const { startDate, endDate, table, fabric } = req.query;

    let whereClause = {};
    if (startDate || endDate) {
      whereClause.issuedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.issuedAt[Op.gte] = start.toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.issuedAt[Op.lte] = end.toISOString();
      }
    }

    if (fabric) {
      whereClause.fabric = {
        [Op.like]: `%${fabric}%`
      };
    }

    const issuances = await FabricIssuance.findAll({
      where: whereClause,
      order: [['issuedAt', 'DESC']]
    });

    const reportData = [];
    issuances.forEach(iss => {
      let items = [];
      try {
        items = iss.issuedItems ? JSON.parse(iss.issuedItems) : [];
      } catch (e) {
        items = [];
      }

      if (!Array.isArray(items)) {
        items = [];
      }

      const dateStr = iss.issuedAt ? iss.issuedAt.slice(0, 10) : '';

      items.forEach(item => {
        // Table filter check (case-insensitive)
        const itemTable = String(item.tableNumber || 'N/A').trim();
        if (table && itemTable.toLowerCase() !== table.toLowerCase()) {
          return;
        }

        reportData.push({
          id: `${iss.id}-${item.id || item.shade || 'item'}`,
          issuanceId: iss.issuanceId,
          date: dateStr,
          lotNumber: iss.lotNumber || '—',
          jobOrderNo: iss.jobOrderNo || '—',
          fabric: iss.fabric || '—',
          brand: iss.brand || '—',
          issuedBy: iss.issuedBy || 'System',
          department: iss.department || 'Production',
          matchingStatus: iss.matchingStatus || '—',
          matchingPassedBy: iss.matchingPassedBy || '—',
          shade: item.shade || '—',
          rolls: parseInt(item.qty || item.quantity) || 0,
          weight: parseFloat(item.weight) || 0.00,
          tableNumber: itemTable,
          barcodeIds: item.barcodeIds || []
        });
      });
    });

    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('[Daily Fabric Issuance Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. GET DYEING SHORTAGE REPORT (COMPARES ISSUED VS RECEIVED FOR DYEING)
export const getDyeingShortageReport = async (req, res) => {
  try {
    // Fetch all FabricIssuance records
    const issuances = await FabricIssuance.findAll();
    
    // Fetch all DyeingMaterial records
    const dyeingMaterials = await DyeingMaterial.findAll();

    // Group received dyeing materials by lotNumber, batchNumber, billNumber, shade
    const groups = {};
    for (const dm of dyeingMaterials) {
      const lot = String(dm.lotNumber || '').trim();
      const batch = String(dm.batchNumber || '').trim();
      const bill = String(dm.billNumber || '').trim();
      const shade = String(dm.shade || '').trim();
      
      if (!lot) continue;

      const key = `${lot}|${batch}|${bill}|${shade}`;
      if (!groups[key]) {
        groups[key] = {
          lotNumber: lot,
          batchNumber: batch,
          billNumber: bill,
          shade: shade,
          fabricName: dm.fabricName || '',
          cmfName: dm.cmfName || '',
          receivedRolls: 0,
          receivedWeight: 0
        };
      }
      groups[key].receivedRolls += 1;
      groups[key].receivedWeight += parseFloat(dm.weight) || 0.00;
    }

    const reportData = [];
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      
      let sentRolls = 0;
      let sentWeight = 0;
      let brand = g.cmfName || '';
      let fabric = g.fabricName || '';

      const matchingIssuances = issuances.filter(
        iss => String(iss.lotNumber || '').trim().toLowerCase() === g.lotNumber.toLowerCase()
      );

      if (matchingIssuances.length > 0) {
        let shadeMatchFound = false;
        
        for (const iss of matchingIssuances) {
          if (!brand) brand = iss.brand;
          if (!fabric) fabric = iss.fabric;
          
          let items = [];
          try {
            items = JSON.parse(iss.issuedItems) || [];
          } catch (e) {}

          if (Array.isArray(items)) {
            const matchingItems = items.filter(item => 
              String(item.shade || '').trim().toLowerCase() === g.shade.toLowerCase()
            );
            if (matchingItems.length > 0) {
              shadeMatchFound = true;
              matchingItems.forEach(item => {
                sentRolls += parseInt(item.qty || item.quantity) || 0;
                sentWeight += parseFloat(item.weight) || 0.00;
              });
            }
          }
        }

        // Fallback: sum all issuances for this lot if shade didn't match
        if (!shadeMatchFound) {
          const lotGroups = Object.values(groups).filter(item => item.lotNumber.toLowerCase() === g.lotNumber.toLowerCase());
          const groupCount = lotGroups.length;

          let totalLotSentRolls = 0;
          let totalLotSentWeight = 0;
          
          for (const iss of matchingIssuances) {
            totalLotSentRolls += parseInt(iss.totalQuantity) || 0;
            totalLotSentWeight += parseFloat(iss.totalWeight) || 0.00;
          }

          if (groupCount > 1) {
            const totalLotReceivedWeight = lotGroups.reduce((sum, item) => sum + item.receivedWeight, 0) || 1;
            const weightRatio = g.receivedWeight / totalLotReceivedWeight;
            sentRolls = Math.round(totalLotSentRolls * weightRatio);
            sentWeight = totalLotSentWeight * weightRatio;
          } else {
            sentRolls = totalLotSentRolls;
            sentWeight = totalLotSentWeight;
          }
        }
      }

      const rollDiff = sentRolls - g.receivedRolls;
      const weightDiff = sentWeight - g.receivedWeight;
      const shortagePct = sentWeight > 0 ? parseFloat(((weightDiff / sentWeight) * 100).toFixed(2)) : 0;

      // Report items that have some discrepancy
      if (weightDiff > 0 || rollDiff > 0) {
        reportData.push({
          billNumber: g.billNumber || '—',
          lotNumber: g.lotNumber,
          batchNumber: g.batchNumber || '—',
          brand: brand || '—',
          fabric: fabric || '—',
          sentRolls: sentRolls,
          receivedRolls: g.receivedRolls,
          rollDiff: Math.max(0, rollDiff),
          sentWeight: parseFloat(sentWeight.toFixed(2)),
          receivedWeight: parseFloat(g.receivedWeight.toFixed(2)),
          weightDiff: parseFloat(Math.max(0, weightDiff).toFixed(2)),
          shortagePct: shortagePct > 0 ? shortagePct : 0,
          sentShade: g.shade || '—',
          status: shortagePct > 10 ? 'Reject' : 'Approved'
        });
      }
    }

    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('[Dyeing Shortage Report] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
