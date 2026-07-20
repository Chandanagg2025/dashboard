/**
 * server.js — OCEMS Dashboard REST API (v2)
 *
 * Auth Routes:
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * OCEMS Data:
 *   GET  /api/sites, /api/sites/:id, /api/alerts, /api/kpis, /api/health
 *
 * Complaints:
 *   GET    /api/complaints
 *   POST   /api/complaints
 *   GET    /api/complaints/:id
 *   PATCH  /api/complaints/:id
 *   POST   /api/complaints/:id/updates
 *
 * Service Reports:
 *   GET  /api/reports/:complaintId
 *   POST /api/reports/:complaintId
 *   GET  /api/reports/:complaintId/pdf
 */

'use strict';

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const PDFDocument  = require('pdfkit');

const { initDb, toRows, save } = require('./db');
const { hashPassword, comparePassword, signToken, requireAuth, COOKIE } = require('./auth');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────────────────────── */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

/* ── DB reference ───────────────────────────────────────────────────────── */
let db = null;

function q(sql, params = []) { return toRows(db.exec(sql, params)); }
function run(sql, params = []) { db.run(sql, params); }

/* ── Helpers ────────────────────────────────────────────────────────────── */
function attachParams(site) {
  const params = q('SELECT * FROM params WHERE site_id = ? ORDER BY id', [site.id]).map(p => ({
    ...p, history: JSON.parse(p.history_json || '[]'),
  }));
  return { ...site, params };
}

function getComplaint(id) {
  const c = q('SELECT * FROM complaints WHERE id = ?', [id])[0];
  if (!c) return null;
  const updates = q(`SELECT u.*, usr.name AS author_name, usr.role AS author_role
    FROM complaint_updates u JOIN users usr ON u.author_id = usr.id
    WHERE u.complaint_id = ? ORDER BY u.created_at ASC`, [id]);
  const site    = q('SELECT * FROM sites WHERE id = ?', [c.site_id])[0];
  const raiser  = q('SELECT id,name,email,role FROM users WHERE id = ?', [c.raised_by])[0];
  const engineer= c.assigned_to ? q('SELECT id,name,email FROM users WHERE id = ?',[c.assigned_to])[0] : null;
  return { ...c, site, raiser, engineer, updates };
}

/* ══════════════════════════ AUTH ROUTES ═══════════════════════════════════ */

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    let cleanEmail = email.toLowerCase().trim();
    const dupMatch = cleanEmail.match(/^(.+?@.+?)\1$/);
    if (dupMatch) cleanEmail = dupMatch[1];

    const users = q('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!users.length) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const user = users[0];
    const ok   = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken(user);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000,
    });

    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role, site_id: user.site_id },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.json({ success: true, data: req.user });
});

