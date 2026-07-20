/**
 * home.js — Dashboard overview view
 */
import { mk, SIG_COL, SIG_LBL, RANK, toast } from '../utils.js';
import { fetchKpis, fetchSites, fetchAlerts } from '../api.js';
import { navigate, getState, setState } from '../app.js';

let MAP_OBJ = null;
const CHARTS = {};

export async function vHome() {
  const wrap = mk('div');

  // KPI skeleton
  const kg = mk('div', 'kpis');
  for (let i = 0; i < 6; i++) {
    const kp = mk('div', 'kpi');
    kp.innerHTML = `<div class="kpi-bar"></div><div class="kpi-lbl">Loading…</div><div class="kpi-val">—</div>`;
    kg.append(kp);
  }
  wrap.append(kg);

  // Charts row placeholder
  const cr = mk('div', 'two-col');
  const p1 = mk('div', 'card');
  p1.innerHTML = `<div class="card-h"><h3>Compliance Status</h3><span class="hint">All sites</span></div>
    <div class="card-b"><div class="cw ch-md"><canvas id="chStatus"></canvas></div>
    <div class="legend" style="margin-top:14px;justify-content:center">
      <span><i class="ld" style="background:var(--green)"></i>Compliant</span>
      <span><i class="ld" style="background:var(--yellow)"></i>Warning</span>
      <span><i class="ld" style="background:var(--red)"></i>Exceedance</span>
      <span><i class="ld" style="background:var(--grey)"></i>Offline</span>
    </div></div>`;
  const p2 = mk('div', 'card');
  p2.innerHTML = `<div class="card-h"><h3>Exceedances by Parameter</h3><span class="hint">Active flags</span></div>
    <div class="card-b"><div class="cw ch-md"><canvas id="chParam"></canvas></div></div>`;
  cr.append(p1, p2);
  wrap.append(cr);

  // Map card
  const mp = mk('div', 'card'); mp.style.marginBottom = '20px';
  mp.innerHTML = `<div class="card-h"><h3>Site Locations</h3>
    <div class="legend">
      <span><i class="ld" style="background:var(--green)"></i>Compliant</span>
      <span><i class="ld" style="background:var(--yellow)"></i>Warning</span>
      <span><i class="ld" style="background:var(--red)"></i>Exceedance</span>
      <span><i class="ld" style="background:var(--grey)"></i>Offline</span>
    </div></div><div id="siteMap"></div>`;
  wrap.append(mp);

  // Site cards panel
  const panel = mk('div', 'card');
  const ph    = mk('div', 'card-h');
  ph.innerHTML = '<h3>All Sites</h3>';
  const chips = mk('div', 'chips');
  let   filter = getState().FILTER || 'all';
  let   q      = getState().Q || '';

  [['all','All',null],['green','Compliant','#10b981'],['yellow','Warning','#f59e0b'],
   ['red','Exceedance','#ef4444'],['grey','Offline','#6b7280']].forEach(([f,l,col]) => {
    const ch = mk('button', 'chip' + (filter === f ? ' on' : ''));
    ch.innerHTML = (col ? `<span class="cdot" style="background:${col}"></span>` : '') + l;
    ch.onclick = () => {
      filter = f; setState({ FILTER: f });
      chips.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      ch.classList.add('on');
      if (window._homeSites) renderSiteCards(document.getElementById('cgrid'), window._homeSites, filter, q);
    };
    chips.append(ch);
  });

  const sr = mk('input', 'srch');
  sr.type = 'text'; sr.placeholder = 'Search site, code, sector…'; sr.value = q;
  sr.oninput = e => {
    q = e.target.value; setState({ Q: q });
    if (window._homeSites) renderSiteCards(document.getElementById('cgrid'), window._homeSites, filter, q);
  };
  chips.append(sr);
  ph.append(chips);
  panel.append(ph);

  const grid = mk('div', 'sg'); grid.id = 'cgrid';
  grid.innerHTML = '<div class="empty"><div class="ei">⏳</div>Loading sites…</div>';
  const pb = mk('div', 'card-b'); pb.append(grid);
  panel.append(pb); wrap.append(panel);

  // Fetch data and populate
  try {
    const [kpis, sites, alerts] = await Promise.all([fetchKpis(), fetchSites(), fetchAlerts()]);
    window._homeSites   = sites;
    window._homeAlerts  = alerts;

    // Populate KPIs
    kg.innerHTML = '';
    [
      { col:'var(--green)',  ic:'✅', lbl:'Compliant',   val:kpis.green,  desc:'Within all limits'  },
      { col:'var(--yellow)', ic:'⚠️', lbl:'Warning',     val:kpis.yellow, desc:'Attention required' },
      { col:'var(--red)',    ic:'🚨', lbl:'Exceedance',  val:kpis.exc,    desc:'Non-compliant sites' },
      { col:'var(--grey)',   ic:'📴', lbl:'Offline',     val:kpis.offline,desc:'No data received'   },
      { col:'var(--cyan)',   ic:'🏭', lbl:'Total Sites', val:kpis.total,  desc:'Connected OCEMS'    },
      { col:'var(--orange)', ic:'🔔', lbl:'Alerts 24h',  val:kpis.a24,   desc:'Auto-generated'     },
    ].forEach(({ col, ic, lbl, val, desc }) => {
      const kp = mk('div', 'kpi');
      kp.innerHTML = `<div class="kpi-bar" style="background:${col}"></div><div class="kpi-ic">${ic}</div>
        <div class="kpi-lbl">${lbl}</div><div class="kpi-val">${val}</div><div class="kpi-desc">${desc}</div>`;
      kg.append(kp);
    });

    // Update bell
    const bellN = document.getElementById('bellN');
    if (bellN) bellN.textContent = alerts.filter(a => Date.now() - a.triggered_at < 3600000).length;

    setTimeout(() => {
      drawStatus(kpis);
      drawParam(sites);
      initMap(sites);
      renderSiteCards(grid, sites, filter, q);
    }, 50);

  } catch (err) {
    console.error(err);
    kg.innerHTML = `<div class="error-box" style="grid-column:1/-1">⚠️ ${err.message}</div>`;
  }

  return wrap;
}

