import mysql from 'mysql2/promise';
import dotenv from 'dotenv'; 

import app from './app.js';
import sequelize, { getActiveDialect } from './config/db.js';
import { seedDatabase } from './config/seed.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    console.warn('Info: Database existence check skipped or handled by cloud provider:', err.message);
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

    // Drop foreign keys on location column first to allow schema alteration
    const dropLocationFks = async (tableName) => {
      try {
        const [fks] = await sequelize.query(`
          SELECT CONSTRAINT_NAME 
          FROM information_schema.KEY_COLUMN_USAGE 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = '${tableName}' 
            AND COLUMN_NAME = 'location' 
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        for (const row of fks) {
          const fkName = row.CONSTRAINT_NAME || row.constraint_name;
          if (fkName) {
            console.log(`Dropping foreign key constraint ${fkName} on ${tableName}...`);
            await sequelize.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fkName}\``);
          }
        }
      } catch (err) {
        console.log(`Info: No foreign key dropped on ${tableName}:`, err.message);
      }
    };

    const cleanupDuplicateIndexes = async () => {
      try {
        console.log('Starting pre-sync duplicate index cleanup...');
        const [tables] = await sequelize.query('SHOW TABLES');
        for (const tRow of tables) {
          const tableName = Object.values(tRow)[0];

          // Get current indexes on the table
          const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``);

          const indexGroups = {};
          for (const idx of indexes) {
            const keyName = idx.Key_name || idx.key_name;
            if (!indexGroups[keyName]) {
              indexGroups[keyName] = {
                name: keyName,
                unique: (idx.Non_unique === 0 || idx.non_unique === 0),
                columns: []
              };
            }
            indexGroups[keyName].columns.push(idx.Column_name || idx.column_name);
          }

          // We only filter for unique indexes that are not PRIMARY keys
          const uniqueIndexes = Object.values(indexGroups).filter(
            idx => idx.unique && idx.name !== 'PRIMARY'
          );

          // Group by mapped columns to identify duplicates
          const columnToIndexes = {};
          for (const idx of uniqueIndexes) {
            const colKey = idx.columns.join(',');
            if (!columnToIndexes[colKey]) {
              columnToIndexes[colKey] = [];
            }
            columnToIndexes[colKey].push(idx.name);
          }

          // Drop duplicate indexes, keeping only one per column combination
          for (const [colKey, idxNames] of Object.entries(columnToIndexes)) {
            if (idxNames.length > 1) {
              console.log(`[Schema Cleanup] Table \`${tableName}\` has duplicate unique indexes for column(s) [${colKey}]: ${idxNames.join(', ')}`);

              // Prefer keeping the index that matches column name exactly, or just the first index
              let keepName = idxNames.find(name => name.toLowerCase() === colKey.toLowerCase()) || idxNames[0];
              console.log(`[Schema Cleanup] => Keeping index: ${keepName}`);

              for (const name of idxNames) {
                if (name !== keepName) {
                  try {
                    console.log(`[Schema Cleanup] => Dropping duplicate index \`${name}\` from \`${tableName}\`...`);
                    await sequelize.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${name}\``);
                    console.log(`[Schema Cleanup]    Dropped \`${name}\` successfully.`);
                  } catch (err) {
                    console.log(`[Schema Cleanup] Info: Could not drop index ${name} on ${tableName} (non-fatal):`, err.message);
                  }
                }
              }
            }
          }
        }
        console.log('Pre-sync duplicate index cleanup complete.');
      } catch (err) {
        console.log('Info: Pre-sync index cleanup bypassed or failed:', err.message);
      }
    };

    if (dialect === 'mysql') {
      await dropLocationFks('Materials');
      await dropLocationFks('DyeingMaterials');
      await cleanupDuplicateIndexes();
    }

    // Sync models (creates MySQL tables if they do not exist)
    await sequelize.sync();
    console.log('Database tables synchronized.');

    // Ensure LotTableAssignments table exists in Aiven MySQL explicitly (both case variants for Linux MySQL compatibility)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`LotTableAssignments\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`lotNumber\` VARCHAR(50) NOT NULL,
          \`tableNo\` VARCHAR(50) NOT NULL,
          \`jobOrderNo\` VARCHAR(50) NULL,
          \`fabric\` VARCHAR(100) NULL,
          \`shade\` VARCHAR(100) NULL,
          \`totalRolls\` INTEGER DEFAULT 0,
          \`totalWeight\` DECIMAL(10,2) DEFAULT 0.00,
          \`status\` VARCHAR(30) DEFAULT 'Cutting Pending',
          \`issuedBy\` VARCHAR(100) NULL,
          \`issuedAt\` VARCHAR(50) NULL,
          \`completedAt\` VARCHAR(50) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`lottableassignments\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`lotNumber\` VARCHAR(50) NOT NULL,
          \`tableNo\` VARCHAR(50) NOT NULL,
          \`jobOrderNo\` VARCHAR(50) NULL,
          \`fabric\` VARCHAR(100) NULL,
          \`shade\` VARCHAR(100) NULL,
          \`totalRolls\` INTEGER DEFAULT 0,
          \`totalWeight\` DECIMAL(10,2) DEFAULT 0.00,
          \`status\` VARCHAR(30) DEFAULT 'Cutting Pending',
          \`issuedBy\` VARCHAR(100) NULL,
          \`issuedAt\` VARCHAR(50) NULL,
          \`completedAt\` VARCHAR(50) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ Guaranteed LotTableAssignments table created in Aiven MySQL database.');

      // Ensure ShortageReports table exists in MySQL
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS \`ShortageReports\` (
            \`id\` INTEGER NOT NULL AUTO_INCREMENT,
            \`lotNumber\` VARCHAR(50) NOT NULL,
            \`jobOrderNo\` VARCHAR(50) NULL,
            \`billNumber\` VARCHAR(50) NULL,
            \`fabricName\` VARCHAR(255) NULL,
            \`shade\` VARCHAR(100) NULL,
            \`tableNo\` VARCHAR(50) NULL,
            \`unit\` VARCHAR(20) DEFAULT 'KGs',
            \`requiredQty\` DECIMAL(12,3) DEFAULT 0.000,
            \`billedQty\` DECIMAL(12,3) DEFAULT 0.000,
            \`issuedQty\` DECIMAL(12,3) DEFAULT 0.000,
            \`issuedRolls\` INTEGER DEFAULT 0,
            \`recdWeight\` DECIMAL(12,3) DEFAULT 0.000,
            \`shortageQty\` DECIMAL(12,3) DEFAULT 0.000,
            \`shortagePercentage\` DECIMAL(8,2) DEFAULT 0.00,
            \`reason\` VARCHAR(255) NULL,
            \`reportedBy\` VARCHAR(100) NULL,
            \`date\` DATE NULL,
            \`issueDate\` VARCHAR(50) NULL,
            \`remarks\` TEXT NULL,
            \`cmfParty\` VARCHAR(255) NULL,
            \`process\` VARCHAR(100) NULL,
            \`selectedEntries\` JSON NULL,
            \`inspectionDetails\` JSON NULL,
            \`status\` VARCHAR(50) DEFAULT 'Submitted',
            \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Safe alter table column check
        try {
          await sequelize.query("ALTER TABLE `ShortageReports` ADD COLUMN `inspectionDetails` JSON NULL;");
        } catch(e) {
          // Column already exists, safe to ignore
        }
        console.log('✅ Guaranteed ShortageReports table created in MySQL database.');
      } catch (shortageErr) {
        console.warn('Info: CREATE TABLE ShortageReports notice:', shortageErr.message);
      }
    } catch (createErr) {
      console.warn('Info: CREATE TABLE LotTableAssignments notice:', createErr.message);
    }

    // Auto-backfill past FabricIssuance records into LotTableAssignments if empty
    try {
      const { LotTableAssignment, FabricIssuance } = await import('./models/index.js');
      const count = await LotTableAssignment.count().catch(() => 0);
      if (count === 0) {
        console.log('📦 Backfilling existing FabricIssuance records into LotTableAssignments table in MySQL...');
        const issuances = await FabricIssuance.findAll();
        for (const fsItem of issuances) {
          let items = [];
          try {
            items = fsItem.issuedItems ? JSON.parse(fsItem.issuedItems) : [];
          } catch (e) {}

          if (Array.isArray(items) && items.length > 0) {
            for (const it of items) {
              if (it.tableNumber) {
                await LotTableAssignment.create({
                  lotNumber: String(fsItem.lotNumber),
                  tableNo: String(it.tableNumber),
                  jobOrderNo: String(fsItem.jobOrderNo || ''),
                  fabric: String(fsItem.fabric || ''),
                  shade: String(it.shade || ''),
                  totalRolls: parseInt(it.qty) || 0,
                  totalWeight: parseFloat(it.weight) || 0,
                  status: 'Cutting Pending',
                  issuedBy: String(fsItem.issuedBy || 'System'),
                  issuedAt: String(fsItem.issuedAt || new Date().toISOString())
                }).catch(() => {});
              }
            }
          }
        }
        console.log('✅ Backfill to LotTableAssignments table complete.');
      }
    } catch (bfErr) {
      console.warn('LotTableAssignments backfill notice:', bfErr.message);
    }

    // Ensure lotNo column exists on Materials table
    try {
      await sequelize.query('ALTER TABLE `Materials` ADD COLUMN `lotNo` VARCHAR(50) NULL');
      console.log('Database schema updated: lotNo column added to Materials.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `materials` ADD COLUMN `lotNo` VARCHAR(50) NULL');
          console.log('Database schema updated: lotNo column added to materials (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure lotNo column on materials table (both cases):', subErr);
          }
        }
      }
    }

    // Ensure requiredShade and scannedShade columns exist on FabricChangeApprovals table
    try {
      await sequelize.query('ALTER TABLE `Materials` ADD COLUMN `poNumber` VARCHAR(100) NULL');
      console.log('Database schema updated: poNumber column added to Materials.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `materials` ADD COLUMN `poNumber` VARCHAR(100) NULL');
          console.log('Database schema updated: poNumber column added to materials (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure poNumber column on materials table (both cases):', subErr);
          }
        }
      }
    }

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

    try {
      await sequelize.query('ALTER TABLE `JobOrders` ADD COLUMN `fetchedFromSheet` TINYINT(1) DEFAULT 0');
      console.log('Database schema updated: fetchedFromSheet column added to JobOrders.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `joborders` ADD COLUMN `fetchedFromSheet` TINYINT(1) DEFAULT 0');
          console.log('Database schema updated: fetchedFromSheet column added to joborders (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure fetchedFromSheet column on JobOrders table (both cases):', subErr);
          }
        }
      }
    }

    try {
      await sequelize.query('ALTER TABLE `JobOrders` ADD COLUMN `priority` VARCHAR(50) NULL');
      console.log('Database schema updated: priority column added to JobOrders.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `joborders` ADD COLUMN `priority` VARCHAR(50) NULL');
          console.log('Database schema updated: priority column added to joborders (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure priority column on JobOrders table (both cases):', subErr);
          }
        }
      }
    }

    try {
      await sequelize.query('ALTER TABLE `Attendances` ADD COLUMN `masters` TEXT NULL');
      console.log('Database schema updated: masters column added to Attendances.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `attendances` ADD COLUMN `masters` TEXT NULL');
          console.log('Database schema updated: masters column added to attendances (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure masters column on Attendances table (both cases):', subErr);
          }
        }
      }
    }

    try {
      await sequelize.query('ALTER TABLE `Attendances` ADD COLUMN `mastersCount` INTEGER DEFAULT 0');
      console.log('Database schema updated: mastersCount column added to Attendances.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `attendances` ADD COLUMN `mastersCount` INTEGER DEFAULT 0');
          console.log('Database schema updated: mastersCount column added to attendances (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure mastersCount column on Attendances table (both cases):', subErr);
          }
        }
      }
    }

    try {
      await sequelize.query('ALTER TABLE `Attendances` ADD COLUMN `hods` TEXT NULL');
      console.log('Database schema updated: hods column added to Attendances.');
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('Duplicate column')) {
        try {
          await sequelize.query('ALTER TABLE `attendances` ADD COLUMN `hods` TEXT NULL');
          console.log('Database schema updated: hods column added to attendances (lowercase).');
        } catch (subErr) {
          if (!subErr.message.includes('duplicate column') && !subErr.message.includes('already exists') && !subErr.message.includes('Duplicate column')) {
            console.error('Failed to ensure hods column on Attendances table (both cases):', subErr);
          }
        }
      }
    }

    try {
      await sequelize.query('ALTER TABLE `Attendances` MODIFY `hodName` VARCHAR(255) NULL');
      await sequelize.query('ALTER TABLE `Attendances` MODIFY `hodStatus` VARCHAR(255) NULL');
      console.log('Database schema updated: hodName and hodStatus columns set to NULL in Attendances.');
    } catch (err) {
      try {
        await sequelize.query('ALTER TABLE `attendances` MODIFY `hodName` VARCHAR(255) NULL');
        await sequelize.query('ALTER TABLE `attendances` MODIFY `hodStatus` VARCHAR(255) NULL');
        console.log('Database schema updated: hodName and hodStatus columns set to NULL in attendances (lowercase).');
      } catch (subErr) {
        // SQLite doesn't support MODIFY directly, which is fine since sync handles it or it's not strictly needed for SQLite
      }
    }

    // Seed defaults if database tables are empty
    await seedDatabase();

    // Start Express listener
    app.listen(PORT, () => {
      console.log(`🚀 TWMS Backend Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to launch TWMS backend server:', error);
    process.exit(1);
  }
};

startServer();

// nodemon trigger comment: force reload to sync models 2026-06-23-revert-sync