/* ══════════════════════════ OCEMS DATA ROUTES ═════════════════════════════ */

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// POST /api/ingest/telemetry — Hardware Analyzer Ingestion & Response Diversion
app.post('/api/ingest/telemetry', (req, res) => {
  try {
    const { telemetry } = req.body;
    const items = Array.isArray(telemetry) ? telemetry : [req.body];
    const updatedParams = [];

    items.forEach(item => {
      const { param_id, value } = item;
      if (!param_id || value === undefined) return;

      const p = q('SELECT * FROM params WHERE param_id = ?', [param_id])[0];
      if (!p) return;

      const valNum = parseFloat(value);
      let sig = 'green';
      if (p.min_val != null && (valNum < p.min_val || valNum > p.limit_val)) sig = 'red';
      else if (valNum > p.limit_val) sig = 'red';
      else if (valNum > p.warn_val) sig = 'yellow';

      const history = JSON.parse(p.history_json || '[]');
      history.push(valNum);
      if (history.length > 24) history.shift();

      run(`UPDATE params SET value = ?, sig = ?, history_json = ? WHERE param_id = ?`,
        [valNum, sig, JSON.stringify(history), param_id]);

      // Update site signal & timestamp
      const siteParams = q('SELECT sig FROM params WHERE site_id = ?', [p.site_id]);
      let siteSig = 'green';
      if (siteParams.some(x => x.sig === 'red')) siteSig = 'red';
      else if (siteParams.some(x => x.sig === 'yellow')) siteSig = 'yellow';

      run(`UPDATE sites SET sig = ?, last_data = 'Live · Just now' WHERE id = ?`, [siteSig, p.site_id]);

      // Create alert if exceeding warning/limit threshold
      if (sig !== 'green') {
        const site = q('SELECT name FROM sites WHERE id = ?', [p.site_id])[0];
        const aid = Math.random().toString(36).slice(2);
        run(`INSERT INTO alerts (id, site_id, site_name, param, value, unit, limit_val, sig, msg, triggered_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [aid, p.site_id, site?.name || p.site_id, p.key, valNum, p.unit, p.limit_val, sig,
           `Hardware Diversion Alert: ${p.key} (${param_id}) recorded ${valNum}${p.unit} (Limit: ${p.limit_val}${p.unit})`, Date.now()]);
      }

      updatedParams.push({ param_id, key: p.key, site_id: p.site_id, value: valNum, sig });
    });

    save(db);
    res.json({ success: true, count: updatedParams.length, data: updatedParams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sites', (_req, res) => {
  try { res.json({ success: true, data: q('SELECT * FROM sites ORDER BY id').map(attachParams) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/sites/:id', (req, res) => {
  try {
    const rows = q('SELECT * FROM sites WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Site not found' });
    res.json({ success: true, data: attachParams(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/sites — Add new Industry / Site (Admin Only)
app.post('/api/sites', requireAuth(['admin']), async (req, res) => {
  try {
    const {
      name, sector, city, state, spcb,
      lat = 20.0, lng = 78.0, stacks = 1, etp = 0,
      cat = 'Stack', phone = '', user_email = '', user_password = ''
    } = req.body;

    if (!name || !sector || !city || !state || !spcb) {
      return res.status(400).json({ success: false, error: 'name, sector, city, state, spcb required' });
    }

    // Auto-generate Site ID (OCEMS-XXX)
    const existing = q('SELECT id FROM sites');
    let maxNum = 0;
    existing.forEach(s => {
      const match = s.id.match(/^OCEMS-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const id = `OCEMS-${String(maxNum + 1).padStart(3, '0')}`;

    run(`INSERT INTO sites (id, name, sector, city, state, spcb, lat, lng, sig, last_data, stacks, etp, cat, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'grey', 'Awaiting Analyzer Data', ?, ?, ?, ?)`,
      [id, name, sector, city, state, spcb, parseFloat(lat), parseFloat(lng), parseInt(stacks), parseInt(etp), cat, phone]);

    // Process parameters (custom parameter builder array OR default params)
    const customParams = req.body.params;
    const isStack = cat === 'Stack';

    const paramList = (Array.isArray(customParams) && customParams.length > 0)
      ? customParams.map((p, pidx) => {
          const cleanKey = (p.key || 'PARAM').replace(/[^\w]/g, '');
          const param_id = p.param_id || `${id}-${cleanKey}-CH${pidx + 1}`;
          const val = (p.value !== undefined && p.value !== null && p.value !== '') ? parseFloat(p.value) : null;
          const limit = parseFloat(p.limit_val ?? p.limit ?? 100);
          const warn = parseFloat(p.warn_val ?? p.warn ?? (limit * 0.8));
          const min = p.min_val != null ? parseFloat(p.min_val) : (p.min != null ? parseFloat(p.min) : null);
          const unit = p.unit || '';
          return { key: p.key, param_id, unit, val, limit, warn, min };
        })
      : (isStack ? [
          { key: 'PM₁₀', param_id: `${id}-PM-CH1`, unit: 'mg/Nm³', val: null, limit: 150, warn: 120, min: null },
          { key: 'SO₂',   param_id: `${id}-SO-CH2`, unit: 'mg/Nm³', val: null, limit: 200, warn: 160, min: null },
          { key: 'NOₓ',   param_id: `${id}-NO-CH3`, unit: 'mg/Nm³', val: null, limit: 250, warn: 200, min: null },
          { key: 'CO',    param_id: `${id}-CO-CH4`, unit: 'mg/Nm³', val: null, limit: 500, warn: 400, min: null },
        ] : [
          { key: 'pH',   param_id: `${id}-pH-CH1`, unit: '',     val: null, limit: 9.5, warn: 9.0, min: 6.5 },
          { key: 'BOD',  param_id: `${id}-BOD-CH2`, unit: 'mg/L', val: null, limit: 30,  warn: 24,  min: null },
          { key: 'COD',  param_id: `${id}-COD-CH3`, unit: 'mg/L', val: null, limit: 250, warn: 200, min: null },
          { key: 'TSS',  param_id: `${id}-TSS-CH4`, unit: 'mg/L', val: null, limit: 100, warn: 80,  min: null },
        ]);

    paramList.forEach((p) => {
      const hist = p.val != null ? [p.val] : [];
      let sig = 'grey';
      if (p.val != null) {
        if (p.min != null && (p.val < p.min || p.val > p.limit)) sig = 'red';
        else if (p.val > p.limit) sig = 'red';
        else if (p.val > p.warn) sig = 'yellow';
        else sig = 'green';
      }

      run(`INSERT INTO params (site_id, param_id, key, unit, value, limit_val, warn_val, min_val, sig, history_json, y_today, y30, conn_hrs, st_hrs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`,
        [id, p.param_id, p.key, p.unit, p.val, p.limit, p.warn, p.min ?? null, sig, JSON.stringify(hist)]);
    });

    // Optionally create dedicated Industry User with custom password
    if (user_email && user_password) {
      const passHash = await hashPassword(user_password);
      const cleanEmail = user_email.toLowerCase().trim();
      run(`INSERT INTO users (name, email, password_hash, role, site_id, phone) VALUES (?, ?, ?, 'industry', ?, ?)`,
        [`${name} Manager`, cleanEmail, passHash, id, phone]);
    }

    save(db);

    const created = q('SELECT * FROM sites WHERE id = ?', [id])[0];
    res.json({ success: true, data: attachParams(created) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/sites/:id — Delete Industry / Site (Admin Only)
app.delete('/api/sites/:id', requireAuth(['admin']), (req, res) => {
  try {
    const id = req.params.id;
    const existing = q('SELECT * FROM sites WHERE id = ?', [id])[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Industry / Site not found' });

    run('DELETE FROM params WHERE site_id = ?', [id]);
    run('DELETE FROM alerts WHERE site_id = ?', [id]);
    run('DELETE FROM complaints WHERE site_id = ?', [id]);
    run('DELETE FROM sites WHERE id = ?', [id]);

    save(db);

    res.json({ success: true, data: { id, message: `Industry ${existing.name} (${id}) deleted successfully.` } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/alerts', (_req, res) => {
  try { res.json({ success: true, data: q('SELECT * FROM alerts ORDER BY triggered_at DESC') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/kpis', (_req, res) => {
  try {
    const row   = q(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN sig='green' THEN 1 ELSE 0 END) AS green,
      SUM(CASE WHEN sig='yellow' THEN 1 ELSE 0 END) AS yellow,
      SUM(CASE WHEN sig='red' THEN 1 ELSE 0 END) AS red,
      SUM(CASE WHEN sig='grey' THEN 1 ELSE 0 END) AS grey FROM sites`)[0] || {};
    const a24   = q('SELECT COUNT(*) AS cnt FROM alerts WHERE triggered_at > ?', [Date.now()-86400000])[0]?.cnt || 0;
    res.json({ success: true, data: { ...row, exc: row.red||0, offline: row.grey||0, a24 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* ══════════════════════════ COMPLAINT ROUTES ══════════════════════════════ */

// GET /api/complaints — role-filtered with optional site_id query
app.get('/api/complaints', requireAuth(), (req, res) => {
  try {
    const { role, id: uid, site_id } = req.user;
    const filterSite = req.query.site_id;
    let sql, params;

    if (role === 'admin') {
      if (filterSite) {
        sql    = 'SELECT c.*, s.name AS site_name, u.name AS raiser_name FROM complaints c LEFT JOIN sites s ON c.site_id=s.id LEFT JOIN users u ON c.raised_by=u.id WHERE c.site_id=? ORDER BY c.created_at DESC';
        params = [filterSite];
      } else {
        sql    = 'SELECT c.*, s.name AS site_name, u.name AS raiser_name FROM complaints c LEFT JOIN sites s ON c.site_id=s.id LEFT JOIN users u ON c.raised_by=u.id ORDER BY c.created_at DESC';
        params = [];
      }
    } else if (role === 'engineer') {
      if (filterSite) {
        sql    = 'SELECT c.*, s.name AS site_name, u.name AS raiser_name FROM complaints c LEFT JOIN sites s ON c.site_id=s.id LEFT JOIN users u ON c.raised_by=u.id WHERE c.assigned_to=? AND c.site_id=? ORDER BY c.created_at DESC';
        params = [uid, filterSite];
      } else {
        sql    = 'SELECT c.*, s.name AS site_name, u.name AS raiser_name FROM complaints c LEFT JOIN sites s ON c.site_id=s.id LEFT JOIN users u ON c.raised_by=u.id WHERE c.assigned_to=? ORDER BY c.created_at DESC';
        params = [uid];
      }
    } else {
      // industry — see own site complaints
      const targetSite = filterSite || site_id;
      sql    = 'SELECT c.*, s.name AS site_name, u.name AS raiser_name FROM complaints c LEFT JOIN sites s ON c.site_id=s.id LEFT JOIN users u ON c.raised_by=u.id WHERE c.site_id=? ORDER BY c.created_at DESC';
      params = [targetSite];
    }

    const complaints = q(sql, params);
    // Attach engineer name
    const engineers  = q("SELECT id,name FROM users WHERE role='engineer'");
    const engMap     = Object.fromEntries(engineers.map(e=>[e.id,e.name]));
    const out = complaints.map(c => ({ ...c, assigned_engineer: c.assigned_to ? engMap[c.assigned_to] : null }));
    res.json({ success: true, data: out });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/complaints — industry raises complaint
app.post('/api/complaints', requireAuth(['industry','admin']), (req, res) => {
  try {
    const { title, description, priority='medium' } = req.body;
    if (!title || !description) return res.status(400).json({ success: false, error: 'Title and description required' });
    const site_id = req.user.role === 'admin' ? req.body.site_id : req.user.site_id;
    if (!site_id)  return res.status(400).json({ success: false, error: 'site_id required' });

    const now = Date.now();
    run(`INSERT INTO complaints (site_id,raised_by,title,description,priority,status,created_at,updated_at)
         VALUES (?,?,?,?,?,'open',?,?)`, [site_id,req.user.id,title,description,priority,now,now]);
    const cid = toRows(db.exec('SELECT last_insert_rowid() AS id'))[0].id;

    run(`INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)`,
      [cid, req.user.id, `Complaint raised: ${title}`, now]);

    save(db);
    res.json({ success: true, data: { id: cid } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/complaints/:id
app.get('/api/complaints/:id', requireAuth(), (req, res) => {
  try {
    const c = getComplaint(parseInt(req.params.id));
    if (!c) return res.status(404).json({ success: false, error: 'Complaint not found' });
    // Access control
    const { role, id: uid, site_id } = req.user;
    if (role==='industry' && c.site_id!==site_id) return res.status(403).json({ success:false, error:'Access denied' });
    if (role==='engineer' && c.assigned_to!==uid)  return res.status(403).json({ success:false, error:'Access denied' });
    res.json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/complaints/:id — update status / assign engineer
app.patch('/api/complaints/:id', requireAuth(['admin','engineer']), (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const c   = q('SELECT * FROM complaints WHERE id=?',[cid])[0];
    if (!c) return res.status(404).json({ success: false, error: 'Complaint not found' });

    const { status, assigned_to, message } = req.body;
    const now = Date.now();

    if (status)      run('UPDATE complaints SET status=?,updated_at=? WHERE id=?',[status,now,cid]);
    if (assigned_to !== undefined) {
      run('UPDATE complaints SET assigned_to=?,status=CASE WHEN status=\'open\' THEN \'assigned\' ELSE status END,updated_at=? WHERE id=?',
        [assigned_to,now,cid]);
    }
    if (message) {
      run('INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)',
        [cid,req.user.id,message,now]);
    }
    save(db);
    res.json({ success: true, data: getComplaint(cid) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/complaints/:id/updates
app.post('/api/complaints/:id/updates', requireAuth(), (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });
    run('INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)',
      [cid,req.user.id,message,Date.now()]);
    run('UPDATE complaints SET updated_at=? WHERE id=?',[Date.now(),cid]);
    save(db);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/engineers — for admin dropdown
app.get('/api/engineers', requireAuth(['admin']), (_req, res) => {
  try {
    res.json({ success:true, data: q("SELECT id,name,email FROM users WHERE role='engineer' ORDER BY name") });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

/* ══════════════════════════ SERVICE REPORT ROUTES ═════════════════════════ */

// GET /api/reports/:complaintId
app.get('/api/reports/:complaintId', requireAuth(), (req, res) => {
  try {
    const cid = parseInt(req.params.complaintId);
    const report = q('SELECT r.*, u.name AS engineer_name, u.email AS engineer_email, u.phone AS engineer_phone FROM service_reports r JOIN users u ON r.engineer_id=u.id WHERE r.complaint_id=?',[cid])[0];
    if (!report) return res.status(404).json({ success: false, error: 'No service report for this complaint' });
    res.json({ success: true, data: report });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/reports/:complaintId — create or update
app.post('/api/reports/:complaintId', requireAuth(['engineer','admin']), (req, res) => {
  try {
    const cid = parseInt(req.params.complaintId);
    const c   = q('SELECT * FROM complaints WHERE id=?',[cid])[0];
    if (!c) return res.status(404).json({ success: false, error: 'Complaint not found' });

    const {
      visit_date, arrival_time='', departure_time='',
      problem_found, action_taken, parts_replaced='',
      recommendations='', next_visit_date='',
      client_name='', client_designation='', engineer_remarks='',
      submit=false,
    } = req.body;

    if (!visit_date || !problem_found || !action_taken)
      return res.status(400).json({ success: false, error: 'visit_date, problem_found, action_taken required' });

    const now    = Date.now();
    const status = submit ? 'submitted' : 'draft';
    const exists = q('SELECT id FROM service_reports WHERE complaint_id=?',[cid])[0];

    if (exists) {
      run(`UPDATE service_reports SET visit_date=?,arrival_time=?,departure_time=?,problem_found=?,action_taken=?,parts_replaced=?,recommendations=?,next_visit_date=?,client_name=?,client_designation=?,engineer_remarks=?,status=?,updated_at=? WHERE complaint_id=?`,
        [visit_date,arrival_time,departure_time,problem_found,action_taken,parts_replaced,recommendations,next_visit_date,client_name,client_designation,engineer_remarks,status,now,cid]);
    } else {
      run(`INSERT INTO service_reports (complaint_id,engineer_id,visit_date,arrival_time,departure_time,problem_found,action_taken,parts_replaced,recommendations,next_visit_date,client_name,client_designation,engineer_remarks,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [cid,req.user.id,visit_date,arrival_time,departure_time,problem_found,action_taken,parts_replaced,recommendations,next_visit_date,client_name,client_designation,engineer_remarks,status,now,now]);
    }

    // If submitting, mark complaint resolved
    if (submit) {
      run("UPDATE complaints SET status='resolved',updated_at=? WHERE id=?",[now,cid]);
      run('INSERT INTO complaint_updates (complaint_id,author_id,message,created_at) VALUES (?,?,?,?)',
        [cid,req.user.id,'Service report submitted. Complaint marked as resolved.',now]);
    }

    save(db);
    res.json({ success: true, data: { complaint_id: cid, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/reports/:complaintId/pdf — stream PDF
app.get('/api/reports/:complaintId/pdf', requireAuth(), (req, res) => {
  try {
    const cid = parseInt(req.params.complaintId);
    const report = q('SELECT r.*, u.name AS eng_name, u.email AS eng_email, u.phone AS eng_phone FROM service_reports r JOIN users u ON r.engineer_id=u.id WHERE r.complaint_id=?',[cid])[0];
    if (!report) return res.status(404).json({ success: false, error: 'No service report found' });

    const complaint = q('SELECT c.*, s.name AS site_name, s.city, s.state, s.sector, s.spcb FROM complaints c JOIN sites s ON c.site_id=s.id WHERE c.id=?',[cid])[0];
    if (!complaint) return res.status(404).json({ success: false, error: 'Complaint not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Service_Report_${cid}_${report.visit_date}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // ── Header ──
    const accentColor = '#7c3aed';
    doc.rect(0, 0, doc.page.width, 90).fill(accentColor);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
       .text('SHREE PRATHAM', 50, 22, { align: 'left' });
    doc.fontSize(9).font('Helvetica')
       .text('Environmental Monitoring Solutions · OCEMS Platform', 50, 48);
    doc.fontSize(14).font('Helvetica-Bold')
       .text('SERVICE REPORT', 0, 30, { align: 'right', width: doc.page.width - 50 });
    doc.fontSize(9).font('Helvetica')
       .text(`Report #SR-${String(cid).padStart(4,'0')}`, 0, 50, { align: 'right', width: doc.page.width - 50 });

    doc.fillColor('#333333');
    let y = 110;

    // ── Info Row ──
    const infoBox = (label, value, x, width) => {
      doc.fontSize(8).fillColor('#888888').font('Helvetica').text(label, x, y, { width });
      doc.fontSize(10).fillColor('#111111').font('Helvetica-Bold').text(value || '—', x, y+12, { width });
    };
    infoBox('SITE NAME', complaint.site_name, 50, 260);
    infoBox('SITE CODE', complaint.site_id, 320, 120);
    infoBox('VISIT DATE', report.visit_date, 450, 100);
    y += 40;
    infoBox('SECTOR', complaint.sector, 50, 150);
    infoBox('SPCB', complaint.spcb, 210, 100);
    infoBox('CITY / STATE', `${complaint.city}, ${complaint.state}`, 320, 180);
    y += 40;
    infoBox('SERVICE ENGINEER', report.eng_name, 50, 200);
    infoBox('ARRIVAL', report.arrival_time || '—', 260, 80);
    infoBox('DEPARTURE', report.departure_time || '—', 350, 80);
    infoBox('COMPLAINT #', `C-${String(cid).padStart(4,'0')}`, 440, 110);
    y += 50;

    doc.moveTo(50, y).lineTo(doc.page.width-50, y).stroke('#dddddd');
    y += 14;

    // ── Section helper ──
    const section = (title, content) => {
      if (y > 680) { doc.addPage(); y = 50; }
      doc.rect(50, y, doc.page.width-100, 20).fill(accentColor);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(title, 58, y+5);
      y += 28;
      doc.fillColor('#222222').fontSize(10).font('Helvetica')
         .text(content || '—', 50, y, { width: doc.page.width-100, align: 'left' });
      y += doc.heightOfString(content||'—', { width: doc.page.width-100 }) + 16;
    };

    section('PROBLEM FOUND', report.problem_found);
    section('ACTION TAKEN', report.action_taken);
    if (report.parts_replaced) section('PARTS REPLACED / MATERIALS USED', report.parts_replaced);
    if (report.recommendations) section('RECOMMENDATIONS', report.recommendations);
    if (report.engineer_remarks) section('ENGINEER REMARKS', report.engineer_remarks);

    // ── Signature Block ──
    if (y > 650) { doc.addPage(); y = 50; }
    y += 20;
    doc.moveTo(50, y).lineTo(doc.page.width-50, y).stroke('#dddddd');
    y += 20;

    const sigBox = (label, name, x, w) => {
      doc.rect(x, y, w, 60).stroke('#dddddd');
      doc.fontSize(8).fillColor('#888888').font('Helvetica').text(label, x+8, y+8, { width: w-16 });
      doc.fontSize(10).fillColor('#111111').font('Helvetica-Bold').text(name || '', x+8, y+36, { width: w-16 });
    };
    sigBox('SERVICE ENGINEER SIGNATURE & NAME', report.eng_name, 50, 230);
    sigBox('CLIENT REPRESENTATIVE', `${report.client_name}${report.client_designation?'\n'+report.client_designation:''}`, 300, 245);

    // ── Next Visit ──
    if (report.next_visit_date) {
      y += 80;
      doc.fontSize(9).fillColor('#555555').font('Helvetica')
         .text(`Next Scheduled Visit: ${report.next_visit_date}`, 50, y);
    }

    // ── Footer ──
    const footerY = doc.page.height - 40;
    doc.rect(0, footerY-10, doc.page.width, 50).fill('#f5f5f5');
    doc.fontSize(8).fillColor('#888888').font('Helvetica')
       .text('This document is computer generated and is valid without signature if submitted electronically via OCEMS Platform.', 50, footerY, { align:'center', width: doc.page.width-100 });
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}  |  OCEMS Platform v2`, 50, footerY+12, { align:'center', width: doc.page.width-100 });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 404 ────────────────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

/* ── Start ──────────────────────────────────────────────────────────────── */
(async () => {
  console.log('\n  ⧗ Initialising OCEMS database…');
  db = await initDb();

  if (require.main === module) {
    app.listen(PORT, () => {
      console.log('\n  ╔══════════════════════════════════════════╗');
      console.log('  ║   OCEMS Dashboard API Server  v2         ║');
      console.log(`  ║   http://localhost:${PORT}                  ║`);
      console.log('  ╚══════════════════════════════════════════╝\n');
    });
  }
})();

module.exports = app;
