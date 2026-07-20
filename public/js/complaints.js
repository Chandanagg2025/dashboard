/**
 * complaints.js — Complaint management SPA controller
 * Handles: auth guard, complaint list/detail, raise form, assign, service report, PDF download
 */

const API  = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : 'http://localhost:3001';
let user   = null;
let view   = 'list';           // 'list' | 'detail'
let activeComplaintId = null;
let assignComplaintId = null;
let reportComplaintId = null;
let allComplaints     = [];

/* ─── Auth helpers ──────────────────────────────────────────────────────── */
async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { credentials:'include' });
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}
async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}
async function apiPatch(path, body) {
  const r = await fetch(`${API}${path}`, { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}

/* ─── UI helpers ──────────────────────────────────────────────────────── */
function toast(title, msg, type='info') {
  const wrap = document.getElementById('toasts');
  const t    = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div><b style="font-size:12.5px">${title}</b>${msg?`<div style="font-size:11.5px;color:var(--text-3);margin-top:2px">${msg}</div>`:''}</div><span class="t-close" onclick="this.parentElement.remove()">✕</span>`;
  wrap.append(t);
  setTimeout(()=>{ t.style.animation='slideOut .3s var(--ease) forwards'; setTimeout(()=>t.remove(),320); }, 5000);
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function statusBadge(s)   { return `<span class="badge ${s}">${s.replace('_',' ')}</span>`; }
function priorityBadge(p) { return `<span class="badge ${p}">${p}</span>`; }

function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
window.closeModal = closeModal;

window.openSidebar  = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); };
window.closeSidebar = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); };

/* ─── Navigation ────────────────────────────────────────────────────────── */
const NAV_ITEMS = {
  admin:    [{ v:'list', ic:'📋', l:'All Complaints'}, {v:'kpis',ic:'📊',l:'Overview'}],
  engineer: [{ v:'list', ic:'📋', l:'My Assignments'}, {v:'resolved',ic:'✅',l:'Resolved'}],
  industry: [{ v:'list', ic:'📋', l:'My Complaints'}, {v:'raise',ic:'➕',l:'Raise Complaint'}],
};

function buildNav() {
  const nav = document.getElementById('sbNav');
  nav.innerHTML = '';
  const items = NAV_ITEMS[user.role] || [];
  items.forEach(item => {
    const d = document.createElement('div');
    d.className = 'sb-item' + (view===item.v?' on':'');
    d.dataset.v = item.v;
    d.innerHTML = `<span class="ic">${item.ic}</span>${item.l}`;
    d.onclick = () => navigate(item.v);
    nav.append(d);
  });
}
function updNav() {
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.toggle('on',el.dataset.v===view));
}

window.navigate = function(v, id) {
  view = v;
  if (id !== undefined) activeComplaintId = id;
  if (v === 'home') { window.location.href='index.html'; return; }
  if (v === 'raise') { openRaiseModal(); view='list'; return; }
  updNav();
  render();
  closeSidebar();
};

/* ─── Main render loop ───────────────────────────────────────────────────── */
async function render() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    if (view === 'detail' && activeComplaintId) {
      await renderDetail(content, activeComplaintId);
    } else if (view === 'kpis') {
      await renderKpis(content);
    } else if (view === 'resolved') {
      await renderList(content, true);
    } else {
      await renderList(content, false);
    }
  } catch(err) {
    content.innerHTML = `<div class="error-box">⚠️ ${err.message}</div>`;
  }
}

/* ─── LIST VIEW ─────────────────────────────────────────────────────────── */
async function renderList(container, resolvedOnly=false) {
  allComplaints = await apiGet('/api/complaints');
  const list = resolvedOnly
    ? allComplaints.filter(c=>['resolved','closed'].includes(c.status))
    : allComplaints.filter(c=>!['resolved','closed'].includes(c.status));

  const t = document.getElementById('tbTitle');
  const s = document.getElementById('tbSub');
  if (resolvedOnly) { t.textContent='Resolved'; s.textContent='Completed complaints'; }
  else {
    t.textContent = user.role==='admin' ? 'All Complaints' : user.role==='engineer' ? 'My Assignments' : 'My Complaints';
    s.textContent = `${list.length} ${resolvedOnly?'resolved':'active'} complaint${list.length!==1?'s':''}`;
  }

  const wrap = document.createElement('div');
  wrap.className = 'page-in';

  // Live Plant Monitoring Panel for Industry accounts
  if (user.role === 'industry' && user.site_id && !resolvedOnly) {
    try {
      const site = await apiGet(`/api/sites/${user.site_id}`);
      const mCard = document.createElement('div');
      mCard.className = 'card';
      mCard.style.marginBottom = '18px';
      
      const mHead = document.createElement('div');
      mHead.className = 'card-h';
      mHead.innerHTML = `<h3>🏭 ${site.name} — Live Plant Monitoring</h3>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-3)">📍 ${site.city}, ${site.state}</span>
          <span class="badge ${site.sig}">${site.sig.toUpperCase()}</span>
        </div>`;
      mCard.append(mHead);

      const mBody = document.createElement('div');
      mBody.className = 'card-b';
      let paramGrid = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">';
      (site.params || []).forEach(p => {
        const col = p.sig === 'red' ? '#ef4444' : p.sig === 'yellow' ? '#f59e0b' : p.sig === 'grey' ? '#6b7280' : '#10b981';
        paramGrid += `
          <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:8px 10px;position:relative">
            <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase">${p.key} <span style="color:var(--cyan-l);font-weight:400;font-family:var(--mono);font-size:9.5px">(${p.param_id||''})</span></div>
            <div style="font-size:16px;font-weight:800;color:${col};font-family:var(--mono);margin:3px 0">${p.value ?? '—'} <span style="font-size:10px;font-weight:400;color:var(--text-3)">${p.unit}</span></div>
            <div style="font-size:9.5px;color:var(--text-3)">Limit: ${p.min_val!=null?p.min_val+'–'+p.limit_val:'≤ '+p.limit_val}${p.unit?' '+p.unit:''}</div>
          </div>`;
      });
      paramGrid += '</div>';
      mBody.innerHTML = paramGrid;
      mCard.append(mBody);
      wrap.append(mCard);
    } catch(_) {}
  }

  // Action bar
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center';
  if (user.role==='industry') {
    const btn = document.createElement('button');
    btn.className='btn btn-p'; btn.innerHTML='➕ Raise Complaint'; btn.onclick=openRaiseModal;
    bar.append(btn);
  }
  if (user.role==='admin') {
    const btn = document.createElement('button');
    btn.className='btn btn-g btn-sm'; btn.innerHTML='📊 View Overview'; btn.onclick=()=>navigate('kpis');
    bar.append(btn);
  }
  wrap.append(bar);

  // Table card
  const card = document.createElement('div');
  card.className = 'card';
  const ch = document.createElement('div');
  ch.className='card-h'; ch.innerHTML=`<h3>${resolvedOnly?'Resolved':'Active'} Complaints</h3><span class="hint">${list.length} record${list.length!==1?'s':''}</span>`;
  card.append(ch);

  if (!list.length) {
    card.innerHTML += '<div class="empty"><div class="ei">📋</div>' + (user.role==='industry'?'No complaints raised yet. Click "Raise Complaint" to get started.':'No complaints to display.') + '</div>';
  } else {
    const w = document.createElement('div'); w.className='tbl-w';
    const tbl = document.createElement('table'); tbl.className='tbl';
    tbl.innerHTML=`<thead><tr>
      <th>#</th><th>Title</th>
      ${user.role==='admin'?'<th>Site</th><th>Raised By</th>':''}
      ${user.role==='engineer'?'<th>Site</th>':''}
      <th>Priority</th><th>Status</th>
      ${user.role==='admin'?'<th>Engineer</th>':''}
      <th>Raised</th><th></th>
    </tr></thead>`;
    const tb = document.createElement('tbody');
    list.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:var(--mono);color:var(--cyan-l);font-size:11px">C-${String(c.id).padStart(4,'0')}</td>
        <td><b style="color:var(--text-1);font-size:13px">${c.title}</b></td>
        ${user.role==='admin'?`<td>${c.site_name||c.site_id}</td><td style="font-size:11.5px">${c.raiser_name||'—'}</td>`:''}
        ${user.role==='engineer'?`<td>${c.site_name||c.site_id}</td>`:''}
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        ${user.role==='admin'?`<td style="font-size:11.5px;color:var(--text-2)">${c.assigned_engineer||'<span style="color:var(--text-3)">Unassigned</span>'}</td>`:''}
        <td style="font-size:11.5px;color:var(--text-3)">${fmtDate(c.created_at)}</td>
        <td><button class="btn btn-g btn-sm" onclick="navigate('detail',${c.id})">View →</button></td>`;
      tb.append(tr);
    });
    tbl.append(tb); w.append(tbl); card.append(w);
  }
  wrap.append(card);
  container.innerHTML=''; container.append(wrap);
}

