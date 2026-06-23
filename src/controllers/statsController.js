import { Material, Shelf, Grn, Issue, DyeingMaterial } from '../models/index.js';

export const getStats = async (req, res) => {
  try {
    const materials = await Material.findAll();
    const dyeingMaterials = await DyeingMaterial.findAll();
    const shelves = await Shelf.findAll();
    const grns = await Grn.findAll();
    const issues = await Issue.findAll();

    const today = new Date().toISOString().slice(0, 10);

    const totalCap = shelves.reduce((sum, s) => sum + (s.capacity || 500), 0);
    
    // Compute used capacity dynamically based on active material and dyeing material roll distribution
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
    
    const usedCap = Object.values(shelfUsedMap).reduce((sum, count) => sum + count, 0);

    const todayGRN = grns.filter(g => g.receivedDate === today);
    const todayIss = issues.filter(i => i.date === today);

    const matWeight = materials.reduce((sum, m) => sum + (m.rolls || 0), 0);
    const dyeingWeight = dyeingMaterials.reduce((sum, dm) => sum + (dm.rolls || 1), 0);

    res.json({
      totalMaterials: materials.length + dyeingMaterials.length,
      totalWeight: matWeight + dyeingWeight,
      totalCapacity: totalCap,
      usedCapacity: usedCap,
      freeCapacity: Math.max(0, totalCap - usedCap),
      spaceUsedPct: totalCap > 0 ? ((usedCap / totalCap) * 100).toFixed(1) : 0,
      lowStockItems: materials.filter(m => m.status === 'Low Stock').length,
      todayReceivedKg: todayGRN.reduce((sum, g) => sum + (g.rolls || 0), 0),
      todayReceivedDocs: todayGRN.length,
      todayIssuedKg: todayIss.reduce((sum, i) => sum + (i.rolls || 0), 0),
      todayIssuedDocs: todayIss.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
