import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

// --- USER MODEL ---
export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'Store Operator' },
  department: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Active' },
  avatar: { type: DataTypes.STRING },
  lastLogin: { type: DataTypes.STRING },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  otpCode: { type: DataTypes.STRING, allowNull: true },
  otpExpires: { type: DataTypes.DATE, allowNull: true }
});

// --- ROOM/HALL MODEL ---
export const Room = sequelize.define('Room', {
  id: { type: DataTypes.STRING(5), primaryKey: true }, // e.g., 'A', 'B'
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  color: { type: DataTypes.STRING, defaultValue: '#3b82f6' },
  floor: { type: DataTypes.STRING }
});

// --- RACK MODEL ---
export const Rack = sequelize.define('Rack', {
  id: { type: DataTypes.STRING(15), primaryKey: true }, // e.g., 'A01'
  room: {
    type: DataTypes.STRING(5),
    allowNull: false,
    references: { model: 'Rooms', key: 'id' }
  },
  number: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING }
});

// --- SHELF MODEL ---
export const Shelf = sequelize.define('Shelf', {
  id: { type: DataTypes.STRING(25), primaryKey: true }, // e.g., 'A01-S01'
  rack: {
    type: DataTypes.STRING(15),
    allowNull: false,
    references: { model: 'Racks', key: 'id' }
  },
  room: { type: DataTypes.STRING(5), allowNull: false },
  number: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING },
  capacity: { type: DataTypes.INTEGER, defaultValue: 500 },
  used: { type: DataTypes.INTEGER, defaultValue: 0 }
});

// --- SUPPLIER MODEL ---
export const Supplier = sequelize.define('Supplier', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  contact: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Active' }
});

// --- MATERIAL MODEL ---
export const Material = sequelize.define('Material', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(20), allowNull: false, unique: true }, // e.g., MAT00001
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  subCategory: { type: DataTypes.STRING },
  color: { type: DataTypes.STRING },
  supplier: {
    type: DataTypes.STRING,
    references: { model: 'Suppliers', key: 'name' }
  },
  weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  rolls: { type: DataTypes.INTEGER, defaultValue: 0 },
  unit: { type: DataTypes.STRING, defaultValue: 'Roll' },
  location: {
    type: DataTypes.STRING(255)
  },
  status: { type: DataTypes.STRING, defaultValue: 'Active' },
  stockKg: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  billNumber: { type: DataTypes.STRING },
  receivedPerson: { type: DataTypes.STRING },
  authorizedPerson: { type: DataTypes.STRING },
  receivedDate: { type: DataTypes.DATEONLY },
  lotNo: { type: DataTypes.STRING(50) },
  poNumber: { type: DataTypes.STRING(100), allowNull: true }
});

// --- GRN MODEL ---
export const Grn = sequelize.define('Grn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  grnNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  supplier: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Suppliers', key: 'id' }
  },
  poNumber: { type: DataTypes.STRING },
  materialId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Materials', key: 'id' }
  },
  weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  rolls: { type: DataTypes.INTEGER, defaultValue: 0 },
  invoiceNo: { type: DataTypes.STRING },
  receivedDate: { type: DataTypes.DATEONLY },
  receivedBy: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Completed' }
});

// --- ISSUE MODEL ---
export const Issue = sequelize.define('Issue', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issueNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  materialId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Materials', key: 'id' }
  },
  rolls: { type: DataTypes.INTEGER, defaultValue: 0 },
  department: { type: DataTypes.STRING, allowNull: false },
  issuedBy: { type: DataTypes.STRING },
  date: { type: DataTypes.DATEONLY },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'Completed' }
});

// --- TRANSFER MODEL ---
export const Transfer = sequelize.define('Transfer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transferNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  materialId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Materials', key: 'id' }
  },
  fromLocation: { type: DataTypes.STRING(25), allowNull: false },
  toLocation: { type: DataTypes.STRING(25), allowNull: false },
  rolls: { type: DataTypes.INTEGER, defaultValue: 0 },
  reason: { type: DataTypes.TEXT },
  date: { type: DataTypes.DATEONLY },
  transferredBy: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Completed' }
});