/* ─── DETAIL VIEW ───────────────────────────────────────────────────────── */
async function renderDetail(container, cid) {
  const c = await apiGet(`/api/complaints/${cid}`);
  document.getElementById('tbTitle').textContent = `Complaint C-${String(c.id).padStart(4,'0')}`;
  document.getElementById('tbSub').textContent = c.title;

  const wrap = document.createElement('div'); wrap.className='page-in';

  // Back button
  const back = document.createElement('div');
  back.style.cssText='display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--purple-l);font-weight:600;margin-bottom:16px;cursor:pointer';
  back.innerHTML='← Back'; back.onclick=()=>navigate('list'); wrap.append(back);

  // Header card
  const hCard = document.createElement('div'); hCard.className='card'; hCard.style.marginBottom='18px';
  const hHead = document.createElement('div'); hHead.className='card-h';
  hHead.innerHTML=`<h3>${c.title}</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${statusBadge(c.status)} ${priorityBadge(c.priority)}</div>`;

  // Admin actions
  if (user.role==='admin') {
    const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:8px;margin-left:auto;flex-wrap:wrap';
    if (c.status!=='resolved'&&c.status!=='closed') {
      const ab=document.createElement('button'); ab.className='btn btn-c btn-sm'; ab.innerHTML='👷 Assign Engineer';
      ab.onclick=()=>openAssignModal(c.id); btns.append(ab);
    }
    if (c.status!=='closed') {
      const cb=document.createElement('button'); cb.className='btn btn-g btn-sm'; cb.innerHTML='🔒 Close';
      cb.onclick=()=>changeStatus(c.id,'closed'); btns.append(cb);
    }
    hHead.append(btns);
  }
  // Engineer actions
  if (user.role==='engineer' && ['assigned','in_progress'].includes(c.status)) {
    const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:8px;margin-left:auto;flex-wrap:wrap';
    if (c.status==='assigned') {
      const sb=document.createElement('button'); sb.className='btn btn-c btn-sm'; sb.innerHTML='🔨 Start Work';
      sb.onclick=()=>changeStatus(c.id,'in_progress'); btns.append(sb);
    }
    const rb=document.createElement('button'); rb.className='btn btn-p btn-sm'; rb.innerHTML='📋 Write Service Report';
    rb.onclick=()=>openReportModal(c.id); btns.append(rb);
    hHead.append(btns);
  }

  hCard.append(hHead);

  const hBody=document.createElement('div'); hBody.className='card-b';
  hBody.innerHTML=`
    <div class="det-meta">
      <div class="dm"><span class="dm-lbl">Complaint #</span><span class="dm-val" style="font-family:var(--mono);color:var(--cyan-l)">C-${String(c.id).padStart(4,'0')}</span></div>
      <div class="dm"><span class="dm-lbl">Site</span><span class="dm-val">${c.site?.name||c.site_id}</span></div>
      <div class="dm"><span class="dm-lbl">Raised By</span><span class="dm-val">${c.raiser?.name||'—'}</span></div>
      <div class="dm"><span class="dm-lbl">Assigned To</span><span class="dm-val">${c.engineer?.name||'<span style="color:var(--text-3)">Unassigned</span>'}</span></div>
      <div class="dm"><span class="dm-lbl">Created</span><span class="dm-val" style="font-size:12px">${fmtDate(c.created_at)}</span></div>
      <div class="dm"><span class="dm-lbl">Updated</span><span class="dm-val" style="font-size:12px">${fmtDate(c.updated_at)}</span></div>
    </div>
    <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:16px 18px;font-size:13.5px;color:var(--text-2);line-height:1.7;white-space:pre-wrap">${c.description}</div>`;
  hCard.append(hBody);
  wrap.append(hCard);

  // Service Report card (if exists)
  let report = null;
  try { report = await apiGet(`/api/reports/${cid}`); } catch(_){}

  if (report) {
    const rCard=document.createElement('div'); rCard.className='card'; rCard.style.marginBottom='18px';
    const rHead=document.createElement('div'); rHead.className='card-h';
    rHead.innerHTML=`<h3>📋 Service Report</h3><div style="display:flex;gap:8px;align-items:center"><span class="badge ${report.status}">${report.status}</span><a href="${API}/api/reports/${cid}/pdf" target="_blank" class="btn btn-pdf btn-sm" download>⬇️ Download PDF</a></div>`;
    rCard.append(rHead);
    const rBody=document.createElement('div'); rBody.className='card-b';
    rBody.innerHTML=`
      <div class="det-meta" style="margin-bottom:16px">
        <div class="dm"><span class="dm-lbl">Engineer</span><span class="dm-val">${report.engineer_name}</span></div>
        <div class="dm"><span class="dm-lbl">Visit Date</span><span class="dm-val">${report.visit_date}</span></div>
        <div class="dm"><span class="dm-lbl">Arrival</span><span class="dm-val">${report.arrival_time||'—'}</span></div>
        <div class="dm"><span class="dm-lbl">Departure</span><span class="dm-val">${report.departure_time||'—'}</span></div>
        ${report.next_visit_date?`<div class="dm"><span class="dm-lbl">Next Visit</span><span class="dm-val">${report.next_visit_date}</span></div>`:''}
      </div>
      ${rSection('Problem Found', report.problem_found)}
      ${rSection('Action Taken', report.action_taken)}
      ${report.parts_replaced?rSection('Parts Replaced', report.parts_replaced):''}
      ${report.recommendations?rSection('Recommendations', report.recommendations):''}
      ${report.engineer_remarks?rSection('Engineer Remarks', report.engineer_remarks):''}
      ${report.client_name?`<div style="margin-top:14px;font-size:12px;color:var(--text-3)">Acknowledged by: <b style="color:var(--text-2)">${report.client_name}${report.client_designation?' ('+report.client_designation+')':''}</b></div>`:''}`;
    rCard.append(rBody);
    wrap.append(rCard);
  } else if (user.role==='engineer' && ['in_progress','assigned'].includes(c.status)) {
    const nb=document.createElement('div');
    nb.style.cssText='margin-bottom:18px;padding:14px 18px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);border-radius:12px;display:flex;align-items:center;gap:12px;font-size:13px;color:var(--purple-l)';
    nb.innerHTML=`<span style="font-size:20px">📋</span><span>No service report yet. <b style="cursor:pointer;text-decoration:underline" onclick="openReportModal(${c.id})">Click here to write one.</b></span>`;
    wrap.append(nb);
  }

  // Activity feed
  const aCard=document.createElement('div'); aCard.className='card'; aCard.style.marginBottom='18px';
  const aHead=document.createElement('div'); aHead.className='card-h';
  aHead.innerHTML=`<h3>📌 Activity Log</h3><span class="hint">${(c.updates||[]).length} update${(c.updates||[]).length!==1?'s':''}</span>`;
  aCard.append(aHead);
  const aBody=document.createElement('div'); aBody.className='card-b fl activity';

  const ROLE_ICONS={admin:'🛡️',engineer:'🔧',industry:'🏭'};
  (c.updates||[]).forEach(u=>{
    const item=document.createElement('div'); item.className='act-item';
    item.innerHTML=`<div class="act-dot">${ROLE_ICONS[u.author_role]||'👤'}</div>
      <div class="act-body">
        <div><span class="act-author">${u.author_name}</span><span class="act-role">${u.author_role}</span></div>
        <div class="act-msg">${u.message}</div>
        <div class="act-time">${fmtDate(u.created_at)}</div>
      </div>`;
    aBody.append(item);
  });

  // Add comment form
  const addComment=document.createElement('div');
  addComment.style.cssText='padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:10px';
  addComment.innerHTML=`<input type="text" id="commentInput" placeholder="Add a comment or update…" style="flex:1;padding:9px 13px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.04);color:var(--text-1);font-size:13px;outline:none;font-family:var(--sans)" onkeydown="if(event.key==='Enter')addCommentFn(${c.id})">
    <button class="btn btn-p btn-sm" onclick="addCommentFn(${c.id})">Send</button>`;
  aBody.append(addComment);
  aCard.append(aBody);
  wrap.append(aCard);

  container.innerHTML=''; container.append(wrap);

  // Make download link use credentials (cookie)
  document.querySelectorAll('.btn-pdf').forEach(btn=>{
    btn.onclick = e => { e.preventDefault(); downloadPdf(cid); };
  });
}

