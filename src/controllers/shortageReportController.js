import { ShortageReport, AuditLog } from '../models/index.js';
import { Op } from 'sequelize';

export const createShortageReport = async (req, res) => {
  try {
    let itemsToCreate = [];

    // Case 1: Explicit array of entries
    if (Array.isArray(req.body.entries) && req.body.entries.length > 0) {
      itemsToCreate = req.body.entries;
    }
    // Case 2: Multiple selected classified entries (e.g. Main Fabric + RIB)
    else if (Array.isArray(req.body.selectedEntries) && req.body.selectedEntries.length > 1) {
      const parent = req.body;
      itemsToCreate = parent.selectedEntries.map(entry => {
        const issQty = parseFloat(entry.issueQty || entry.weight || 0) || 0;
        const billedQty = parseFloat(entry.billedQty || entry.opQty || issQty) || 0;
        const issRolls = parseInt(entry.totalRolls || entry.issueRolls || entry.balanceRolls || 0) || 0;
        const recdWt = parseFloat(entry.recdWeight !== undefined ? entry.recdWeight : 0) || 0;
        const shortage = parseFloat(Math.max(0, issQty - recdWt).toFixed(3));
        const shortPct = issQty > 0 ? parseFloat(((shortage / issQty) * 100).toFixed(2)) : 0.00;

        return {
          lotNumber: String(parent.lotNumber).trim(),
          jobOrderNo: entry.jobOrderNo ? String(entry.jobOrderNo).trim() : (parent.jobOrderNo ? String(parent.jobOrderNo).trim() : null),
          billNumber: parent.billNumber ? String(parent.billNumber).trim() : (entry.billNumber || entry.issueNo ? String(entry.billNumber || entry.issueNo).trim() : null),
          fabricName: entry.fabricName ? String(entry.fabricName).trim() : (parent.fabricName ? String(parent.fabricName).trim() : null),
          shade: entry.shade ? String(entry.shade).trim() : (parent.shade ? String(parent.shade).trim() : null),
          tableNo: parent.tableNo ? String(parent.tableNo).trim() : null,
          unit: parent.unit || 'KGs',
          requiredQty: billedQty,
          billedQty: billedQty,
          issuedQty: issQty,
          issuedRolls: issRolls,
          recdWeight: recdWt,
          shortageQty: shortage,
          shortagePercentage: shortPct,
          reason: parent.reason ? String(parent.reason).trim() : 'Variance Audit',
          reportedBy: parent.reportedBy ? String(parent.reportedBy).trim() : 'Store Operator',
          date: parent.date || new Date().toISOString().split('T')[0],
          issueDate: entry.issueDate ? String(entry.issueDate).trim() : (parent.issueDate ? String(parent.issueDate).trim() : null),
          remarks: parent.remarks ? String(parent.remarks).trim() : null,
          cmfParty: entry.party ? String(entry.party).trim() : (parent.cmfParty ? String(parent.cmfParty).trim() : null),
          process: entry.process ? String(entry.process).trim() : (parent.process ? String(parent.process).trim() : 'GERMAN FINISH'),
          selectedEntries: parent.selectedEntries,
          status: (shortPct > 10 || shortage > 50) ? 'Reject' : (parent.status || 'Approved')
        };
      });
    }
    // Case 3: Single entry
    else {
      itemsToCreate = [req.body];
    }

    const createdRecords = [];
    for (const item of itemsToCreate) {
      if (!item.lotNumber) continue;

      const report = await ShortageReport.create({
        lotNumber: String(item.lotNumber).trim(),
        jobOrderNo: item.jobOrderNo ? String(item.jobOrderNo).trim() : null,
        billNumber: item.billNumber ? String(item.billNumber).trim() : null,
        fabricName: item.fabricName ? String(item.fabricName).trim() : null,
        shade: item.shade ? String(item.shade).trim() : null,
        tableNo: item.tableNo ? String(item.tableNo).trim() : null,
        unit: item.unit || 'KGs',
        requiredQty: parseFloat(item.requiredQty) || parseFloat(item.billedQty) || 0.000,
        billedQty: parseFloat(item.billedQty) || 0.000,
        issuedQty: parseFloat(item.issuedQty) || 0.000,
        issuedRolls: parseInt(item.issuedRolls) || 0,
        recdWeight: parseFloat(item.recdWeight) || 0.000,
        shortageQty: parseFloat(item.shortageQty) || 0.000,
        shortagePercentage: parseFloat(item.shortagePercentage) || 0.00,
        reason: item.reason ? String(item.reason).trim() : 'Variance Audit',
        reportedBy: item.reportedBy ? String(item.reportedBy).trim() : 'Store Operator',
        date: item.date || new Date().toISOString().split('T')[0],
        issueDate: item.issueDate ? String(item.issueDate).trim() : null,
        remarks: item.remarks ? String(item.remarks).trim() : null,
        cmfParty: item.cmfParty ? String(item.cmfParty).trim() : null,
        process: item.process ? String(item.process).trim() : 'GERMAN FINISH',
        selectedEntries: item.selectedEntries || null,
        status: item.status || 'Submitted'
      });

      // Optional Audit Log
      try {
        if (AuditLog) {
          await AuditLog.create({
            action: 'CREATE_SHORTAGE_REPORT',
            entityType: 'ShortageReport',
            entityId: String(report.id),
            details: `Shortage Report created for Lot ${item.lotNumber} (${item.fabricName || 'Fabric'}, Shortage: ${report.shortageQty} ${item.unit || 'KGs'})`,
            user: item.reportedBy || 'System'
          });
        }
      } catch (auditErr) {
        console.warn('[ShortageReport] AuditLog error (non-fatal):', auditErr.message);
      }

      createdRecords.push(report);
    }

    return res.status(201).json({
      success: true,
      message: `${createdRecords.length} shortage report record(s) saved successfully`,
      data: createdRecords.length === 1 ? createdRecords[0] : createdRecords,
      count: createdRecords.length
    });
  } catch (error) {
    console.error('[ShortageReport] Error creating shortage report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save shortage report: ' + error.message
    });
  }
};

