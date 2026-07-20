/**
 * detail.js — Individual site detail view
 */
import { mk, SIG_COL, SIG_LBL } from '../utils.js';
import { fetchSite } from '../api.js';
import { navigate, getState } from '../app.js';

const CHARTS = {};

export async function vDetail() {
  const s = getState().SELECTED;
  if (!s) return mk('div', 'empty', 'No site selected.');

  const wrap = mk('div');
  const back = mk('div', 'back-btn', '← Back to Dashboard');
  back.onclick = () => navigate('home');
  wrap.append(back);

  // Loading state
  const loadEl = mk('div', 'loading-state');
  loadEl.innerHTML = '<div class="spinner"></div><span>Loading site data…</span>';
  wrap.append(loadEl);

  try {
    // Fetch fresh data for this specific site
    const site = await fetchSite(s.id);

    loadEl.remove();

    // Header
    const storedRole = JSON.parse(sessionStorage.getItem('ocems_user') || '{}')?.role;
    const isAdmin = (getState().USER?.role === 'admin') || (window._ocemsUser?.role === 'admin') || (storedRole === 'admin');
    const head = mk('div', 'det-head');
    head.innerHTML = `<div>
      <div class="dh-name">${site.name}</div>
      <div class="dh-meta">
        <span>📍 ${site.city}, ${site.state}</span><span>🏭 ${site.sector}</span>
        <span>🔑 ${site.id}</span><span>📋 ${site.spcb}</span>
        <span>📞 ${site.phone}</span><span>${site.stacks} stack · ${site.etp} ETP</span>
      </div></div>`;

    const headActions = mk('div');
    headActions.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';

    const compBtn = mk('a', 'auth-btn', '📋 Site Complaints');
    compBtn.href = 'complaints.html';
    compBtn.style.cssText = 'padding:7px 14px;font-size:12px;text-decoration:none';
    headActions.append(compBtn);

    if (isAdmin) {
      const delBtn = mk('button', 'btn btn-danger btn-sm', '🗑️ Delete Industry');
      delBtn.onclick = () => {
        if (window.deleteSiteFn) window.deleteSiteFn(site.id, site.name);
      };
      headActions.append(delBtn);
    }

    const sigBadge = mk('div', `sig ${site.sig}`);
    sigBadge.style.cssText = 'font-size:12px;padding:8px 16px';
    sigBadge.innerHTML = `<span class="sd"></span>${SIG_LBL[site.sig]}`;
    headActions.append(sigBadge);

    head.append(headActions);
    wrap.append(head);

    if (!site.params || !site.params.length) {
      const off = mk('div','card');
      off.innerHTML = '<div class="empty"><div class="ei">📴</div><b>Site Offline</b><br>No data received. Please check OCEMS connection.</div>';
      wrap.append(off);
      return wrap;
    }

    // Gauges
    const gr = mk('div','gauges');
    site.params.forEach(p => {
      const col = SIG_COL[p.sig]||'#10b981';
      const pct = Math.min(100,(p.value/(p.limit_val*1.6))*100);
      const g   = mk('div','gauge');
      const pid = p.param_id ? `<span style="font-size:10px;font-family:var(--mono);color:var(--cyan-l);font-weight:400;margin-left:6px">(${p.param_id})</span>` : '';
      g.innerHTML = `<div class="g-p">${p.key}${pid}</div>
        <div class="g-v" style="color:${col}">${p.value}<span class="g-u">${p.unit}</span></div>
        <div class="g-lim">Limit: ${p.min_val!=null?p.min_val+'–'+p.limit_val:'≤ '+p.limit_val}${p.unit?' '+p.unit:''}</div>
        <div class="gbar"><i style="width:${pct.toFixed(0)}%;background:${col}"></i></div>
        <div class="g-st" style="color:${col}">${SIG_LBL[p.sig]}</div>`;
      gr.append(g);
    });
    wrap.append(gr);

    // Split Grid for Lower Part (Left: Trend Chart, Right: CPCB Grading Counters)
    const splitRow = mk('div');
    splitRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;margin-top:16px';

    // Trend chart (Left side)
    const tp = mk('div','card');
    tp.style.height = '100%';
    tp.innerHTML = `<div class="card-h" style="padding:12px 16px"><h3>15-min Averaged Trends</h3><span class="hint">Last 24 readings · live feed</span></div>
      <div class="card-b" style="padding:12px 16px"><div class="cw" style="height:250px"><canvas id="chTrend"></canvas></div></div>`;
    splitRow.append(tp);

    // CPCB Counters table (Right side)
    const cp = mk('div','card');
    cp.style.height = '100%';
    cp.innerHTML = `<div class="card-h" style="padding:12px 16px"><h3>CPCB Grading Counters</h3><span class="hint">Hardware sensor routing &amp; rolling values</span></div>`;
    const cw = mk('div','tbl-w'); const ct = mk('table','tbl');
    ct.style.fontSize = '12px';
    ct.innerHTML = `<thead><tr><th>Parameter</th><th>Param ID</th><th>Current</th><th>Limit</th><th>Exc Today</th><th>Status</th></tr></thead>`;
    const ctb = mk('tbody');
    site.params.forEach(p => {
      const tr  = mk('tr');
      const isE = ['yellow','red'].includes(p.sig);
      tr.innerHTML = `<td><b>${p.key}</b></td>
        <td class="mono" style="color:var(--cyan-l);font-size:10.5px">${p.param_id||'—'}</td>
        <td class="mono${isE?' exc-v':''}">${p.value ?? '—'} <span style="font-size:10px;color:var(--text-3)">${p.unit}</span></td>
        <td class="mono" style="font-size:11px">${p.min_val!=null?p.min_val+'–'+p.limit_val:'≤ '+p.limit_val}</td>
        <td class="mono" style="text-align:center">${p.y_today}</td>
        <td><span class="badge ${p.sig}">${SIG_LBL[p.sig]}</span></td>`;
      ctb.append(tr);
    });
    ct.append(ctb); cw.append(ct); cp.append(cw); splitRow.append(cp);

    wrap.append(splitRow);

    setTimeout(() => {
      const cv = document.getElementById('chTrend');
      if (!cv || !window.Chart) return;
      const pal  = ['#7c3aed','#06b6d4','#f97316','#f59e0b','#10b981','#ec4899','#ef4444'];
      const ds   = site.params.map((p,i) => {
        const hist = Array.isArray(p.history) ? p.history : JSON.parse(p.history||'[]');
        return { label:p.key+(p.unit?` (${p.unit})`:''), data:hist, borderColor:pal[i%pal.length], borderWidth:2, pointRadius:0, tension:.4, fill:false };
      });
      const lbls = site.params[0] ? (Array.isArray(site.params[0].history)?site.params[0].history:JSON.parse(site.params[0].history||'[]')).map((_,i)=>'-'+(23-i)*15+'m') : [];
      if (CHARTS.trend) { try{CHARTS.trend.destroy();}catch(e){} }
      CHARTS.trend = new Chart(cv, {
        type:'line', data:{ labels:lbls, datasets:ds },
        options: {
          responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
          plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 }, color:'#7a8aaa' } } },
          scales:{
            y:{ beginAtZero:true, grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#7a8aaa' } },
            x:{ grid:{ display:false }, ticks:{ maxTicksLimit:8, color:'#7a8aaa' } },
          },
        },
      });
    }, 50);

  } catch(err) {
    loadEl.remove();
    const errEl = mk('div','error-box');
    errEl.textContent = `⚠️ Failed to load site data: ${err.message}`;
    wrap.append(errEl);
  }

  return wrap;
}