// --- AUDIT LOG MODEL ---
export const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  action: { type: DataTypes.STRING, allowNull: false },
  detail: { type: DataTypes.TEXT },
  user: { type: DataTypes.STRING },
  date: { type: DataTypes.STRING },
  type: { type: DataTypes.STRING }
});

// --- DYEING MATERIAL MODEL ---
export const DyeingMaterial = sequelize.define('DyeingMaterial', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  barcodeId: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  batchNumber: { type: DataTypes.STRING(50) },
  batchDate: { type: DataTypes.STRING(20) },
  batchTime: { type: DataTypes.STRING(20) },
  cmfName: { type: DataTypes.STRING(100) },
  fabricName: { type: DataTypes.STRING(100) },
  lotNumber: { type: DataTypes.STRING(50) },
  group: { type: DataTypes.STRING(50) },
  shade: { type: DataTypes.STRING(100) },
  billNumber: { type: DataTypes.STRING(50) },
  date: { type: DataTypes.STRING(20) },
  location: {
    type: DataTypes.STRING(255)
  },
  receivedPerson: { type: DataTypes.STRING(100) },
  authorizedPerson: { type: DataTypes.STRING(100) },
  rollNumber: { type: DataTypes.INTEGER },
  batchTotal: { type: DataTypes.INTEGER },
  batchStatus: { type: DataTypes.STRING(20) },
  weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  generatedAt: { type: DataTypes.STRING(20) },
  timestamp: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING(20), defaultValue: 'in_stock' },
  unit: { type: DataTypes.STRING, defaultValue: 'KGS' }
});

// --- FABRIC ISSUANCE MODEL ---
export const FabricIssuance = sequelize.define('FabricIssuance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issuanceId: { type: DataTypes.STRING(50), unique: true },
  lotNumber: { type: DataTypes.STRING(50), allowNull: false },
  jobOrderNo: { type: DataTypes.STRING(50) },
  fabric: { type: DataTypes.STRING(100) },
  brand: { type: DataTypes.STRING(100) },
  totalQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  issuedBy: { type: DataTypes.STRING(100) },
  department: { type: DataTypes.STRING(100) },
  issuedAt: { type: DataTypes.STRING(50) },
  status: { type: DataTypes.STRING(20), defaultValue: 'completed' },
  barcodeIds: { type: DataTypes.TEXT },
  issuedItems: { type: DataTypes.TEXT },
  remarks: { type: DataTypes.TEXT },
  offlineSavedAt: { type: DataTypes.STRING(50) },
  kharchaItems: { type: DataTypes.TEXT },
  matchingStatus: { type: DataTypes.STRING(50) },
  matchingPassedBy: { type: DataTypes.STRING(100) }
});

