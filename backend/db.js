/**
 * db.js — SQLite connection & seed data using sql.js (pure JS)
 * Now includes: sites, params, alerts, users, complaints, service_reports
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');

const IS_VERCEL = !!process.env.VERCEL;
const ORIGINAL_DB_PATH = path.join(__dirname, '..', 'database', 'ocems.db');
const DB_PATH     = IS_VERCEL ? '/tmp/ocems.db' : ORIGINAL_DB_PATH;
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');

let _db = null;

/* ─────────────────────────── INIT ─────────────────────────────────────── */
async function initDb() {
  if (_db) return _db;

  if (IS_VERCEL && !fs.existsSync('/tmp/ocems.db')) {
    try {
      if (fs.existsSync(ORIGINAL_DB_PATH)) {
        fs.copyFileSync(ORIGINAL_DB_PATH, '/tmp/ocems.db');
        console.log('  ✓ Copied read-only database to /tmp/ocems.db for writing.');
      } else {
        console.warn('  ⚠️ Original DB not found at:', ORIGINAL_DB_PATH);
      }
    } catch (err) {
      console.error('  ⚠️ Error copying DB to /tmp:', err.message);
    }
  }

  const initSqlJs = require('sql.js');
  let SQL;
  try {
    const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
    SQL = await initSqlJs({
      locateFile: file => {
        if (file.endsWith('.wasm')) return wasmPath;
        return file;
      }
    });
  } catch (err) {
    console.warn('  ⚠️ Custom WASM path failed, trying default initSqlJs:', err.message);
    SQL = await initSqlJs();
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(fileBuffer);
      console.log('  ✓ Loaded existing database from disk.');
    } catch (err) {
      console.warn('  ⚠️ Could not read DB_PATH, initializing empty database in memory:', err.message);
      _db = new SQL.Database();
    }
  } else {
    _db = new SQL.Database();
    console.log('  ⧗ Creating new database…');
  }

  // Apply full schema
  if (fs.existsSync(SCHEMA_PATH)) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    _db.run(schema);
  }

  // Seed users if empty
  try {
    const siteCount = toRows(_db.exec('SELECT COUNT(*) as n FROM sites'))[0]?.n ?? 0;
    if (siteCount === 0) {
      await seedDemoData(_db);
      save(_db);
      console.log('  ✓ Database seeded with demo sites and contract billing data.');
    } else {
      console.log(`  ✓ Database ready (${siteCount} sites).`);
    }
  } catch (err) {
    console.warn('  ⚠️ Error seeding database:', err.message);
  }

  return _db;
}

function save(db) {
  try {
    const data   = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.warn('  ⚠️ Note: Could not write database to disk (Vercel read-only environment):', err.message);
  }
}

/* ─────────────────────────── OCEMS DATA GENERATION ───────────────────── */
const SECTORS  = ['Cement','Thermal Power','Steel','Textile','Chemical','Pharmaceutical','Fertilizer','Pulp & Paper','Sugar','Distillery','Tannery','Dye & Intermediates'];
const SPCB     = ['KSPCB','MPCB','UPPCB','GPCB','TNPCB','CPCB','PPCB','HPCB','CGSPCB','RPCB'];
const LOCS     = [
  { city:'Pune',      state:'Maharashtra',    lat:18.52, lng:73.86 },
  { city:'Vadodara',  state:'Gujarat',        lat:22.31, lng:73.18 },
  { city:'Kanpur',    state:'Uttar Pradesh',  lat:26.45, lng:80.33 },
  { city:'Ahmedabad', state:'Gujarat',        lat:23.02, lng:72.57 },
  { city:'Raipur',    state:'Chhattisgarh',   lat:21.25, lng:81.63 },
  { city:'Ludhiana',  state:'Punjab',         lat:30.90, lng:75.85 },
  { city:'Surat',     state:'Gujarat',        lat:21.17, lng:72.83 },
  { city:'Nagpur',    state:'Maharashtra',    lat:21.15, lng:79.09 },
  { city:'Bhopal',    state:'Madhya Pradesh', lat:23.26, lng:77.41 },
  { city:'Jaipur',    state:'Rajasthan',      lat:26.91, lng:75.79 },
  { city:'Patna',     state:'Bihar',          lat:25.59, lng:85.13 },
  { city:'Hyderabad', state:'Telangana',      lat:17.38, lng:78.49 },
];
const STACK_P = [
  { key:'PM\u2081\u2080',  unit:'mg/Nm\u00b3', limit:150, warn:120 },
  { key:'SO\u2082',        unit:'mg/Nm\u00b3', limit:200, warn:160 },
  { key:'NO\u2093',        unit:'mg/Nm\u00b3', limit:250, warn:200 },
  { key:'CO',              unit:'mg/Nm\u00b3', limit:500, warn:400 },
  { key:'HF',              unit:'mg/Nm\u00b3', limit:5,   warn:4   },
];
const ETP_P = [
  { key:'pH',  unit:'',     limit:9.5,  warn:9,   min:6.5 },
  { key:'BOD', unit:'mg/L', limit:30,   warn:24            },
  { key:'COD', unit:'mg/L', limit:250,  warn:200           },
  { key:'TSS', unit:'mg/L', limit:100,  warn:80            },
  { key:'TDS', unit:'mg/L', limit:2100, warn:1700          },
];

