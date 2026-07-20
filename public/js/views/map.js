/**
 * map.js — Full-page interactive map view
 */
import { mk, SIG_COL, SIG_LBL } from '../utils.js';
import { fetchSites, fetchKpis } from '../api.js';
import { navigate } from '../app.js';

let MAP_OBJ = null;

export async function vMap() {
  const wrap = mk('div');

  // Map card
  const mp = mk('div', 'card'); mp.style.marginBottom = '20px';
  mp.innerHTML = `<div class="card-h"><h3>Site Map</h3>
    <div class="legend">
      <span><i class="ld" style="background:var(--green)"></i>Compliant</span>
      <span><i class="ld" style="background:var(--yellow)"></i>Warning</span>
      <span><i class="ld" style="background:var(--red)"></i>Exceedance</span>
      <span><i class="ld" style="background:var(--grey)"></i>Offline</span>
    </div></div><div id="siteMap" style="height:520px"></div>`;
  wrap.append(mp);

  // KPI row skeleton
  const kg = mk('div', 'kpis');
  for(let i=0;i<5;i++){
    const kp = mk('div','kpi'); kp.innerHTML=`<div class="kpi-bar"></div><div class="kpi-lbl">…</div><div class="kpi-val">—</div>`;
    kg.append(kp);
  }
  wrap.append(kg);

  try {
    const [sites, kpis] = await Promise.all([fetchSites(), fetchKpis()]);

    // Fill KPIs
    kg.innerHTML = '';
    [
      { lbl:'Total Sites', val:kpis.total,   col:'var(--purple)' },
      { lbl:'Compliant',   val:kpis.green,   col:'var(--green)'  },
      { lbl:'Warning',     val:kpis.yellow,  col:'var(--yellow)' },
      { lbl:'Exceedance',  val:kpis.exc,     col:'var(--red)'    },
      { lbl:'Offline',     val:kpis.offline, col:'var(--grey)'   },
    ].forEach(({ lbl, val, col }) => {
      const kp = mk('div','kpi');
      kp.innerHTML=`<div class="kpi-bar" style="background:${col}"></div><div class="kpi-lbl">${lbl}</div><div class="kpi-val">${val}</div>`;
      kg.append(kp);
    });

    setTimeout(() => initMap(sites), 50);
  } catch(err) {
    kg.innerHTML = `<div class="error-box" style="grid-column:1/-1">⚠️ ${err.message}</div>`;
  }

  return wrap;
}

function initMap(sites) {
  const box = document.getElementById('siteMap');
  if (!box || !window.L) return;
  if (MAP_OBJ) { try { MAP_OBJ.remove(); } catch(e){} MAP_OBJ = null; }
  MAP_OBJ = L.map('siteMap', { scrollWheelZoom:false }).setView([22.5,78.5],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:18, attribution:'© OpenStreetMap' }).addTo(MAP_OBJ);
  sites.forEach(s => {
    const col = SIG_COL[s.sig]||'#6b7280';
    const mk2 = L.circleMarker([s.lat,s.lng], { radius:10, fillColor:col, color:'#fff', weight:2, fillOpacity:.9 });
    mk2.bindPopup(`<div><span class="mp-name">${s.name}</span>
      <div class="mp-row">📍 ${s.city}, ${s.state}</div>
      <div class="mp-row">🏭 ${s.sector} · ${s.id}</div>
      <span class="mp-badge" style="background:${col}">${SIG_LBL[s.sig]}</span></div>`);
    mk2.on('click', () => setTimeout(() => navigate('detail', s), 400));
    mk2.addTo(MAP_OBJ);
  });
  const pts = sites.filter(s=>s.lat&&s.lng).map(s=>[s.lat,s.lng]);
  if(pts.length) MAP_OBJ.fitBounds(pts, { padding:[40,40], maxZoom:8 });
  setTimeout(() => MAP_OBJ.invalidateSize(), 130);
}
