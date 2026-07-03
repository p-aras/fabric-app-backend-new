import sequelize from './src/config/db.js';
import { User, Table } from './src/models/index.js';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB Connection established.');
    const users = await User.findAll({ attributes: ['id', 'name', 'role', 'department'] });
    console.log('USERS IN DB:');
    console.log(JSON.stringify(users, null, 2));
    const tables = await Table.findAll();
    console.log('TABLES IN DB:');
    console.log(JSON.stringify(tables, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}
main();