function rnd(a, b, dp=1) { return parseFloat((Math.random()*(b-a)+a).toFixed(dp)); }
function hist(base, noise=0.18) {
  let v=base, a=[];
  for(let i=0;i<24;i++){ v+=((Math.random()-.46)*base*noise); v=Math.max(0,v); a.push(+v.toFixed(1)); }
  return a;
}
function pSig(p, v) {
  if(p.min!=null && (v<p.min||v>p.limit)) return 'red';
  if(v>p.limit) return 'red';
  if(v>p.warn)  return 'yellow';
  return 'green';
}
function siteSig(params) {
  if(params.some(p=>p.sig==='red'))    return 'red';
  if(params.some(p=>p.sig==='yellow')) return 'yellow';
  return 'green';
}

async function seedOcems(db) {
  // Seed system users (Admin & Engineers) only
  const adminHash = await bcrypt.hash('demo1234', 10);
  const engHash   = await bcrypt.hash('demo1234', 10);
  const eng2Hash  = await bcrypt.hash('demo1234', 10);

  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Admin User','admin@ocems.in',adminHash,'admin',null,'+91-9000000001']);
  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Raj Kumar','engineer@ocems.in',engHash,'engineer',null,'+91-9000000002']);
  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Suresh Patel','engineer2@ocems.in',eng2Hash,'engineer',null,'+91-9000000004']);

  console.log('  ✓ Seeded system admin & engineer users.');
}

