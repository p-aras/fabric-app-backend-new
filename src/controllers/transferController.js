import { Transfer, Material, sequelize } from '../models/index.js';
import { addAuditLog, checkShelfCapacity } from './materialController.js';

export const getTransfers = async (req, res) => {
  try {
    const transfers = await Transfer.findAll({ order: [['id', 'DESC']] });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { materialId, fromLocation, toLocation, rolls, reason, date, transferredBy } = req.body;
    const rollsVal = parseInt(rolls);

    const mat = await Material.findByPk(materialId, { transaction });
    if (!mat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Material not found' });
    }

    const originalRolls = mat.rolls;
    const originalWeight = parseFloat(mat.weight) || 0;

    if (rollsVal <= 0 || rollsVal > originalRolls) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Invalid rolls quantity for transfer' });
    }

    // Check shelf capacity at destination
    await checkShelfCapacity(toLocation, rollsVal, null, transaction);

    if (req.user?.role !== 'Admin') {
      const totalTransfers = await Transfer.count({ transaction });
      const transferNo = `TRF-${new Date().getFullYear()}-${String(totalTransfers + 1).padStart(3, '0')}`;

      const trf = await Transfer.create({
        transferNo,
        materialId,
        fromLocation,
        toLocation,
        rolls: rollsVal,
        reason,
        date,
        transferredBy: req.user?.name || transferredBy,
        status: 'Pending'
      }, { transaction });

      await addAuditLog('Material Transfer Requested', `${transferNo}: ${rollsVal} Roll(s) requested for transfer ${fromLocation}→${toLocation}`, req.user?.name || 'User', 'transfer');

      await transaction.commit();
      return res.json(trf);
    }

    const count = await Material.count({ transaction });
    const newCode = `MAT${String(count + 1).padStart(5, '0')}`;

    let finalMaterialId = materialId;

    if (rollsVal < originalRolls) {
      // Partial Transfer - Split material
      const transferredWeight = Number(((originalWeight / originalRolls) * rollsVal).toFixed(2));
      const remainingWeight = Number((originalWeight - transferredWeight).toFixed(2));

      // Create new material batch at destination shelf
      const newMat = await Material.create({
        code: newCode,
        name: mat.name,
        category: mat.category,
        subCategory: mat.subCategory,
        color: mat.color,
        supplier: mat.supplier,
        weight: transferredWeight,
        rolls: rollsVal,
        unit: mat.unit,
        location: toLocation,
        status: mat.status,
        stockKg: transferredWeight,
        billNumber: mat.billNumber,
        receivedPerson: mat.receivedPerson,
        authorizedPerson: mat.authorizedPerson,
        receivedDate: new Date().toISOString().slice(0, 10),
        lotNo: mat.lotNo
      }, { transaction });

      // Update original material
      await mat.update({
        rolls: originalRolls - rollsVal,
        weight: remainingWeight,
        stockKg: remainingWeight
      }, { transaction });

      await addAuditLog('New Material Created', `${newMat.code}: ${newMat.name} split via partial transfer`, req.user?.name || 'Admin User', 'create');
      
      finalMaterialId = newMat.id;
    } else {
      // Full Transfer - Just move the location
      await mat.update({ location: toLocation }, { transaction });
    }

    const totalTransfers = await Transfer.count({ transaction });
    const transferNo = `TRF-${new Date().getFullYear()}-${String(totalTransfers + 1).padStart(3, '0')}`;

    const trf = await Transfer.create({
      transferNo,
      materialId: finalMaterialId,
      fromLocation,
      toLocation,
      rolls: rollsVal,
      reason,
      date,
      transferredBy: req.user?.name || transferredBy,
      status: 'Completed'
    }, { transaction });

    await addAuditLog('Material Transfer', `${transferNo}: ${rollsVal} Roll(s) moved ${fromLocation}→${toLocation}`, req.user?.name || 'Admin User', 'transfer');

    await transaction.commit();
    res.json(trf);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
};

export const approveTransfer = async (req, res) => {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Only administrators can approve transfers.' });
  }

  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const trf = await Transfer.findByPk(id, { transaction });
    if (!trf) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (trf.status !== 'Pending') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Transfer request is already processed' });
    }

    const mat = await Material.findByPk(trf.materialId, { transaction });
    if (!mat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Material not found' });
    }

    const rollsVal = trf.rolls;
    const originalRolls = mat.rolls;
    const originalWeight = parseFloat(mat.weight) || 0;

    if (rollsVal <= 0 || rollsVal > originalRolls) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Invalid rolls quantity for transfer approval' });
    }

    // Check shelf capacity at destination
    await checkShelfCapacity(trf.toLocation, rollsVal, null, transaction);

    let finalMaterialId = trf.materialId;

    if (rollsVal < originalRolls) {
      // Partial Transfer - Split material
      const transferredWeight = Number(((originalWeight / originalRolls) * rollsVal).toFixed(2));
      const remainingWeight = Number((originalWeight - transferredWeight).toFixed(2));

      const matCount = await Material.count({ transaction });
      const newCode = `MAT${String(matCount + 1).padStart(5, '0')}`;

      // Create new material batch at destination shelf
      const newMat = await Material.create({
        code: newCode,
        name: mat.name,
        category: mat.category,
        subCategory: mat.subCategory,
        color: mat.color,
        supplier: mat.supplier,
        weight: transferredWeight,
        rolls: rollsVal,
        unit: mat.unit,
        location: trf.toLocation,
        status: mat.status,
        stockKg: transferredWeight,
        billNumber: mat.billNumber,
        receivedPerson: mat.receivedPerson,
        authorizedPerson: mat.authorizedPerson,
        receivedDate: new Date().toISOString().slice(0, 10),
        lotNo: mat.lotNo
      }, { transaction });

      // Update original material
      await mat.update({
        rolls: originalRolls - rollsVal,
        weight: remainingWeight,
        stockKg: remainingWeight
      }, { transaction });

      await addAuditLog('New Material Created', `${newMat.code}: ${newMat.name} split via approved transfer`, req.user?.name || 'Admin User', 'create');
      
      finalMaterialId = newMat.id;
    } else {
      // Full Transfer - Just move the location
      await mat.update({ location: trf.toLocation }, { transaction });
    }

    // Update the transfer record
    await trf.update({
      materialId: finalMaterialId,
      status: 'Completed',
      date: new Date().toISOString().slice(0, 10)
    }, { transaction });

    await addAuditLog('Material Transfer Approved', `${trf.transferNo}: Approved move of ${rollsVal} Roll(s) to ${trf.toLocation}`, req.user?.name || 'Admin User', 'transfer');

    await transaction.commit();
    res.json({ success: true, transfer: trf });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
};

export const rejectTransfer = async (req, res) => {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Only administrators can reject transfers.' });
  }

  try {
    const { id } = req.params;
    const trf = await Transfer.findByPk(id);
    if (!trf) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (trf.status !== 'Pending') {
      return res.status(400).json({ error: 'Transfer request is already processed' });
    }

    await trf.update({ status: 'Rejected' });

    await addAuditLog('Material Transfer Rejected', `${trf.transferNo}: Rejected transfer of ${trf.rolls} Roll(s) to ${trf.toLocation}`, req.user?.name || 'Admin User', 'transfer');

    res.json({ success: true, transfer: trf });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
};