function rSection(label, text) {
  return `<div style="margin-bottom:14px">
    <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${label}</div>
    <div style="font-size:13.5px;color:var(--text-2);line-height:1.65;white-space:pre-wrap;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:9px;padding:12px 14px">${text}</div>
  </div>`;
}

/* ─── KPI VIEW (Admin) ──────────────────────────────────────────────────── */
async function renderKpis(container) {
  document.getElementById('tbTitle').textContent='Overview';
  document.getElementById('tbSub').textContent='Complaint summary';
  const all = await apiGet('/api/complaints');
  const wrap = document.createElement('div'); wrap.className='page-in';
  const kg = document.createElement('div'); kg.className='kpis';
  const statuses = ['open','assigned','in_progress','resolved','closed'];
  const counts = {};
  statuses.forEach(s=>counts[s]=all.filter(c=>c.status===s).length);
  const ICONS={open:'📋',assigned:'👷',in_progress:'🔧',resolved:'✅',closed:'🔒'};
  const COLORS={open:'var(--grey)',assigned:'var(--indigo)',in_progress:'var(--yellow)',resolved:'var(--green)',closed:'var(--text-3)'};
  statuses.forEach(s=>{
    const kp=document.createElement('div'); kp.className='kpi';
    kp.innerHTML=`<div class="kpi-bar" style="background:${COLORS[s]}"></div>
      <div class="kpi-ic">${ICONS[s]}</div>
      <div class="kpi-lbl">${s.replace('_',' ')}</div>
      <div class="kpi-val">${counts[s]}</div>`;
    kg.append(kp);
  });
  const total=document.createElement('div'); total.className='kpi';
  total.innerHTML=`<div class="kpi-bar" style="background:var(--purple)"></div><div class="kpi-ic">📊</div><div class="kpi-lbl">Total</div><div class="kpi-val">${all.length}</div>`;
  kg.append(total);
  wrap.append(kg);

  // Priority breakdown
  const pc=document.createElement('div'); pc.className='card';
  pc.innerHTML=`<div class="card-h"><h3>Complaints by Priority</h3></div><div class="card-b fl">
    <table class="tbl"><thead><tr><th>Priority</th><th>Count</th></tr></thead><tbody>
    ${['critical','high','medium','low'].map(p=>`<tr><td>${priorityBadge(p)}</td><td style="font-family:var(--mono)">${all.filter(c=>c.priority===p).length}</td></tr>`).join('')}
    </tbody></table></div>`;
  wrap.append(pc);
  container.innerHTML=''; container.append(wrap);
}