function drawStatus(kpis) {
  const cv = document.getElementById('chStatus');
  if (!cv || !window.Chart) return;
  if (CHARTS.st) { try { CHARTS.st.destroy(); } catch(e){} }
  CHARTS.st = new Chart(cv, {
    type: 'doughnut',
    data: {
      labels: ['Compliant','Warning','Exceedance','Offline'],
      datasets: [{ data:[kpis.green,kpis.yellow,kpis.exc,kpis.offline], backgroundColor:['#10b981','#f59e0b','#ef4444','#6b7280'], borderWidth:0, hoverOffset:8 }],
    },
    options: { responsive:true, maintainAspectRatio:false, cutout:'66%', plugins:{ legend:{ display:false } }, animation:{ duration:900 } },
  });
}

function drawParam(sites) {
  const cv = document.getElementById('chParam');
  if (!cv || !window.Chart) return;
  const counts = {};
  sites.forEach(s => (s.params||[]).forEach(p => { if(['yellow','red'].includes(p.sig)) counts[p.key] = (counts[p.key]||0)+1; }));
  const keys = Object.keys(counts), vals = keys.map(k => counts[k]);
  if (!keys.length) { cv.parentElement.innerHTML = '<div class="empty"><div class="ei">✅</div>No active exceedances.</div>'; return; }
  const pal = ['#ef4444','#f97316','#f59e0b','#a855f7','#06b6d4','#7c3aed'];
  if (CHARTS.pm) { try { CHARTS.pm.destroy(); } catch(e){} }
  CHARTS.pm = new Chart(cv, {
    type: 'bar',
    data: { labels:keys, datasets:[{ data:vals, backgroundColor:keys.map((_,i)=>pal[i%pal.length]), borderRadius:7, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
      scales: { y:{ beginAtZero:true, ticks:{ precision:0, color:'#7a8aaa' }, grid:{ color:'rgba(255,255,255,0.05)' } }, x:{ ticks:{ color:'#7a8aaa' }, grid:{ display:false } } } },
  });
}

export function initMap(sites) {
  const box = document.getElementById('siteMap');
  if (!box || !window.L) return;
  if (MAP_OBJ) { try { MAP_OBJ.remove(); } catch(e){} MAP_OBJ = null; }
  MAP_OBJ = L.map('siteMap', { scrollWheelZoom:false }).setView([22.5,78.5],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:18, attribution:'© OpenStreetMap' }).addTo(MAP_OBJ);
  sites.forEach(s => {
    const col = SIG_COL[s.sig] || '#6b7280';
    const mk2 = L.circleMarker([s.lat,s.lng], { radius:10, fillColor:col, color:'#fff', weight:2, fillOpacity:.9 });
    mk2.bindPopup(`<div><span class="mp-name">${s.name}</span>
      <div class="mp-row">📍 ${s.city}, ${s.state}</div>
      <div class="mp-row">🏭 ${s.sector} · ${s.id}</div>
      <span class="mp-badge" style="background:${col}">${SIG_LBL[s.sig]}</span></div>`);
    mk2.on('click', () => setTimeout(() => navigate('detail', s), 400));
    mk2.addTo(MAP_OBJ);
  });
  const pts = sites.filter(s=>s.lat&&s.lng).map(s=>[s.lat,s.lng]);
  if (pts.length) MAP_OBJ.fitBounds(pts, { padding:[40,40], maxZoom:8 });
  setTimeout(() => MAP_OBJ.invalidateSize(), 130);
}

function renderSiteCards(grid, sites, filter, q) {
  if (!grid) return;
  grid.innerHTML = '';
  let list = sites.filter(s => {
    if (filter !== 'all' && s.sig !== filter) return false;
    if (q) { const ql = q.toLowerCase(); return (s.name+s.id+s.sector+s.city).toLowerCase().includes(ql); }
    return true;
  }).sort((a,b) => (RANK[b.sig]||0)-(RANK[a.sig]||0));

  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">🔍</div>No sites match filter.</div>';
    return;
  }

  list.forEach(s => {
    const card = mk('div', 'sc');
    card.onclick = () => navigate('detail', s);
    const exc   = (s.params||[]).filter(p=>['yellow','red'].includes(p.sig)).length;
    const pills = (s.params||[]).slice(0,6).map(p =>
      `<div class="ppill${['yellow','red'].includes(p.sig)?' exc':''}"><span class="pn">${p.key}</span>${p.value}<span style="font-size:8.5px;opacity:.7">${p.unit}</span></div>`
    ).join('');
    card.innerHTML = `
      <div class="sc-top">
        <div><div class="sc-name">${s.name}</div><div class="sc-meta">${s.id} · ${s.sector} · ${s.spcb}</div></div>
        <div class="sig ${s.sig}"><span class="sd"></span>${SIG_LBL[s.sig]}</div>
      </div>
      <div class="sc-mini"><canvas id="mini_${s.id}"></canvas></div>
      <div class="sc-params">${(s.params||[]).length ? pills : '<span style="color:var(--text-3);font-size:11px">No data</span>'}</div>
      <div class="sc-foot"><span>📍 ${s.city}</span><span>${exc?`<b style="color:#f87171">${exc} flagged</b> · `:''} ${s.last_data}</span></div>`;
    grid.append(card);
  });

  setTimeout(() => list.forEach(s => {
    const cv = document.getElementById('mini_' + s.id);
    if (!cv || !(s.params||[]).length) return;
    const p   = s.params.find(x=>['yellow','red'].includes(x.sig)) || s.params[0];
    const col = SIG_COL[s.sig] || '#10b981';
    const hist = Array.isArray(p.history) ? p.history : JSON.parse(p.history||'[]');
    new Chart(cv, {
      type:'line',
      data: { labels:hist.map((_,i)=>i), datasets:[{ data:hist, borderColor:col, borderWidth:1.5, pointRadius:0, tension:.4, fill:true, backgroundColor:col+'18' }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{ enabled:false } },
        scales:{ x:{ display:false }, y:{ display:false } } },
    });
  }), 30);
}
