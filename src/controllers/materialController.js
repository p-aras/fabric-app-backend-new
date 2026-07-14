import { Material, Room, Shelf, AuditLog, DyeingMaterial, Supplier } from '../models/index.js';
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
    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    // Load all Suppliers for mapping ID to Name
    const suppliers = await Supplier.findAll();
    const supplierMap = {};
    suppliers.forEach(s => {
      supplierMap[s.id] = s.name;
    });
    const getSupplierName = (id) => supplierMap[id] || '—';

    // 1. Fetch Materials (Normal Inventory and FabricStock(Mtrs))
    const materials = await Material.findAll({
      order: [['id', 'DESC']]
    });

    const mappedMaterials = materials.map(m => {
      const item = m.toJSON ? m.toJSON() : { ...m };
      item.inventoryType = (item.unit === 'MTR' || item.unit === 'Mtr') ? 'FabricStock(Mtrs)' : 'Normal Inventory';
      item.receivedDate = item.receivedDate || '';
      return item;
    });

    // 2. Fetch Dyeing Materials (Dyeing Material)
    const dyeingMaterials = await DyeingMaterial.findAll({
      order: [['id', 'DESC']]
    });

    const mappedDyeing = dyeingMaterials.map(dm => {
      const item = dm.toJSON ? dm.toJSON() : { ...dm };
      return {
        id: `dyeing-${item.id}`,
        code: item.barcodeId || `DYE-${item.id}`,
        name: item.fabricName || item.cmfName || 'Dyeing Fabric',
        category: 'Dyeing',
        subCategory: item.group || '',
        color: item.shade || '',
        supplier: null,
        weight: parseFloat(item.weight) || 0.00,
        rolls: 1,
        unit: 'Roll',
        location: item.location || '',
        status: item.batchStatus === 'Completed' ? 'Active' : 'Inactive',
        lotNo: item.lotNumber || '',
        receivedDate: item.date || '',
        inventoryType: 'Dyeing Material',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    });

    let combined = [...mappedMaterials, ...mappedDyeing];

    // Compute unique filter options from the entire unfiltered combined list
    const filterOptions = {
      categories: [...new Set(combined.map(m => m.category).filter(Boolean))].sort(),
      colors: [...new Set(combined.map(m => m.color).filter(Boolean))].sort(),
      locations: [...new Set(combined.map(m => m.location).filter(Boolean))].sort(),
      names: [...new Set(combined.map(m => m.name).filter(Boolean))].sort(),
      subCategories: [...new Set(combined.map(m => m.subCategory).filter(Boolean))].sort(),
      suppliers: [...new Set(suppliers.map(s => s.name).filter(Boolean))].sort()
    };

    // Apply filters in JS
    const parseQueryArray = (val) => {
      if (!val) return [];
      return val.split(',').map(v => v.trim()).filter(Boolean);
    };

    const searchQ = req.query.search ? req.query.search.toLowerCase() : '';
    const selCats = parseQueryArray(req.query.category);
    const selSubCats = parseQueryArray(req.query.subCategory);
    const selStatuses = parseQueryArray(req.query.status);
    const selSuppliers = parseQueryArray(req.query.supplier);
    const selColors = parseQueryArray(req.query.color);
    const selLocations = parseQueryArray(req.query.location);
    const selNames = parseQueryArray(req.query.name);
    const selTypes = parseQueryArray(req.query.type);
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';

    let filtered = combined.filter(m => {
      // 1. Search Query
      const matchQ = !searchQ || 
        (m.name && m.name.toLowerCase().includes(searchQ)) || 
        (m.code && m.code.toLowerCase().includes(searchQ)) || 
        (m.location && m.location.toLowerCase().includes(searchQ));

      // 2. Categories
      const matchCat = selCats.length === 0 || selCats.includes(m.category);

      // 3. Subcategories
      const matchSubCat = selSubCats.length === 0 || selSubCats.includes(m.subCategory);

      // 4. Status
      const matchStatus = selStatuses.length === 0 || selStatuses.includes(m.status);

      // 5. Suppliers
      const matchSupplier = selSuppliers.length === 0 || selSuppliers.includes(getSupplierName(m.supplier));

      // 6. Colors
      const matchColor = selColors.length === 0 || selColors.includes(m.color);

      // 7. Locations
      const matchLocation = selLocations.length === 0 || selLocations.includes(m.location);

      // 8. Names
      const matchName = selNames.length === 0 || selNames.includes(m.name);

      // 9. Types
      const matchType = selTypes.length === 0 || selTypes.includes(m.inventoryType);

      // 10. Date Range
      let matchDate = true;
      if (m.receivedDate) {
        let itemDateStr = m.receivedDate;
        if (/^\d{2}-\d{2}-\d{4}$/.test(itemDateStr)) {
          const parts = itemDateStr.split('-');
          itemDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        if (itemDateStr.includes('T')) {
          itemDateStr = itemDateStr.split('T')[0];
        }
        if (startDate && itemDateStr < startDate) matchDate = false;
        if (endDate && itemDateStr > endDate) matchDate = false;
      } else {
        if (startDate || endDate) matchDate = false;
      }

      return matchQ && matchCat && matchSubCat && matchStatus && matchSupplier && matchColor && matchLocation && matchName && matchType && matchDate;
    });

    if (page !== null) {
      // Pagination requested
      const offset = (page - 1) * limit;
      const paginatedData = filtered.slice(offset, offset + limit);
      res.json({
        success: true,
        data: paginatedData,
        totalCount: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
        currentPage: page,
        limit,
        filterOptions
      });
    } else {
      // Flat array (backward compatibility)
      res.json(filtered);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const checkShelfCapacity = async (shelfId, additionalRolls, excludeMaterialId = null, transaction = null) => {
  if (!shelfId) return;

  // Bypass validation for custom locations
  if (/floor|hall|rack/i.test(shelfId)) {
    return;
  }

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
