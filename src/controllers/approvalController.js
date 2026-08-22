import { ApprovalRequest, AuditLog } from '../models/index.js';

export const getApprovalRequests = async (req, res) => {
  try {
    const requests = await ApprovalRequest.findAll({
      order: [['id', 'DESC']]
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createApprovalRequest = async (req, res) => {
  try {
    const { lotNumber, tableNo, requestedBy, reason, requestedWeight } = req.body;
    
    if (!lotNumber || !tableNo || !requestedBy) {
      return res.status(400).json({ success: false, error: 'lotNumber, tableNo, and requestedBy are required.' });
    }

    const appReq = await ApprovalRequest.create({
      lotNumber,
      tableNo,
      requestedBy,
      reason: reason || 'Special Permission Eligibility Override',
      requestedWeight: requestedWeight || 0,
      status: 'Pending'
    });

    await AuditLog.create({
      action: 'Special Issuance Approval Requested',
      detail: `Approval requested by ${requestedBy} for Lot: ${lotNumber} on ${tableNo}. Reason: ${reason || 'N/A'}`,
      user: requestedBy,
      date: new Date().toISOString(),
      type: 'approval_request'
    }).catch(err => console.error('AuditLog error:', err));

    res.json({ success: true, data: appReq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const respondApprovalRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, respondedBy } = req.body; // status: 'Approved' or 'Rejected'

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be Approved or Rejected' });
    }

    const appReq = await ApprovalRequest.findByPk(id);
    if (!appReq) {
      return res.status(404).json({ success: false, error: 'Approval request not found' });
    }

    const responder = respondedBy || req.user?.name || 'Admin';

    await appReq.update({
      status,
      respondedBy: responder,
      respondedAt: new Date()
    });

    // Auto-resolve any other pending approval requests for the same table
    if (appReq.tableNo) {
      await ApprovalRequest.update(
        {
          status,
          respondedBy: responder,
          respondedAt: new Date()
        },
        {
          where: {
            tableNo: appReq.tableNo,
            status: 'Pending'
          }
        }
      ).catch(err => console.error('Error updating matching pending requests:', err));
    }

    await AuditLog.create({
      action: `Special Issuance Approval ${status}`,
      detail: `Lot: ${appReq.lotNumber} on ${appReq.tableNo} was ${status} by ${responder}`,
      user: responder,
      date: new Date().toISOString(),
      type: 'approval_response'
    }).catch(err => console.error('AuditLog error:', err));

    res.json({ success: true, data: appReq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const appReq = await ApprovalRequest.findByPk(id);
    if (!appReq) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({ success: true, data: appReq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const consumeApprovalRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { tableNo, lotNumber } = req.body || {};

    if (id && id !== 'undefined' && id !== 'null') {
      const appReq = await ApprovalRequest.findByPk(id);
      if (appReq) {
        await appReq.update({ status: 'Used' });
        return res.json({ success: true, data: appReq });
      }
    }

    if (tableNo) {
      const whereCond = { tableNo, status: 'Approved' };
      if (lotNumber) whereCond.lotNumber = lotNumber;
      await ApprovalRequest.update({ status: 'Used' }, { where: whereCond });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
