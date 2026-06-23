import { Material, Room, Shelf, AuditLog, DyeingMaterial } from '../models/index.js';
import { Op } from 'sequelize';

// Audit Log Helper
export async function addAuditLog(action, detail, user = 'Admin User', type = 'info') {
  const now = new Date();
  const dateStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
  await AuditLog.create({
    action,
    detail,
    user,
    date: dateStr,
    type
  });
}

// Auto Location Assignment Logic based on DB Tables
export const findAvailableLocation = async (category) => {
  try {
    const rooms = await Room.findAll();
    const room = rooms.find(r => r.category === category) || rooms[0];
    if (!room) return 'A01-S01';

    const shelves = await Shelf.findAll({ where: { room: room.id } });
    if (shelves.length === 0) return `${room.id}01-S01`;

    // Sum rolls currently in each shelf to check usage (from both tables)
    const materialsInRoom = await Material.findAll({
      where: { location: shelves.map(s => s.id) }
    });
    const dyeingInRoom = await DyeingMaterial.findAll({
      where: { location: shelves.map(s => s.id) }
    });

    const shelfUsedMap = {};
    materialsInRoom.forEach(m => {
      shelfUsedMap[m.location] = (shelfUsedMap[m.location] || 0) + (m.rolls || 0);
    });
    dyeingInRoom.forEach(dm => {
      shelfUsedMap[dm.location] = (shelfUsedMap[dm.location] || 0) + (dm.rolls || 1);
    });

    const available = shelves.find(s => {
      const used = shelfUsedMap[s.id] || 0;
      return (s.capacity - used) > 0;
    });

    return available ? available.id : shelves[0].id;
  } catch (e) {
    return 'A01-S01';
  }
};

export const getMaterials = async (req, res) => {
  try {
    const { search, category, status } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } }
      ];
    }
    if (category && category !== 'All') {
      where.category = category;
    }
    if (status && status !== 'All') {
      where.status = status;
    }

    const materials = await Material.findAll({
      where,
      order: [['id', 'DESC']]
    });
    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const checkShelfCapacity = async (shelfId, additionalRolls, excludeMaterialId = null, transaction = null) => {
  if (!shelfId) return;

  const shelf = await Shelf.findByPk(shelfId, { transaction });
  if (!shelf) {
    throw new Error(`Shelf "${shelfId}" does not exist.`);
  }

  // Find all materials and dyeing materials in this shelf
  const where = { location: shelfId };
  if (excludeMaterialId) {
    where.id = { [Op.ne]: excludeMaterialId };
  }
  const materials = await Material.findAll({ where, transaction });
  const dyeingMaterials = await DyeingMaterial.findAll({ where: { location: shelfId }, transaction });

  const materialUsed = materials.reduce((sum, m) => sum + (m.rolls || 0), 0);
  const dyeingUsed = dyeingMaterials.reduce((sum, dm) => sum + (dm.rolls || 1), 0);
  const currentlyUsed = materialUsed + dyeingUsed;

  const remaining = shelf.capacity - currentlyUsed;
  if (additionalRolls > remaining) {
    throw new Error(`Space is full! Shelf ${shelfId} has only ${remaining} rolls available, but attempted to add/set to ${additionalRolls} rolls.`);
  }
};

export const addMaterial = async (req, res) => {
  try {
    const lastMaterial = await Material.findOne({
      order: [['code', 'DESC']]
    });
    const lastDyeing = await DyeingMaterial.findOne({
      order: [['barcodeId', 'DESC']]
    });

    const getNumericId = (barcode) => {
      if (!barcode) return 0;
      const match = barcode.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const lastMatId = lastMaterial ? getNumericId(lastMaterial.code) : 0;
    const lastDyeingId = lastDyeing ? getNumericId(lastDyeing.barcodeId) : 0;
    const lastId = Math.max(lastMatId, lastDyeingId);
    const newCode = `MAT${String(lastId + 1).padStart(5, '0')}`;
    
    let location = req.body.location;
    if (!location) {
      location = await findAvailableLocation(req.body.category);
    }

    const rollsVal = parseInt(req.body.rolls) || 0;
    await checkShelfCapacity(location, rollsVal);

    const material = await Material.create({
      ...req.body,
      code: newCode,
      location
    });

    await addAuditLog('New Material Created', `${material.code}: ${material.name} added`, 'Admin User', 'create');
    res.json(material);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const material = await Material.findByPk(id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    
    const targetLocation = req.body.location !== undefined ? req.body.location : material.location;
    const targetRolls = req.body.rolls !== undefined ? parseInt(req.body.rolls) || 0 : material.rolls;
    await checkShelfCapacity(targetLocation, targetRolls, material.id);

    await material.update(req.body);
    res.json(material);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const material = await Material.findByPk(id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    
    await material.destroy();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
