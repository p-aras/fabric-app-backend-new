const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : 'all';

const spreadsheetId = '13ArpFOD7idmpv7QIRJQkD-tfswtkH6rNnEANtv2M7Ek';

async function checkTabs() {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=0`;
  console.log(`\n=== 1. ANALYZING SPREADSHEET TABS FROM HTML ===`);
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    const html = await res.text();
    const matches = html.match(/"name":"([^"]+)","id":"([^"]+)"/g);
    if (matches) {
      console.log('Found sheet tabs:');
      matches.forEach(m => console.log(`  ${m}`));
    } else {
      console.log('No tab matches found. Searching for GID numbers...');
      const gidMatches = html.match(/gid=(\d+)/g);
      if (gidMatches) {
        console.log('Found GIDs in HTML:', [...new Set(gidMatches)]);
      } else {
        console.log('No GIDs found.');
      }
    }
  } catch (err) {
    console.error('Error fetching sheet HTML:', err.message);
  }
}

async function checkCsv() {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  console.log(`\n=== 2. CONNECTING TO CSV EXPORT ENDPOINT ===`);
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error: ${res.status} ${res.statusText}`);
      return;
    }
    const csvText = await res.text();
    console.log('--- CSV CONTENT ---');
    console.log(csvText);
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

async function checkRow5() {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
  console.log(`\n=== 3. FETCHING ROW 5 RAW CELL STRUCTURE (Visualization JSON) ===`);
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    const text = await res.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    const jsonText = text.substring(jsonStart, jsonEnd + 1);
    const data = JSON.parse(jsonText);
    const rows = data.table?.rows || [];
    
    if (rows[4]) {
      console.log('Row 5 raw cell list:');
      rows[4].c.forEach((cell, idx) => {
        console.log(`  Cell ${idx} (Col ${String.fromCharCode(65 + idx)}):`, cell);
      });
    } else {
      console.log('Row 5 not found!');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function dumpSheetRows() {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
  console.log(`\n=== 4. FETCHING ALL SPREADSHEET ROWS (Visualization JSON) ===`);
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    const text = await res.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    const jsonText = text.substring(jsonStart, jsonEnd + 1);
    const data = JSON.parse(jsonText);
    const rows = data.table?.rows || [];
    
    console.log('--- ALL ROWS ---');
    rows.forEach((r, idx) => {
      const rowVals = r.c ? r.c.map(cell => cell ? (cell.v !== null ? cell.v : cell.f) : 'null') : [];
      console.log(`  Row ${idx + 1}:`, rowVals);
    });
  } catch (err) {
    console.error('Error fetching sheet rows:', err.message);
  }
}

async function run() {
  if (command === 'tabs') {
    await checkTabs();
  } else if (command === 'csv') {
    await checkCsv();
  } else if (command === 'row5') {
    await checkRow5();
  } else if (command === 'rows') {
    await dumpSheetRows();
  } else if (command === 'all') {
    await checkTabs();
    await checkCsv();
    await checkRow5();
    await dumpSheetRows();
  } else {
    console.log(`Unknown command: "${command}"`);
    console.log('Available options: tabs | csv | row5 | rows | all');
  }
}

run().catch(console.error);
