/**
 * alerts.js — Alert log view
 */
import { mk, SIG_COL, SIG_LBL, fmtT } from '../utils.js';
import { fetchAlerts, fetchKpis, fetchSites } from '../api.js';
import { navigate } from '../app.js';

export async function vAlerts() {
  const wrap = mk('div');

  // KPI skeleton
  const kg = mk('div', 'kpis'); kg.style.marginBottom = '20px';
  for(let i=0;i<4;i++){
    const kp=mk('div','kpi'); kp.innerHTML=`<div class="kpi-bar"></div><div class="kpi-lbl">…</div><div class="kpi-val">—</div>`;
    kg.append(kp);
  }
  wrap.append(kg);

  // Panel
  const panel = mk('div', 'card');
  panel.innerHTML = `<div class="card-h"><h3>Alert Log</h3><span class="hint">Loading…</span></div>`;
  const body = mk('div', 'card-b fl');
  body.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading alerts…</span></div>';
  panel.append(body);
  wrap.append(panel);

  try {
    const [alerts, kpis, sites] = await Promise.all([fetchAlerts(), fetchKpis(), fetchSites()]);

    // Fill KPIs
    kg.innerHTML = '';
    [
      { col:'var(--red)',    ic:'🚨', lbl:'Critical', val:alerts.filter(a=>a.sig==='red').length,    desc:'Exceedance alerts' },
      { col:'var(--yellow)', ic:'⚠️', lbl:'Warning',  val:alerts.filter(a=>a.sig==='yellow').length, desc:'Warning alerts'    },
      { col:'var(--cyan)',   ic:'⏱️', lbl:'Last 24h', val:kpis.a24,                                  desc:'Recent triggers'  },
      { col:'var(--grey)',   ic:'📴', lbl:'Offline',  val:kpis.offline,                              desc:'No data sites'    },
    ].forEach(({ col, ic, lbl, val, desc }) => {
      const kp = mk('div','kpi');
      kp.innerHTML=`<div class="kpi-bar" style="background:${col}"></div><div class="kpi-ic">${ic}</div>
        <div class="kpi-lbl">${lbl}</div><div class="kpi-val">${val}</div><div class="kpi-desc">${desc}</div>`;
      kg.append(kp);
    });

    panel.querySelector('.card-h .hint').textContent = `${alerts.length} total alerts`;
    body.innerHTML = '';

    if (!alerts.length) {
      body.innerHTML = '<div class="empty"><div class="ei">✅</div>No alerts — all sites compliant.</div>';
    } else {
      alerts.slice(0,60).forEach(a => {
        const item = mk('div','al-item');
        const col  = SIG_COL[a.sig]||'#6b7280';
        item.innerHTML = `<div class="al-dot" style="background:${col}"></div>
          <div class="al-body"><div class="al-title">${a.site_name}</div><div class="al-detail">${a.msg} · ${a.site_id}</div></div>
          <div class="al-time">${fmtT(a.triggered_at)}</div>`;
        item.onclick = () => {
          const site = sites.find(s=>s.id===a.site_id);
          if (site) navigate('detail', site);
        };
        body.append(item);
      });
    }

  } catch(err) {
    body.innerHTML = `<div class="error-box">⚠️ ${err.message}</div>`;
  }

  return wrap;
}
