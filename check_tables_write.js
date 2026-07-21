const fs = require('fs');
const path = require('path');
const { Table, User } = require('./src/models/index.js');

async function check() {
  try {
    const list = await Table.findAll({
      include: [
        { model: User, as: 'Supervisor', attributes: ['name'] },
        { model: User, as: 'CutterMaster', attributes: ['name'] }
      ]
    });
    let out = "=== TABLES IN DB ===\n";
    list.forEach(t => {
      out += `${t.name} -> Supervisor: ${t.Supervisor?.name || 'None'}, CutterMaster: ${t.CutterMaster?.name || 'None'}\n`;
    });
    fs.writeFileSync(path.join(__dirname, 'tables_db_output.txt'), out);
    console.log("Written successfully");
    process.exit(0);
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'tables_db_output.txt'), "Error: " + err.message + "\n" + err.stack);
    process.exit(1);
  }
}
check();