/* ─── Raise complaint ────────────────────────────────────────────────────── */
function openRaiseModal() {
  document.getElementById('cSiteDisplay').value = user.site_id || '—';
  document.getElementById('cTitle').value='';
  document.getElementById('cDesc').value='';
  document.getElementById('raiseError').style.display='none';
  openModal('raiseModal');
}
window.openRaiseModal = openRaiseModal;

window.submitComplaint = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('raiseBtnSubmit');
  const errEl = document.getElementById('raiseError');
  errEl.style.display='none';
  btn.disabled=true; btn.textContent='Submitting…';
  try {
    await apiPost('/api/complaints', {
      title: document.getElementById('cTitle').value.trim(),
      description: document.getElementById('cDesc').value.trim(),
      priority: document.getElementById('cPriority').value,
    });
    closeModal('raiseModal');
    toast('✅ Complaint Raised','Your complaint has been submitted successfully.','success');
    navigate('list');
  } catch(err) {
    errEl.textContent=err.message; errEl.style.display='block';
  } finally { btn.disabled=false; btn.textContent='📤 Submit Complaint'; }
};

/* ─── Assign engineer ────────────────────────────────────────────────────── */
async function openAssignModal(cid) {
  assignComplaintId = cid;
  const sel = document.getElementById('assignSelect');
  sel.innerHTML='<option value="">Loading…</option>';
  openModal('assignModal');
  const engineers = await apiGet('/api/engineers');
  sel.innerHTML = engineers.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
}

