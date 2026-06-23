import { Room, Rack, Shelf, Supplier, AuditLog, Material, DyeingMaterial } from '../models/index.js';
import { addAuditLog } from './materialController.js';

export const getSettingsData = async (req, res) => {
  try {
    const rooms = await Room.findAll();
    const racks = await Rack.findAll();
    const shelves = await Shelf.findAll();
    const materials = await Material.findAll();
    const dyeingMaterials = await DyeingMaterial.findAll();
    
    // Sum rolls per shelf location dynamically
    const shelfUsedMap = {};
    materials.forEach(m => {
      if (m.location) {
        shelfUsedMap[m.location] = (shelfUsedMap[m.location] || 0) + (m.rolls || 0);
      }
    });
    dyeingMaterials.forEach(dm => {
      if (dm.location) {
        shelfUsedMap[dm.location] = (shelfUsedMap[dm.location] || 0) + (dm.rolls || 1);
      }
    });

    const enrichedShelves = shelves.map(s => {
      const data = s.toJSON();
      data.used = shelfUsedMap[s.id] || 0;
      return data;
    });

    const suppliers = await Supplier.findAll();
    const auditLog = await AuditLog.findAll({ order: [['id', 'DESC']], limit: 200 });
    
    // Extract unique floor list from Rooms
    const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))];

    res.json({
      rooms,
      racks,
      shelves: enrichedShelves,
      suppliers,
      auditLog,
      floors
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Rooms
export const addRoom = async (req, res) => {
  try {
    const room = await Room.create(req.body);
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
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
