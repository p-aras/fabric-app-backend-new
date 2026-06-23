import { Issue, Material, sequelize } from '../models/index.js';
import { addAuditLog } from './materialController.js';

export const getIssues = async (req, res) => {
  try {
    const issues = await Issue.findAll({ order: [['id', 'DESC']] });
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addIssue = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { materialId, rolls, department, issuedBy, date, reason } = req.body;
    const rollsVal = parseInt(rolls);

    const mat = await Material.findByPk(materialId, { transaction });
    if (!mat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Material not found' });
    }

    if (rollsVal <= 0 || rollsVal > mat.rolls) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Insufficient stock or invalid quantity' });
    }

    await mat.update({
      rolls: Math.max(0, mat.rolls - rollsVal)
    }, { transaction });

    const issueCount = await Issue.count({ transaction });
    const issueNo = `ISS-${new Date().getFullYear()}-${String(issueCount + 1).padStart(3, '0')}`;

    const newIssue = await Issue.create({
      issueNo,
      materialId: parseInt(materialId),
      rolls: rollsVal,
      department,
      issuedBy,
      date,
      reason,
      status: 'Completed'
    }, { transaction });

    await addAuditLog('Material Issued', `${issueNo}: ${rollsVal} Roll(s) issued to ${department}`, 'Admin User', 'issue');

    await transaction.commit();
    res.json(newIssue);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
};