async function seedDemoData(db) {
  const hash = await bcrypt.hash('demo1234', 10);

  // 1. Seed Sites
  db.run(`INSERT INTO sites (id, name, sector, city, state, spcb, lat, lng, sig, last_data, stacks, etp, cat, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-001', 'Pune Cement Works', 'Cement', 'Pune', 'Maharashtra', 'MPCB', 18.52, 73.86, 'green', 'Live · Just now', 2, 0, 'Stack', '+91-9876543210']);
  db.run(`INSERT INTO sites (id, name, sector, city, state, spcb, lat, lng, sig, last_data, stacks, etp, cat, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-002', 'Vadodara Chemicals', 'Chemical', 'Vadodara', 'Gujarat', 'GPCB', 22.31, 73.18, 'yellow', 'Live · Just now', 0, 1, 'ETP', '+91-9876543211']);
  db.run(`INSERT INTO sites (id, name, sector, city, state, spcb, lat, lng, sig, last_data, stacks, etp, cat, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-003', 'Kanpur Steel Plant', 'Steel', 'Kanpur', 'Uttar Pradesh', 'UPPCB', 26.45, 80.33, 'red', 'Live · Just now', 1, 0, 'Stack', '+91-9876543212']);

  // 2. Seed Users
  db.run(`INSERT INTO users (name, email, password_hash, role, site_id, phone) VALUES (?, ?, ?, 'industry', ?, ?)`,
    ['Pune Manager', 'industry@ocems.in', hash, 'OCEMS-001', '+91-9876543210']);
  db.run(`INSERT INTO users (name, email, password_hash, role, site_id, phone) VALUES (?, ?, ?, 'industry', ?, ?)`,
    ['Vadodara Manager', 'vadodara@ocems.in', hash, 'OCEMS-002', '+91-9876543211']);
  db.run(`INSERT INTO users (name, email, password_hash, role, site_id, phone) VALUES (?, ?, ?, 'industry', ?, ?)`,
    ['Kanpur Manager', 'kanpur@ocems.in', hash, 'OCEMS-003', '+91-9876543212']);

  // Helper function to insert parameters
  const addParam = (siteId, key, channel, unit, limit, warn, min, val) => {
    const history = val !== null ? [val] : [];
    let sig = 'green';
    if (val !== null) {
      if (min !== null && (val < min || val > limit)) sig = 'red';
      else if (val > limit) sig = 'red';
      else if (val > warn) sig = 'yellow';
    }
    db.run(`INSERT INTO params (site_id, param_id, key, unit, value, limit_val, warn_val, min_val, sig, history_json, y_today, y30, conn_hrs, st_hrs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`,
      [siteId, `${siteId}-${channel}-CH1`, key, unit, val, limit, warn, min, sig, JSON.stringify(history)]);
  };

  // 3. Seed Params
  // OCEMS-001 Stack
  addParam('OCEMS-001', 'PM₁₀', 'PM10', 'mg/Nm³', 150, 120, null, 68.2);
  addParam('OCEMS-001', 'SO₂', 'SO2', 'mg/Nm³', 200, 160, null, 92.4);
  addParam('OCEMS-001', 'NOₓ', 'NOX', 'mg/Nm³', 250, 200, null, 115.6);
  addParam('OCEMS-001', 'CO', 'CO', 'mg/Nm³', 500, 400, null, 140.1);

  // OCEMS-002 ETP
  addParam('OCEMS-002', 'pH', 'pH', '', 9.5, 9.0, 6.5, 7.4);
  addParam('OCEMS-002', 'BOD', 'BOD', 'mg/L', 30, 24, null, 18.5);
  addParam('OCEMS-002', 'COD', 'COD', 'mg/L', 250, 200, null, 110.0);
  addParam('OCEMS-002', 'TSS', 'TSS', 'mg/L', 100, 80, null, 42.0);

  // OCEMS-003 Stack
  addParam('OCEMS-003', 'PM₁₀', 'PM10', 'mg/Nm³', 150, 120, null, 158.4); // red
  addParam('OCEMS-003', 'SO₂', 'SO2', 'mg/Nm³', 200, 160, null, 172.1);  // yellow
  addParam('OCEMS-003', 'NOₓ', 'NOX', 'mg/Nm³', 250, 200, null, 122.5);

  // 4. Seed Analyzers (Contracts)
  db.run(`INSERT INTO analyzers (site_id, name, amc_amount, cmc_amount, balance_amount, payment_status, contract_start, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-001', 'CEMS Stack Gas Analyzer', 120000, 80000, 40000, 'Partially Paid', '2026-01-01', '2026-12-31']);
  db.run(`INSERT INTO analyzers (site_id, name, amc_amount, cmc_amount, balance_amount, payment_status, contract_start, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-001', 'Stack Particulate Matter Monitor', 75000, 35000, 0, 'Paid', '2026-03-01', '2027-02-28']);
  db.run(`INSERT INTO analyzers (site_id, name, amc_amount, cmc_amount, balance_amount, payment_status, contract_start, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-002', 'ETP Water Quality Analyzer', 95000, 45000, 0, 'Paid', '2026-02-01', '2027-01-31']);
  db.run(`INSERT INTO analyzers (site_id, name, amc_amount, cmc_amount, balance_amount, payment_status, contract_start, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['OCEMS-003', 'Blast Furnace Emission CEMS', 180000, 120000, 180000, 'Pending', '2026-06-01', '2027-05-31']);

  // Get analyzer IDs to reference in transactions
  const analyzers = toRows(db.exec('SELECT id, name, site_id FROM analyzers'));
  const getAnalyzerId = (siteId, name) => analyzers.find(a => a.site_id === siteId && a.name === name)?.id || null;

  // 5. Seed Transactions
  const stackGasId = getAnalyzerId('OCEMS-001', 'CEMS Stack Gas Analyzer');
  if (stackGasId) {
    db.run(`INSERT INTO transactions (site_id, analyzer_id, amount, payment_date, payment_method, reference_no, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['OCEMS-001', stackGasId, 160000, '2026-02-15', 'Bank Transfer', 'TXN-998811', '80% advance payment']);
  }

  const particulateId = getAnalyzerId('OCEMS-001', 'Stack Particulate Matter Monitor');
  if (particulateId) {
    db.run(`INSERT INTO transactions (site_id, analyzer_id, amount, payment_date, payment_method, reference_no, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['OCEMS-001', particulateId, 110000, '2026-04-10', 'UPI', 'TXN-998822', 'Full payment']);
  }

  const etpAnalyzerId = getAnalyzerId('OCEMS-002', 'ETP Water Quality Analyzer');
  if (etpAnalyzerId) {
    db.run(`INSERT INTO transactions (site_id, analyzer_id, amount, payment_date, payment_method, reference_no, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['OCEMS-002', etpAnalyzerId, 140000, '2026-03-05', 'Bank Transfer', 'TXN-998833', 'Full payment including taxes']);
  }
}

/* ─────────────────────────── QUERY HELPER ───────────────────────────────── */
function toRows(result) {
  if (!result || !result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col,i) => { obj[col] = row[i]; });
    return obj;
  });
}

module.exports = { initDb, toRows, save };