window.confirmAssign = async function() {
  const eid  = parseInt(document.getElementById('assignSelect').value);
  const note = document.getElementById('assignNote').value.trim();
  if (!eid) { toast('⚠️','Please select an engineer','warn'); return; }
  try {
    await apiPatch(`/api/complaints/${assignComplaintId}`, { assigned_to:eid, message:note||'Engineer assigned.' });
    closeModal('assignModal');
    toast('✅ Assigned','Engineer has been assigned to this complaint.','success');
    navigate('detail', assignComplaintId);
  } catch(err) { toast('⚠️ Error',err.message,'error'); }
};

/* ─── Status change ─────────────────────────────────────────────────────── */
async function changeStatus(cid, status) {
  try {
    await apiPatch(`/api/complaints/${cid}`, { status, message:`Status changed to ${status}.` });
    toast('✅ Updated',`Complaint marked as ${status}.`,'success');
    navigate('detail', cid);
  } catch(err) { toast('⚠️ Error',err.message,'error'); }
}
window.changeStatus = changeStatus;

/* ─── Add comment ───────────────────────────────────────────────────────── */
window.addCommentFn = async function(cid) {
  const inp = document.getElementById('commentInput');
  const msg = inp?.value?.trim();
  if (!msg) return;
  try {
    await apiPost(`/api/complaints/${cid}/updates`, { message: msg });
    inp.value='';
    navigate('detail', cid);
  } catch(err) { toast('⚠️ Error',err.message,'error'); }
};

