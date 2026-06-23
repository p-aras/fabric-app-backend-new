import { Grn, Material } from '../models/index.js';
import { findAvailableLocation, addAuditLog, checkShelfCapacity } from './materialController.js';

export const getGRNs = async (req, res) => {
  try {
    const grns = await Grn.findAll({ order: [['id', 'DESC']] });
    res.json(grns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addGRN = async (req, res) => {
  try {
    const { supplier, poNumber, materialName, category, weight, rolls, invoiceNo, receivedDate, receivedBy } = req.body;
    const rollsVal = parseInt(rolls) || 0;
    const weightVal = parseFloat(weight) || 0.00;

    let location = req.body.location;
    if (!location) {
      location = await findAvailableLocation(category);
    }

    await checkShelfCapacity(location, rollsVal);

    const matCount = await Material.count();
    const newCode = `MAT${String(matCount + 1).padStart(5, '0')}`;

    const material = await Material.create({
      code: newCode,
      name: materialName,
      category,
      subCategory: '',
      color: '',
      supplier: parseInt(supplier),
      weight: weightVal,
      rolls: rollsVal,
      unit: 'Roll',
      location,
      status: 'Active',
      stockKg: weightVal,
      receivedDate,
      lotNo: req.body.lotNo || req.body.lotNumber || ''
    });

    const grnCount = await Grn.count();
    const grnNo = `GRN-${new Date().getFullYear()}-${String(grnCount + 1).padStart(3, '0')}`;

    const grnItem = await Grn.create({
      grnNo,
      supplier: parseInt(supplier),
      poNumber,
      materialId: material.id,
      weight: weightVal,
      rolls: rollsVal,
      invoiceNo,
      receivedDate,
      receivedBy,
      status: 'Completed'
    });

    await addAuditLog('Material Received', `${grnNo}: ${rollsVal} Roll(s) received`, 'Admin User', 'receive');

    res.json({ ...grnItem.toJSON(), material, location });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