export const getShortageReports = async (req, res) => {
  try {
    const { lotNumber, billNumber, cmfParty, startDate, endDate } = req.query;
    const where = {};

    if (lotNumber) {
      where.lotNumber = { [Op.like]: `%${lotNumber}%` };
    }
    if (billNumber) {
      where.billNumber = { [Op.like]: `%${billNumber}%` };
    }
    if (cmfParty) {
      where.cmfParty = { [Op.like]: `%${cmfParty}%` };
    }
    if (startDate && endDate) {
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.date = { [Op.gte]: startDate };
    } else if (endDate) {
      where.date = { [Op.lte]: endDate };
    }

    const reports = await ShortageReport.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('[ShortageReport] Error fetching shortage reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch shortage reports: ' + error.message
    });
  }
};

export const getShortageReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ShortageReport.findByPk(id);

    if (!report) {
      return res.status(400).json({ success: false, message: 'Shortage report not found' });
    }

    return res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[ShortageReport] Error fetching shortage report by id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch report: ' + error.message
    });
  }
};

export const updateShortageReportInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const { inspectionDetails, lotNumber } = req.body;

    const report = await ShortageReport.findByPk(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Shortage report not found' });
    }

    await report.update({
      inspectionDetails: inspectionDetails
    });

    // Also update any sibling entries belonging to the exact same lotNumber
    const targetLot = lotNumber || report.lotNumber;
    if (targetLot) {
      await ShortageReport.update(
        { inspectionDetails: inspectionDetails },
        { where: { lotNumber: String(targetLot).trim() } }
      );
    }

    return res.json({
      success: true,
      message: 'Inspection details saved successfully',
      data: report
    });
  } catch (error) {
    console.error('[ShortageReport] Error updating inspection details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inspection details: ' + error.message
    });
  }
};

export const deleteShortageReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ShortageReport.findByPk(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Shortage report not found' });
    }

    await report.destroy();
    return res.json({
      success: true,
      message: 'Shortage report deleted successfully'
    });
  } catch (error) {
    console.error('[ShortageReport] Error deleting shortage report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete report: ' + error.message
    });
  }
};