/* ─── Service report modal ──────────────────────────────────────────────── */
async function openReportModal(cid) {
  reportComplaintId = cid;
  // Try loading existing report
  let report = null;
  try { report = await apiGet(`/api/reports/${cid}`); } catch(_){}
  if (report) {
    document.getElementById('rVisitDate').value   = report.visit_date||'';
    document.getElementById('rArrival').value     = report.arrival_time||'';
    document.getElementById('rDeparture').value   = report.departure_time||'';
    document.getElementById('rNextVisit').value   = report.next_visit_date||'';
    document.getElementById('rProblem').value     = report.problem_found||'';
    document.getElementById('rAction').value      = report.action_taken||'';
    document.getElementById('rParts').value       = report.parts_replaced||'';
    document.getElementById('rRecommend').value   = report.recommendations||'';
    document.getElementById('rRemarks').value     = report.engineer_remarks||'';
    document.getElementById('rClientName').value  = report.client_name||'';
    document.getElementById('rClientDesig').value = report.client_designation||'';
  } else {
    document.getElementById('reportForm').reset();
    document.getElementById('rVisitDate').value = new Date().toISOString().slice(0,10);
  }
  document.getElementById('reportError').style.display='none';
  openModal('reportModal');
}
window.openReportModal = openReportModal;

