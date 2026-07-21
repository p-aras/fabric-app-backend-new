import { Material, Room, Shelf, AuditLog, DyeingMaterial, Supplier, sequelize } from '../models/index.js';
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

    // Parse filters
    const parseQueryArray = (val) => {
      if (!val) return [];
      return val.split(',').map(v => v.trim()).filter(Boolean);
    };

    const searchQ = req.query.search ? req.query.search.trim() : '';
    const barcodeSeries = req.query.barcodeSeries || 'All'; // 'All', '9', 'MAT', 'DYE', 'Plain'
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

    // Initialize WHERE clauses
    const materialWhere = {};
    const dyeingWhere = {};

    // 1. Search Query
    if (searchQ) {
      materialWhere[Op.or] = [
        { name: { [Op.like]: `%${searchQ}%` } },
        { code: { [Op.like]: `%${searchQ}%` } },
        { location: { [Op.like]: `%${searchQ}%` } },
        { lotNo: { [Op.like]: `%${searchQ}%` } }
      ];
      dyeingWhere[Op.or] = [
        { fabricName: { [Op.like]: `%${searchQ}%` } },
        { barcodeId: { [Op.like]: `%${searchQ}%` } },
        { location: { [Op.like]: `%${searchQ}%` } },
        { lotNumber: { [Op.like]: `%${searchQ}%` } }
      ];
    }

    // 2. Barcode Series Segregation
    if (barcodeSeries === '9') {
      materialWhere.code = { [Op.like]: '9%' };
      dyeingWhere.id = null; // Dyeing barcodes do not start with 9
    } else if (barcodeSeries === 'MAT') {
      materialWhere.code = { [Op.like]: 'MAT%' };
      dyeingWhere.id = null;
    } else if (barcodeSeries === 'DYE') {
      materialWhere.id = null;
      // Match all dyeing materials
    } else if (barcodeSeries === 'Plain') {
      materialWhere.code = {
        [Op.and]: [
          { [Op.notLike]: '9%' },
          { [Op.notLike]: 'MAT%' },
          { [Op.notLike]: 'DYE%' }
        ]
      };
      dyeingWhere.id = null;
    }

    // 3. Categories
    if (selCats.length > 0) {
      materialWhere.category = { [Op.in]: selCats };
      if (!selCats.includes('Dyeing')) {
        dyeingWhere.id = null;
      }
    }

    // 4. Subcategories
    if (selSubCats.length > 0) {
      materialWhere.subCategory = { [Op.in]: selSubCats };
      dyeingWhere.group = { [Op.in]: selSubCats };
    }

    // 5. Status
    if (selStatuses.length > 0) {
      materialWhere.status = { [Op.in]: selStatuses };
      const dyeingStatuses = [];
      if (selStatuses.includes('Active')) dyeingStatuses.push('Completed');
      if (selStatuses.includes('Inactive') || selStatuses.includes('Low Stock')) {
        dyeingStatuses.push('Pending', 'In Progress', 'Failed', 'Cancelled');
      }
      dyeingWhere.batchStatus = { [Op.in]: dyeingStatuses };
    }

    // 6. Suppliers
    if (selSuppliers.length > 0) {
      const matchingSuppliers = suppliers.filter(s => selSuppliers.includes(s.name)).map(s => s.id);
      materialWhere.supplier = { [Op.in]: matchingSuppliers };
      dyeingWhere.id = null;
    }

    // 7. Colors
    if (selColors.length > 0) {
      materialWhere.color = { [Op.in]: selColors };
      dyeingWhere.shade = { [Op.in]: selColors };
    }

    // 8. Locations
    if (selLocations.length > 0) {
      materialWhere.location = { [Op.in]: selLocations };
      dyeingWhere.location = { [Op.in]: selLocations };
    }

    // 9. Names
    if (selNames.length > 0) {
      materialWhere.name = { [Op.in]: selNames };
      dyeingWhere.fabricName = { [Op.in]: selNames };
    }

    // 10. Types
    if (selTypes.length > 0) {
      const hasNormal = selTypes.includes('Normal Inventory');
      const hasMtr = selTypes.includes('FabricStock(Mtrs)');
      const hasDye = selTypes.includes('Dyeing Material');

      if (!hasDye) {
        dyeingWhere.id = null;
      }

      if (hasNormal && hasMtr) {
        // no unit filter
      } else if (hasNormal) {
        materialWhere.unit = { [Op.or]: [{ [Op.ne]: 'MTR' }, { [Op.is]: null }] };
      } else if (hasMtr) {
        materialWhere.unit = { [Op.or]: ['MTR', 'Mtr'] };
      } else {
        materialWhere.id = null;
      }
    }

    // 11. Date Range
    if (startDate || endDate) {
      const dateRangeCond = {};
      if (startDate) dateRangeCond[Op.gte] = startDate;
      if (endDate) dateRangeCond[Op.lte] = endDate;
      
      materialWhere.receivedDate = dateRangeCond;
      dyeingWhere.date = dateRangeCond;
    }

    // Map Dyeing items helper
    const mapDyeingItem = (item) => ({
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
    });

    // Query counts
    const [materialsCount, dyeingCount] = await Promise.all([
      Material.count({ where: materialWhere }),
      DyeingMaterial.count({ where: dyeingWhere })
    ]);
    const totalCount = materialsCount + dyeingCount;

    // Fetch paginated data
    let combinedFiltered = [];
    if (page !== null) {
      const offset = (page - 1) * limit;
      if (offset < materialsCount) {
        const limitFromMaterials = Math.min(limit, materialsCount - offset);
        const mats = await Material.findAll({
          where: materialWhere,
          order: [['id', 'DESC']],
          limit: limitFromMaterials,
          offset: offset
        });
        
        combinedFiltered.push(...mats.map(m => {
          const item = m.toJSON ? m.toJSON() : { ...m };
          item.inventoryType = (item.unit === 'MTR' || item.unit === 'Mtr') ? 'FabricStock(Mtrs)' : 'Normal Inventory';
          item.receivedDate = item.receivedDate || '';
          return item;
        }));

        if (combinedFiltered.length < limit) {
          const limitFromDyeing = limit - combinedFiltered.length;
          const dyeings = await DyeingMaterial.findAll({
            where: dyeingWhere,
            order: [['id', 'DESC']],
            limit: limitFromDyeing,
            offset: 0
          });
          combinedFiltered.push(...dyeings.map(mapDyeingItem));
        }
      } else {
        const dyeingOffset = offset - materialsCount;
        const dyeings = await DyeingMaterial.findAll({
          where: dyeingWhere,
          order: [['id', 'DESC']],
          limit: limit,
          offset: dyeingOffset
        });
        combinedFiltered.push(...dyeings.map(mapDyeingItem));
      }
    } else {
      // Export case: Load all matching records
      const [mats, dyeings] = await Promise.all([
        Material.findAll({ where: materialWhere, order: [['id', 'DESC']] }),
        DyeingMaterial.findAll({ where: dyeingWhere, order: [['id', 'DESC']] })
      ]);
      combinedFiltered.push(...mats.map(m => {
        const item = m.toJSON ? m.toJSON() : { ...m };
        item.inventoryType = (item.unit === 'MTR' || item.unit === 'Mtr') ? 'FabricStock(Mtrs)' : 'Normal Inventory';
        item.receivedDate = item.receivedDate || '';
        return item;
      }));
      combinedFiltered.push(...dyeings.map(mapDyeingItem));
    }

    // Load filter options dynamically using optimized distinct queries
    const [uniqueCatsMats, uniqueColorsMats, uniqueLocationsMats, uniqueNamesMats, uniqueSubCatsMats] = await Promise.all([
      Material.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('category')), 'category']], raw: true }),
      Material.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('color')), 'color']], raw: true }),
      Material.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('location')), 'location']], raw: true }),
      Material.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('name')), 'name']], raw: true }),
      Material.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('subCategory')), 'subCategory']], raw: true }),
    ]);

    const [uniqueColorsDye, uniqueLocationsDye, uniqueNamesDye, uniqueSubCatsDye] = await Promise.all([
      DyeingMaterial.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('shade')), 'color']], raw: true }),
      DyeingMaterial.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('location')), 'location']], raw: true }),
      DyeingMaterial.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('fabricName')), 'name']], raw: true }),
      DyeingMaterial.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col('group')), 'subCategory']], raw: true }),
    ]);

    const filterOptions = {
      categories: [...new Set([...uniqueCatsMats.map(x => x.category), 'Dyeing'])].filter(Boolean).sort(),
      colors: [...new Set([...uniqueColorsMats.map(x => x.color), ...uniqueColorsDye.map(x => x.color)])].filter(Boolean).sort(),
      locations: [...new Set([...uniqueLocationsMats.map(x => x.location), ...uniqueLocationsDye.map(x => x.location)])].filter(Boolean).sort(),
      names: [...new Set([...uniqueNamesMats.map(x => x.name), ...uniqueNamesDye.map(x => x.name)])].filter(Boolean).sort(),
      subCategories: [...new Set([...uniqueSubCatsMats.map(x => x.subCategory), ...uniqueSubCatsDye.map(x => x.subCategory)])].filter(Boolean).sort(),
      suppliers: [...new Set(suppliers.map(s => s.name).filter(Boolean))].sort()
    };

    if (page !== null) {
      res.json({
        success: true,
        data: combinedFiltered,
        totalCount: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
        filterOptions
      });
    } else {
      res.json(combinedFiltered);
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
