/**
 * db.js — SQLite connection & seed data using sql.js (pure JS)
 * Now includes: sites, params, alerts, users, complaints, service_reports
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH     = path.join(__dirname, '..', 'database', 'ocems.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');

let _db = null;

/* ─────────────────────────── INIT ─────────────────────────────────────── */
async function initDb() {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
    console.log('  ✓ Loaded existing database from disk.');
  } else {
    _db = new SQL.Database();
    console.log('  ⧗ Creating new database…');
  }

  // Apply full schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  _db.run(schema);

  // Seed users if empty
  const userCount = toRows(_db.exec('SELECT COUNT(*) as n FROM users'))[0]?.n ?? 0;
  if (userCount === 0) {
    await seedOcems(_db);
    save(_db);
    console.log('  ✓ Database seeded and saved.');
  } else {
    const siteCount = toRows(_db.exec('SELECT COUNT(*) as n FROM sites'))[0]?.n ?? 0;
    console.log(`  ✓ Database ready (${siteCount} sites).`);
  }

  return _db;
}

function save(db) {
  const data   = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
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
  // 1. Seed 12 OCEMS sites + params + alerts
  for(let i=0;i<12;i++) {
    const loc    = LOCS[i%LOCS.length];
    const sector = SECTORS[i%SECTORS.length];
    const isStack= ['Cement','Thermal Power','Steel','Chemical','Fertilizer'].includes(sector);
    const pdefs  = (isStack?STACK_P:ETP_P).slice(0,Math.floor(rnd(3,6)));
    const tgt    = i<5?'green':i<8?'yellow':i<10?'red':i===10?'grey':'red';
    const id     = `OCEMS-${String(i+1).padStart(3,'0')}`;
    const name   = `${loc.city} ${sector} Works`;
    const lat    = +(loc.lat+rnd(-.18,.18,3)).toFixed(4);
    const lng    = +(loc.lng+rnd(-.18,.18,3)).toFixed(4);
    const stacks = Math.floor(rnd(1,4));
    const etp    = Math.floor(rnd(0,2));
    const cat    = isStack?'Stack':'ETP';
    const phone  = '+91-9'+String(Math.floor(Math.random()*1e9)).padStart(9,'0');
    const spcb   = SPCB[i%SPCB.length];

    if(tgt==='grey') {
      db.run(`INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,'grey','Offline · 15m ago',?,?,?,?)`,
        [id,name,sector,loc.city,loc.state,spcb,lat,lng,stacks,etp,cat,phone]);
      continue;
    }
    const params = pdefs.map((pd, pidx) => {
      let v;
      if(tgt==='red')         v = rnd(pd.limit*1.06, pd.limit*1.45);
      else if(tgt==='yellow') v = rnd(pd.warn+1, pd.limit);
      else                    v = rnd(pd.limit*.25, pd.warn*.82);
      if(pd.min!=null) v = +Math.min(pd.limit*1.1, Math.max(pd.min, v)).toFixed(1);
      const cleanKey = pd.key.replace(/[^\w]/g, '');
      const param_id = `${id}-${cleanKey}-CH${pidx+1}`;
      return { ...pd, param_id, value:v, sig:pSig(pd,v), history:hist(v) };
    });
    const sig       = siteSig(params);
    const last_data = `${Math.floor(rnd(1,15))} min ago`;
    db.run(`INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,name,sector,loc.city,loc.state,spcb,lat,lng,sig,last_data,stacks,etp,cat,phone]);
    for(const p of params) {
      db.run(`INSERT INTO params (site_id,param_id,key,unit,value,limit_val,warn_val,min_val,sig,history_json,y_today,y30,conn_hrs,st_hrs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,p.param_id,p.key,p.unit,p.value,p.limit,p.warn,p.min??null,p.sig,JSON.stringify(p.history),
         Math.floor(rnd(0,5)),Math.floor(rnd(0,12)),rnd(0,1.5),rnd(0,1.0)]);
      if(p.sig!=='green') {
        const aid = Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
        db.run(`INSERT INTO alerts (id,site_id,site_name,param,value,unit,limit_val,sig,msg,triggered_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [aid,id,name,p.key,p.value,p.unit,p.limit,p.sig,
           `${p.key} (${p.param_id}) at ${p.value}${p.unit} — limit ${p.limit}${p.unit}`,
           Date.now()-Math.floor(Math.random()*86400000)]);
      }
    }
  }

  // 2. Seed demo users
  const adminHash = await bcrypt.hash('demo1234', 10);
  const engHash   = await bcrypt.hash('demo1234', 10);
  const indHash   = await bcrypt.hash('demo1234', 10);
  const eng2Hash  = await bcrypt.hash('demo1234', 10);

  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Admin User','admin@ocems.in',adminHash,'admin',null,'+91-9000000001']);
  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Raj Kumar','engineer@ocems.in',engHash,'engineer',null,'+91-9000000002']);
  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Pune Cement Manager','industry@ocems.in',indHash,'industry','OCEMS-001','+91-9000000003']);
  db.run(`INSERT INTO users (name,email,password_hash,role,site_id,phone) VALUES (?,?,?,?,?,?)`,
    ['Suresh Patel','engineer2@ocems.in',eng2Hash,'engineer',null,'+91-9000000004']);

  // 3. Seed sample complaints
  const now = Date.now();
  // Complaint 1: Resolved — has service report
  db.run(`INSERT INTO complaints (site_id,raised_by,title,description,priority,status,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    ['OCEMS-001',3,'CEMS Sensor Malfunction - PM10 Reading Erratic',
     'The PM10 sensor has been showing erratic readings for the past 3 days. Values are jumping between 50 and 300 mg/Nm³ without any process change. We suspect a sensor calibration issue or cable fault.',
     'high','resolved',2,now-7*86400000,now-2*86400000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [1,3,'Complaint raised. Sensor readings are unreliable.',now-7*86400000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [1,1,'Assigned to engineer Raj Kumar for site visit.',now-6*86400000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [1,2,'Visited the site. Found loose signal cable on PM10 probe. Reseated connector and performed recalibration.',now-2*86400000]);
  db.run(`INSERT INTO service_reports (complaint_id,engineer_id,visit_date,arrival_time,departure_time,problem_found,action_taken,parts_replaced,recommendations,next_visit_date,client_name,client_designation,engineer_remarks,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [1,2,'2026-07-18','10:00','14:30',
     'Loose signal cable connection on PM10 probe (Channel A). Connector was partially unseated causing intermittent signal drop and erratic readings.',
     '1. Reseated and secured the signal cable connector on PM10 probe.\n2. Performed full 3-point calibration of PM10 sensor using certified reference gas.\n3. Verified readings against reference instrument for 30 minutes — readings stable within ±2%.',
     'None — cable connection issue only',
     'Schedule quarterly cable inspection. Consider replacing the connector housing at next preventive maintenance.',
     '2026-10-18','Ramesh Gupta','Plant Manager',
     'System is now stable. Readings were within spec for 4 hours before departure.',
     'submitted',now-2*86400000,now-2*86400000]);

  // Complaint 2: In Progress
  db.run(`INSERT INTO complaints (site_id,raised_by,title,description,priority,status,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    ['OCEMS-001',3,'Data Logger Not Transmitting to CPCB Server',
     'Since yesterday evening, our data logger has stopped transmitting data to the CPCB central server. The local display is working but online portal shows no data received for last 18 hours.',
     'critical','in_progress',2,now-1*86400000,now-3600000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [2,3,'No data on CPCB portal. Compliance at risk.',now-86400000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [2,1,'Critical issue — assigned to Raj Kumar on priority.',now-82800000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [2,2,'Checked remotely. IP configuration seems wrong after last power outage. Will visit tomorrow morning.',now-3600000]);

  // Complaint 3: Open (unassigned)
  db.run(`INSERT INTO complaints (site_id,raised_by,title,description,priority,status,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    ['OCEMS-001',3,'SO2 Analyzer Span Calibration Drift',
     'Our SO2 analyzer is reading 15% lower than expected based on our process inputs. We believe the span calibration may have drifted. Requesting a calibration check.',
     'medium','open',null,now-3600000,now-3600000]);
  db.run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
    [3,3,'Noticed SO2 readings lower than expected.',now-3600000]);

  console.log('  ✓ Seeded 4 users, 3 sample complaints, 1 service report.');
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
