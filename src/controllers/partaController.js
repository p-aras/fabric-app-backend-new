import { Parta, FabricIssuance, DyeingMaterial } from '../models/index.js';

export const savePartaData = async (req, res) => {
  try {
    const { lotNumber, data } = req.body;
    if (!lotNumber) {
      return res.status(400).json({ success: false, message: 'lotNumber is required' });
    }
    // Upsert (create or update) based on lotNumber
    const [record, created] = await Parta.upsert({
      lotNumber: String(lotNumber).trim(),
      data: typeof data === 'string' ? data : JSON.stringify(data)
    });
    res.json({ success: true, created, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPartaData = async (req, res) => {
  try {
    const { lotNumber } = req.params;
    const record = await Parta.findOne({
      where: { lotNumber: String(lotNumber).trim() }
    });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Parta data not found' });
    }
    res.json({ success: true, data: JSON.parse(record.data) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPartaPendingReport = async (req, res) => {
  try {
    const issuanceLots = await FabricIssuance.findAll({
      attributes: ['lotNumber'],
      group: ['lotNumber']
    });
    const dyeingLots = await DyeingMaterial.findAll({
      attributes: ['lotNumber'],
      group: ['lotNumber']
    });

    const lotNumbersSet = new Set();
    issuanceLots.forEach(item => {
      if (item.lotNumber) lotNumbersSet.add(String(item.lotNumber).trim());
    });
    dyeingLots.forEach(item => {
      if (item.lotNumber) lotNumbersSet.add(String(item.lotNumber).trim());
    });

    const allLotNumbers = Array.from(lotNumbersSet).filter(lot => lot !== '');
    const partaRecords = await Parta.findAll();
    const partaMap = new Map();
    partaRecords.forEach(record => {
      partaMap.set(String(record.lotNumber).trim(), record.data);
    });

    const reports = [];

    for (const lotNumber of allLotNumbers) {
      const savedDataStr = partaMap.get(lotNumber);
      
      if (!savedDataStr) {
        reports.push({
          lotNumber,
          status: 'Missing',
          kharchaPending: true,
          kharchaValue: null,
          vapsiPending: true,
          vapsiValue: 0,
          checkedBySahilSir: 'no',
          fabricName: '',
          brand: ''
        });
        continue;
      }

      try {
        const parsed = JSON.parse(savedDataStr);
        const meta = parsed.meta || {};
        const kapdaWapsi = parsed.kapdaWapsi || {};

        const kharchaStr = String(meta.kharcha || '').trim();
        const kharchaNum = kharchaStr === '' ? null : parseFloat(kharchaStr);
        const kharchaPending = kharchaNum === null || isNaN(kharchaNum);

        // Hide normally saved lots from Admin Panel until confirmed by Sahil Sir and Kharcha is 0
        const isConfirmedBySahil = meta.checkedBySahilSir === 'yes';
        const isKharchaZero = kharchaNum === 0;

        if (!isConfirmedBySahil || !isKharchaZero) {
          continue;
        }

        let totalWapsi = 0;
        let hasWapsiEntry = false;
        Object.keys(kapdaWapsi).forEach(shade => {
          const val = parseFloat(kapdaWapsi[shade]);
          if (!isNaN(val)) {
            totalWapsi += val;
            if (val > 0) hasWapsiEntry = true;
          }
        });
        const vapsiPending = !hasWapsiEntry;

        reports.push({
          lotNumber,
          status: 'Saved',
          kharchaPending,
          kharchaValue: kharchaPending ? null : kharchaNum,
          vapsiPending,
          vapsiValue: totalWapsi,
          checkedBySahilSir: meta.checkedBySahilSir || 'no',
          fabricName: meta.fabric || '',
          brand: meta.brand || ''
        });
      } catch (err) {
        console.error(`Error parsing Parta JSON data for lot ${lotNumber}:`, err);
        reports.push({
          lotNumber,
          status: 'Corrupt',
          kharchaPending: true,
          kharchaValue: null,
          vapsiPending: true,
          vapsiValue: 0,
          checkedBySahilSir: 'no',
          fabricName: '',
          brand: ''
        });
      }
    }

    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
