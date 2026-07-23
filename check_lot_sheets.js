import { getPendingCuttingLots } from './src/controllers/sheetsController.js';

// We can construct a mock req/res to call getPendingCuttingLots
const req = {
  query: { refresh: 'true' }
};
const res = {
  json: (data) => {
    console.log('SUCCESS:');
    const lotData = data.rows.find(r => String(r["Lot No"] || "").trim() === '11865');
    console.log('Lot 11865 merged row:', JSON.stringify(lotData, null, 2));
    console.log('Pending shades for lot 11865:', JSON.stringify(data.pendingListByLot['11865'], null, 2));
    process.exit(0);
  },
  status: (code) => ({
    json: (err) => {
      console.log('ERROR:', code, err);
      process.exit(1);
    }
  })
};

console.log('Calling getPendingCuttingLots for lot 11865...');
getPendingCuttingLots(req, res);
