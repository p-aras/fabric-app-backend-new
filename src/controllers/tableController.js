import { Table, User } from '../models/index.js';

// 1. GET ALL TABLES (Auto-seed default Table 1 to 12 if table count is 0)
export const getTables = async (req, res) => {
  try {
    // Self-healing: Check and seed Table 1 to Table 20 if missing
    for (let i = 1; i <= 20; i++) {
      const tableName = `Table ${i}`;
      await Table.findOrCreate({
        where: { name: tableName },
        defaults: { supervisorId: null }
      });
    }

    const tables = await Table.findAll({
      include: [{
        model: User,
        as: 'Supervisor',
        attributes: ['id', 'name', 'email']
      }]
    });

    // Sort numerically: Table 1, Table 2, ..., Table 10, Table 11, ..., Table 20
    tables.sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.name.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    res.json({ success: true, data: tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. ADD NEW TABLE
export const addTable = async (req, res) => {
  try {
    const { name, supervisorId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Table name is required.' });
    }

    // Check if table name already exists
    const existing = await Table.findOne({ where: { name: name.trim() } });
    if (existing) {
      return res.status(400).json({ success: false, message: `Table "${name}" already exists.` });
    }

    const table = await Table.create({
      name: name.trim(),
      supervisorId: supervisorId ? parseInt(supervisorId) : null
    });

    // Re-fetch table with supervisor info to return to UI
    const createdTable = await Table.findByPk(table.id, {
      include: [{
        model: User,
        as: 'Supervisor',
        attributes: ['id', 'name', 'email']
      }]
    });

    res.json({ success: true, data: createdTable });
  } catch (error) {
    console.error('Error adding table:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. UPDATE TABLE (Assign Supervisor / Rename)
export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, supervisorId } = req.body;

    const table = await Table.findByPk(id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found.' });
    }

    if (name && name.trim() && name.trim() !== table.name) {
      // Check if new name is unique
      const existing = await Table.findOne({ where: { name: name.trim() } });
      if (existing) {
        return res.status(400).json({ success: false, message: `Table "${name}" already exists.` });
      }
      table.name = name.trim();
    }

    if (supervisorId !== undefined) {
      table.supervisorId = supervisorId ? parseInt(supervisorId) : null;
    }

    await table.save();

    // Re-fetch updated table details
    const updatedTable = await Table.findByPk(id, {
      include: [{
        model: User,
        as: 'Supervisor',
        attributes: ['id', 'name', 'email']
      }]
    });

    res.json({ success: true, data: updatedTable });
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. DELETE TABLE
export const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findByPk(id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found.' });
    }

    await table.destroy();
    res.json({ success: true, message: 'Table deleted successfully.' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
