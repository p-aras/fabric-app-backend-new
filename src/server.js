import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import app from './app.js';
import sequelize, { getActiveDialect } from './config/db.js';
import { seedDatabase } from './config/seed.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const ensureDatabaseExists = async () => {
  try {
    console.log('Env variables loaded - HOST:', process.env.DB_HOST, 'USER:', process.env.DB_USER, 'PASS:', process.env.DB_PASSWORD);
    const isAiven = process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com');
    const ssl = isAiven ? { rejectUnauthorized: false } : undefined;

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: (process.env.DB_PASSWORD || '').trim(),
      ssl,
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'twms_db'}\`;`);
    await connection.end();
    console.log('Database ensured/created successfully');
  } catch (err) {
    console.error('Failed to ensure/create database:', err);
    throw err; // re‑throw to stop server start
  }
};

const startServer = async () => {
  try {
    const dialect = getActiveDialect();
    if (dialect === 'mysql') {
      // Ensure the database exists on the MySQL server
      await ensureDatabaseExists();
      console.log('Database verification complete.');
    } else {
      console.log('SQLite dialect active. Bypassing MySQL database creation check.');
    }

    // Test database connection
    await sequelize.authenticate();
    console.log(`Successfully connected to ${dialect.toUpperCase()} database.`);

    // Sync models (creates MySQL tables if they do not exist)
    await sequelize.sync();
    console.log('Database tables synchronized.');

    // Ensure lotNo column exists on Materials table
    try {
      await sequelize.query('ALTER TABLE `Materials` ADD COLUMN `lotNo` VARCHAR(50) NULL');
      console.log('Database schema updated: lotNo column added to Materials.');
    } catch (err) {
      if (err.message.includes('duplicate column') || err.message.includes('already exists') || err.message.includes('Duplicate column')) {
        console.log('Database schema verification: lotNo column already exists.');
      } else {
        console.error('Failed to ensure lotNo column on Materials table:', err);
      }
    }

    // Ensure requiredShade and scannedShade columns exist on FabricChangeApprovals table
    try {
      await sequelize.query('ALTER TABLE `FabricChangeApprovals` ADD COLUMN `requiredShade` VARCHAR(255) NULL');
      console.log('Database schema updated: requiredShade column added to FabricChangeApprovals.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        console.error('Failed to ensure requiredShade column on FabricChangeApprovals table:', err);
      }
    }

    try {
      await sequelize.query('ALTER TABLE `FabricChangeApprovals` ADD COLUMN `scannedShade` VARCHAR(255) NULL');
      console.log('Database schema updated: scannedShade column added to FabricChangeApprovals.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        console.error('Failed to ensure scannedShade column on FabricChangeApprovals table:', err);
      }
    }

    // Seed defaults if database tables are empty
    await seedDatabase();

    // Start Express listener
    app.listen(PORT, () => {
      console.log(`TWMS Backend Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to launch TWMS backend server:', error);
    process.exit(1);
  }
};

startServer();

// nodemon trigger comment: force reload to sync models 2026-06-23-revert-sync


