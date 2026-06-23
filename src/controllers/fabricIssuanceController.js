import { FabricIssuance, DyeingMaterial, Material, Issue, JobOrder, Inventory, FabricChangeApproval, sequelize } from '../models/index.js';
import { addAuditLog } from './materialController.js';

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
      jobDetails
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
      remarks: remarks || ''
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
        style: jobDetails['Style'] || jobDetails.style || ''
      }, { transaction });
    }

    // Update statuses of rolls in DyeingMaterial and Material to 'issued' and create Issue records
    if (Array.isArray(barcodeIds) && barcodeIds.length > 0) {
      await DyeingMaterial.update(
        { status: 'issued' },
        {
          where: { barcodeId: barcodeIds },
          transaction
        }
      );

      // Decrement inventory rolls and create entries in the main Issue table
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

          console.log(`✅ [Inventory Sync] Updated barcode ${barcode} in Inventory table to issued.`);
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
        jobDetails
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
        offlineSavedAt: offlineSavedAt || ''
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
          style: jobDetails['Style'] || jobDetails.style || ''
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