// --- FABRIC RETURN MODEL ---
export const FabricReturn = sequelize.define('FabricReturn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lotNumber: { type: DataTypes.STRING(50), allowNull: false },
  fabricName: { type: DataTypes.STRING(100) },
  cmfName: { type: DataTypes.STRING(100) },
  party: { type: DataTypes.STRING(100) },
  shade: { type: DataTypes.STRING(100) },
  barcodeId: { type: DataTypes.STRING(50) },
  originalBarcodeId: { type: DataTypes.STRING(50), allowNull: false },
  returnedWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  returnQuantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  reason: { type: DataTypes.TEXT },
  receivedBy: { type: DataTypes.STRING(100) },
  authorizedBy: { type: DataTypes.STRING(100) },
  location: { type: DataTypes.STRING(50) },
  receivedAt: { type: DataTypes.STRING(50) },
  returnDate: { type: DataTypes.STRING(50) },
  originalIssuedWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  totalReturnedWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  newBarcodeId: { type: DataTypes.STRING(50) },
  stickerGeneratedAt: { type: DataTypes.STRING(50) },
  stickerPrinted: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// --- JOB ORDER MODEL ---
export const JobOrder = sequelize.define('JobOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  jobOrderNo: { type: DataTypes.STRING(50) },
  lotNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  fabric: { type: DataTypes.STRING(100) },
  brand: { type: DataTypes.STRING(100) },
  quantity: { type: DataTypes.INTEGER },
  unit: { type: DataTypes.STRING(20) },
  shade: { type: DataTypes.TEXT },
  date: { type: DataTypes.STRING(50) },
  size: { type: DataTypes.STRING(50) },
  garmentType: { type: DataTypes.STRING(100) },
  section: { type: DataTypes.STRING(100) },
  season: { type: DataTypes.STRING(100) },
  pattern: { type: DataTypes.STRING(100) },
  style: { type: DataTypes.STRING(100) },
  priority: { type: DataTypes.STRING(50) },
  fetchedFromSheet: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// --- PARTA MODEL ---
export const Parta = sequelize.define('Parta', {
  lotNumber: { type: DataTypes.STRING(50), primaryKey: true },
  data: { type: DataTypes.TEXT, allowNull: false }
});

// --- FABRIC CHANGE APPROVAL MODEL ---
export const FabricChangeApproval = sequelize.define('FabricChangeApproval', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issuanceId: { type: DataTypes.STRING(50) },
  lotNumber: { type: DataTypes.STRING(50), allowNull: false },
  barcodeId: { type: DataTypes.STRING(50), allowNull: false },
  requiredFabric: { type: DataTypes.STRING(255) },
  scannedFabric: { type: DataTypes.STRING(255) },
  requiredShade: { type: DataTypes.STRING(255) },
  scannedShade: { type: DataTypes.STRING(255) },
  approvedBy: { type: DataTypes.STRING(100), allowNull: false },
  approvedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

// --- FABRIC UNIT CONVERSION LOG MODEL ---
export const FabricUnitConversionLog = sequelize.define('FabricUnitConversionLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  barcodeId: { type: DataTypes.STRING(50), allowNull: false },
  lotNumber: { type: DataTypes.STRING(50), allowNull: false },
  originalWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  originalUnit: { type: DataTypes.STRING(20), defaultValue: 'MTR' },
  convertedWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  convertedUnit: { type: DataTypes.STRING(20), defaultValue: 'KGS' },
  issuanceId: { type: DataTypes.STRING(50) },
  convertedBy: { type: DataTypes.STRING(100) },
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

// --- INVENTORY MODEL ---
export const Inventory = sequelize.define('Inventory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  barcode: { type: DataTypes.STRING(50), allowNull: true },
  item_description: { type: DataTypes.STRING(255), allowNull: true },
  unit: { type: DataTypes.STRING(20), allowNull: true },
  shade: { type: DataTypes.STRING(255), allowNull: true },
  lot_no: { type: DataTypes.STRING(50), allowNull: true },
  rect_no: { type: DataTypes.STRING(50), allowNull: true },
  rect_date: { type: DataTypes.STRING(50), allowNull: true },
  party: { type: DataTypes.STRING(100), allowNull: true },
  store: { type: DataTypes.STRING(100), allowNull: true },
  issue_no: { type: DataTypes.STRING(50), allowNull: true },
  issue_date: { type: DataTypes.STRING(50), allowNull: true },
  mrn_pkgs: { type: DataTypes.STRING(50), allowNull: true },
  issue_pkgs: { type: DataTypes.STRING(50), allowNull: true },
  adj_pkgs: { type: DataTypes.STRING(50), allowNull: true },
  bal_pkgs: { type: DataTypes.STRING(50), allowNull: true },
  mrn_wt: { type: DataTypes.STRING(50), allowNull: true },
  issue_wt: { type: DataTypes.STRING(50), allowNull: true },
  adj_wt: { type: DataTypes.STRING(50), allowNull: true },
  bal_wt: { type: DataTypes.STRING(50), allowNull: true }
}, {
  tableName: 'inventory',
  timestamps: false
});

// --- TABLE MODEL ---
export const Table = sequelize.define('Table', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  supervisorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Users', key: 'id' }
  },
  cutterMasterId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Users', key: 'id' }
  },
  hall: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

// --- ESTABLISHING RELATIONSHIPS ---

// Room -> Racks
Room.hasMany(Rack, { foreignKey: 'room' });
Rack.belongsTo(Room, { foreignKey: 'room' });

// Rack -> Shelves
Rack.hasMany(Shelf, { foreignKey: 'rack' });
Shelf.belongsTo(Rack, { foreignKey: 'rack' });

// Supplier -> Materials
Supplier.hasMany(Material, { foreignKey: 'supplier' });
Material.belongsTo(Supplier, { foreignKey: 'supplier' });

// Shelf -> Materials
// Shelf.hasMany(Material, { foreignKey: 'location' });
// Material.belongsTo(Shelf, { foreignKey: 'location' });

// Shelf -> DyeingMaterials
// Shelf.hasMany(DyeingMaterial, { foreignKey: 'location' });
// DyeingMaterial.belongsTo(Shelf, { foreignKey: 'location' });

// Supplier -> GRNs
Supplier.hasMany(Grn, { foreignKey: 'supplier' });
Grn.belongsTo(Supplier, { foreignKey: 'supplier' });

// Material -> GRNs
Material.hasMany(Grn, { foreignKey: 'materialId', onDelete: 'CASCADE', hooks: true });
Grn.belongsTo(Material, { foreignKey: 'materialId', onDelete: 'CASCADE' });

// Material -> Issues
Material.hasMany(Issue, { foreignKey: 'materialId', onDelete: 'CASCADE', hooks: true });
Issue.belongsTo(Material, { foreignKey: 'materialId', onDelete: 'CASCADE' });

// Material -> Transfers
Material.hasMany(Transfer, { foreignKey: 'materialId', onDelete: 'CASCADE', hooks: true });
Transfer.belongsTo(Material, { foreignKey: 'materialId', onDelete: 'CASCADE' });

// User -> Tables
User.hasMany(Table, { foreignKey: 'supervisorId' });
Table.belongsTo(User, { foreignKey: 'supervisorId', as: 'Supervisor' });
Table.belongsTo(User, { foreignKey: 'cutterMasterId', as: 'CutterMaster' });

// --- ATTENDANCE MODEL ---
export const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  department: { type: DataTypes.STRING, allowNull: false },
  hodName: { type: DataTypes.STRING, allowNull: true },
  hodStatus: { type: DataTypes.STRING, allowNull: true }, // e.g. Present, Absent, Half Day (Legacy single value)
  hods: { type: DataTypes.TEXT }, // JSON array of HODs: [{ name, status }]
  supervisors: { type: DataTypes.TEXT }, // JSON array of supervisors: [{ name, status }]
  helpers: { type: DataTypes.TEXT }, // JSON array of helpers: [{ name, status }]
  masters: { type: DataTypes.TEXT }, // JSON array of masters: [{ name, status }]
  mastersCount: { type: DataTypes.INTEGER, defaultValue: 0 } // Total count of masters present
});

// --- STAFF MODEL ---
export const Staff = sequelize.define('Staff', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false }, // HOD, Supervisor, Helper
  status: { type: DataTypes.STRING, defaultValue: 'Active' }
});

export { sequelize };

export default {
  sequelize,
  User,
  Room,
  Rack,
  Shelf,
  Supplier,
  Material,
  Grn,
  Issue,
  Transfer,
  AuditLog,
  DyeingMaterial,
  FabricIssuance,
  FabricReturn,
  JobOrder,
  Parta,
  Inventory,
  FabricChangeApproval,
  Table,
  FabricUnitConversionLog,
  Attendance,
  Staff
};
