import { Room, Rack, Shelf, Supplier, AuditLog, Material, DyeingMaterial, sequelize } from '../models/index.js';
import { Op } from 'sequelize';
import { addAuditLog } from './materialController.js';

let cachedSettingsData = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30 * 1000; // 30 seconds

export const invalidateSettingsCache = () => {
  cachedSettingsData = null;
  settingsCacheTime = 0;
};

export const getSettingsData = async (req, res) => {
  try {
    if (cachedSettingsData && (Date.now() - settingsCacheTime < SETTINGS_CACHE_TTL)) {
      return res.json(cachedSettingsData);
    }

    const [rooms, racks, shelves, suppliers, auditLog, matUsage, dyeUsage] = await Promise.all([
      Room.findAll({ raw: true }),
      Rack.findAll({ raw: true }),
      Shelf.findAll({ raw: true }),
      Supplier.findAll({ raw: true }),
      AuditLog.findAll({ order: [['id', 'DESC']], limit: 100, raw: true }),
      Material.findAll({
        attributes: ['location', [sequelize.fn('SUM', sequelize.col('rolls')), 'totalRolls']],
        where: { location: { [Op.ne]: null } },
        group: ['location'],
        raw: true
      }),
      DyeingMaterial.findAll({
        attributes: ['location', [sequelize.fn('COUNT', sequelize.col('id')), 'totalRolls']],
        where: { location: { [Op.ne]: null } },
        group: ['location'],
        raw: true
      })
    ]);

    // Map shelf usage efficiently from aggregated counts
    const shelfUsedMap = {};
    matUsage.forEach(m => {
      if (m.location) {
        shelfUsedMap[m.location] = (shelfUsedMap[m.location] || 0) + (parseInt(m.totalRolls) || 0);
      }
    });
    dyeUsage.forEach(dm => {
      if (dm.location) {
        shelfUsedMap[dm.location] = (shelfUsedMap[dm.location] || 0) + (parseInt(dm.totalRolls) || 0);
      }
    });

    const enrichedShelves = shelves.map(s => ({
      ...s,
      used: shelfUsedMap[s.id] || 0
    }));

    // Extract unique floor list from Rooms
    const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))];

    const result = {
      rooms,
      racks,
      shelves: enrichedShelves,
      suppliers,
      auditLog,
      floors
    };

    cachedSettingsData = result;
    settingsCacheTime = Date.now();

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Rooms
export const addRoom = async (req, res) => {
  try {
    const room = await Room.create(req.body);
    invalidateSettingsCache();
    await addAuditLog('Room Added', `Room ${room.name} (${room.id}) added`, 'Admin User', 'create');
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findByPk(id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    await room.update(req.body);
    invalidateSettingsCache();
    await addAuditLog('Room Updated', `Room ${id} details updated`, 'Admin User', 'create');
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const hasRacks = await Rack.findOne({ where: { room: id } });
    if (hasRacks) {
      return res.status(400).json({ error: `Cannot delete room ${id}: there are racks inside it.` });
    }
    const room = await Room.findByPk(id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    await room.destroy();
    invalidateSettingsCache();
    await addAuditLog('Room Removed', `Room ${id} deleted`, 'Admin User', 'delete');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Racks
export const addRack = async (req, res) => {
  try {
    const rack = await Rack.create(req.body);
    invalidateSettingsCache();
    await addAuditLog('Rack Added', `Rack ${rack.name} added to Room ${rack.room}`, 'Admin User', 'create');
    res.json(rack);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteRack = async (req, res) => {
  try {
    const { id } = req.params;
    const materials = await Material.findAll();
    const dyeing = await DyeingMaterial.findAll();
    const hasMaterials = materials.some(m => m.location && m.location.startsWith(id));
    const hasDyeing = dyeing.some(dm => dm.location && dm.location.startsWith(id));
    if (hasMaterials || hasDyeing) {
      return res.status(400).json({ error: `Cannot delete Rack ${id}: materials are stored in shelves on this rack.` });
    }
    
    await Shelf.destroy({ where: { rack: id } });
    const rack = await Rack.findByPk(id);
    if (rack) await rack.destroy();
    invalidateSettingsCache();
    await addAuditLog('Rack Removed', `Rack ${id} and its shelves were deleted`, 'Admin User', 'delete');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Shelves
export const addShelf = async (req, res) => {
  try {
    const shelf = await Shelf.create(req.body);
    invalidateSettingsCache();
    await addAuditLog('Shelf Added', `Shelf ${shelf.id} added to Rack ${shelf.rack}`, 'Admin User', 'create');
    res.json(shelf);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteShelf = async (req, res) => {
  try {
    const { id } = req.params;
    const hasMaterials = await Material.findOne({ where: { location: id } });
    const hasDyeing = await DyeingMaterial.findOne({ where: { location: id } });
    if (hasMaterials || hasDyeing) {
      return res.status(400).json({ error: `Cannot delete Shelf ${id}: materials are stored on this shelf.` });
    }
    const shelf = await Shelf.findByPk(id);
    if (shelf) await shelf.destroy();
    invalidateSettingsCache();
    await addAuditLog('Shelf Removed', `Shelf ${id} was deleted`, 'Admin User', 'delete');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Suppliers
export const addSupplier = async (req, res) => {
  try {
    const sup = await Supplier.create(req.body);
    invalidateSettingsCache();
    res.json(sup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const sup = await Supplier.findByPk(id);
    if (!sup) return res.status(404).json({ error: 'Supplier not found' });
    
    await sup.update(req.body);
    invalidateSettingsCache();
    res.json(sup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const sup = await Supplier.findByPk(id);
    if (sup) await sup.destroy();
    invalidateSettingsCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