window.saveReport = async function(submit) {
  const errEl = document.getElementById('reportError');
  errEl.style.display='none';
  const body = {
    visit_date:       document.getElementById('rVisitDate').value,
    arrival_time:     document.getElementById('rArrival').value,
    departure_time:   document.getElementById('rDeparture').value,
    next_visit_date:  document.getElementById('rNextVisit').value,
    problem_found:    document.getElementById('rProblem').value.trim(),
    action_taken:     document.getElementById('rAction').value.trim(),
    parts_replaced:   document.getElementById('rParts').value.trim(),
    recommendations:  document.getElementById('rRecommend').value.trim(),
    engineer_remarks: document.getElementById('rRemarks').value.trim(),
    client_name:      document.getElementById('rClientName').value.trim(),
    client_designation: document.getElementById('rClientDesig').value.trim(),
    submit,
  };
  try {
    await apiPost(`/api/reports/${reportComplaintId}`, body);
    closeModal('reportModal');
    toast(submit?'✅ Report Submitted':'💾 Draft Saved', submit?'Complaint resolved and PDF available.':'Report saved as draft.','success');
    navigate('detail', reportComplaintId);
  } catch(err) {
    errEl.textContent=err.message; errEl.style.display='block';
  }
};

/* ─── PDF Download ──────────────────────────────────────────────────────── */
async function downloadPdf(cid) {
  try {
    const res = await fetch(`${API}/api/reports/${cid}/pdf`, { credentials:'include' });
    if (!res.ok) { const j=await res.json(); throw new Error(j.error); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=`Service_Report_C${String(cid).padStart(4,'0')}.pdf`;
    a.click(); URL.revokeObjectURL(url);
    toast('⬇️ Download Started','PDF is being downloaded.','success');
  } catch(err) { toast('⚠️ Error',err.message,'error'); }
}
window.downloadPdf = downloadPdf;

/* ─── Init ──────────────────────────────────────────────────────────────── */
async function init() {
  // Auth check
  let userData = null;
  try {
    const stored = sessionStorage.getItem('ocems_user');
    if (stored) userData = JSON.parse(stored);
    userData = await apiGet('/api/auth/me');
    sessionStorage.setItem('ocems_user', JSON.stringify(userData));
  } catch(_) {
    window.location.href='login.html'; return;
  }
  user = userData;

  // Hide Dashboard button for Industry users
  if (user.role === 'industry') {
    const dashBtn = document.getElementById('btnDashNav');
    if (dashBtn) dashBtn.style.display = 'none';
  }

  // Populate sidebar user
  const ROLE_ICONS={admin:'🛡️',engineer:'🔧',industry:'🏭'};
  const av=document.getElementById('suAvatar');
  av.textContent=ROLE_ICONS[user.role]||'👤';
  av.className=`su-avatar ${user.role}`;
  document.getElementById('suName').textContent=user.name;
  document.getElementById('suRole').textContent=user.role.charAt(0).toUpperCase()+user.role.slice(1);
  document.getElementById('cSiteDisplay').value=user.site_id||'—';

  buildNav();
  await render();
}

window.logout = async function() {
  try { await fetch(`${API}/api/auth/logout`,{method:'POST',credentials:'include'}); } catch(_){}
  sessionStorage.removeItem('ocems_user');
  window.location.href='login.html';
};

init();
