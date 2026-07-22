/**
 * app.js — Application router, state management and shell init
 * Entry point for the OCEMS dashboard frontend.
 */

import { tickClock, toast } from './utils.js';
import { fetchAlerts, createSite, deleteSite, fetchSites } from './api.js';
import { vHome }    from './views/home.js';
import { vSites }   from './views/sites.js';
import { vMap }     from './views/map.js';
import { vAlerts }  from './views/alerts.js';
import { vDetail }  from './views/detail.js';
import { vTrends }      from './views/trends.js';
import { vReports }     from './views/reports.js';
import { vAddIndustry }    from './views/addIndustry.js';
import { vSensorChannels } from './views/sensorChannels.js';
import { vSales }          from './views/sales.js';

let storedUser = null;
try { storedUser = JSON.parse(sessionStorage.getItem('ocems_user')); } catch (_) {}

const state = {
  VIEW:     'home',
  SELECTED: null,
  FILTER:   'all',
  Q:        '',
  USER:     storedUser,
};

export function getState()          { return { ...state }; }
export function setState(partial)   { Object.assign(state, partial); }

/* ── Add / Delete Industry Modal Handlers ─────────────────────────────── */
export function initModalParamRows() {
  const mRowsWrap = document.getElementById('mParamRows');
  if (!mRowsWrap) return;

  function addMParamRow(p = {}) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1.4fr 0.7fr 0.7fr 0.7fr 0.7fr 28px;gap:6px;align-items:center';

    row.innerHTML = `
      <input type="text" class="mp-key" placeholder="e.g. pH" value="${p.key || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:11px">
      <input type="text" class="mp-id" placeholder="Device Param ID" value="${p.param_id || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:10.5px;font-family:var(--mono);color:var(--cyan-l);border-color:rgba(6,182,212,.3)">
      <input type="text" class="mp-unit" placeholder="Unit" value="${p.unit || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:11px">
      <input type="number" step="0.1" class="mp-val" placeholder="Val" value="${p.value !== null && p.value !== undefined ? p.value : ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 4px;font-size:11px;font-family:var(--mono)">
      <input type="number" step="0.1" class="mp-lim" placeholder="Limit" value="${p.limit ?? 100}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 4px;font-size:11px;font-family:var(--mono)">
      <input type="number" step="0.1" class="mp-warn" placeholder="Warn" value="${p.warn ?? 80}" style="width:100%;min-width:0;box-sizing:border-box;padding:4px 4px;font-size:11px;font-family:var(--mono)">
      <button type="button" class="btn-del-row" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:4px;color:#f87171;cursor:pointer;font-size:12px;padding:4px 6px;line-height:1" title="Remove">✕</button>
    `;

    row.querySelector('.btn-del-row').onclick = () => row.remove();
    mRowsWrap.append(row);
  }

  const M_WATER_PRESET = [
    { key: 'pH',        param_id: 'DEV-WATER-pH-CH1',   unit: '',      limit: 9.5,  warn: 9.0, min: 6.5,  value: 7.4 },
    { key: 'BOD',       param_id: 'DEV-WATER-BOD-CH2',  unit: 'mg/L',  limit: 30,   warn: 24,  min: null, value: 18.5 },
    { key: 'COD',       param_id: 'DEV-WATER-COD-CH3',  unit: 'mg/L',  limit: 250,  warn: 200, min: null, value: 110.0 },
    { key: 'TSS',       param_id: 'DEV-WATER-TSS-CH4',  unit: 'mg/L',  limit: 100,  warn: 80,  min: null, value: 42.0 },
  ];

  const M_STACK_PRESET = [
    { key: 'PM₁₀', param_id: 'DEV-STACK-PM10-CH1', unit: 'mg/Nm³', limit: 150, warn: 120, min: null, value: 68.0 },
    { key: 'SO₂',   param_id: 'DEV-STACK-SO2-CH2',  unit: 'mg/Nm³', limit: 200, warn: 160, min: null, value: 92.0 },
    { key: 'NOₓ',   param_id: 'DEV-STACK-NOX-CH3',  unit: 'mg/Nm³', limit: 250, warn: 200, min: null, value: 115.0 },
    { key: 'CO',    param_id: 'DEV-STACK-CO-CH4',   unit: 'mg/Nm³', limit: 500, warn: 400, min: null, value: 140.0 },
  ];

  function loadMPreset(preset) {
    mRowsWrap.innerHTML = '';
    preset.forEach(p => addMParamRow(p));
  }

  loadMPreset(M_WATER_PRESET);

  const btnWater = document.getElementById('mBtnPresetWater');
  const btnStack = document.getElementById('mBtnPresetStack');
  const btnAdd   = document.getElementById('mBtnAddRow');

  if (btnWater) btnWater.onclick = () => loadMPreset(M_WATER_PRESET);
  if (btnStack) btnStack.onclick = () => loadMPreset(M_STACK_PRESET);
  if (btnAdd)   btnAdd.onclick   = () => addMParamRow();
}

export function openAddSiteModal() {
  navigate('add-industry');
}

export function closeAddSiteModal() {
  const modal = document.getElementById('addSiteModal');
  if (modal) modal.classList.remove('show');
}

export async function submitAddSite(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitSite');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  try {
    const mRowsWrap = document.getElementById('mParamRows');
    const params = [];

    if (mRowsWrap) {
      mRowsWrap.querySelectorAll('div').forEach(r => {
        const key = r.querySelector('.mp-key')?.value?.trim();
        if (!key) return;
        const valStr = r.querySelector('.mp-val')?.value;
        params.push({
          key,
          param_id:  r.querySelector('.mp-id')?.value?.trim() || '',
          unit:      r.querySelector('.mp-unit')?.value?.trim() || '',
          value:     (valStr !== undefined && valStr !== '') ? parseFloat(valStr) : null,
          limit_val: parseFloat(r.querySelector('.mp-lim')?.value || '100'),
          warn_val:  parseFloat(r.querySelector('.mp-warn')?.value || '80'),
        });
      });
    }

    const data = {
      name:          document.getElementById('sName').value.trim(),
      sector:        document.getElementById('sSector').value,
      cat:           document.getElementById('sCategory').value,
      city:          document.getElementById('sCity').value.trim(),
      state:         document.getElementById('sState').value.trim(),
      spcb:          document.getElementById('sSpcb').value.trim(),
      phone:         document.getElementById('sPhone').value.trim(),
      stacks:        parseInt(document.getElementById('sStacks').value || '1', 10),
      etp:           parseInt(document.getElementById('sEtp').value || '0', 10),
      lat:           parseFloat(document.getElementById('sLat').value || '19.076'),
      lng:           parseFloat(document.getElementById('sLng').value || '72.877'),
      user_email:    document.getElementById('sUserEmail')?.value?.trim() || '',
      user_password: document.getElementById('sUserPassword')?.value?.trim() || '',
      params,
    };

    const newSite = await createSite(data);
    closeAddSiteModal();
    document.getElementById('addSiteForm').reset();
    toast('✅ Industry Added', `${newSite.name} (${newSite.id}) created with ${params.length} Device Parameter IDs.`, 'success');
    navigate('sites');
  } catch (err) {
    toast('⚠️ Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '➕ Add Industry';
  }
}

export async function deleteSiteFn(siteId, siteName) {
  if (!confirm(`Are you sure you want to delete industry "${siteName}" (${siteId})?\n\nThis will also delete associated parameters and alerts.`)) {
    return;
  }
  try {
    await deleteSite(siteId);
    toast('🗑️ Industry Deleted', `${siteName} (${siteId}) was deleted successfully.`, 'success');
    navigate('sites');
  } catch (err) {
    toast('⚠️ Error', err.message, 'error');
  }
}

export async function clearAllSitesFn() {
  if (!confirm('Are you sure you want to remove ALL industries from your Vercel platform?\n\nThis action will delete all registered plants, sensor parameters, telemetry history, and alerts.')) {
    return;
  }
  try {
    const { clearAllSites } = await import('./api.js');
    await clearAllSites();
    toast('🗑️ Industries Cleared', 'All industries have been removed from the platform.', 'success');
    navigate('sites');
  } catch (err) {
    toast('⚠️ Error', err.message, 'error');
  }
}

window.openAddSiteModal  = openAddSiteModal;
window.closeAddSiteModal = closeAddSiteModal;
window.submitAddSite     = submitAddSite;
window.deleteSiteFn      = deleteSiteFn;
window.clearAllSitesFn   = clearAllSitesFn;
window.openSb  = openSb;
window.closeSb = closeSb;
window.toggleTheme = () => document.body.classList.toggle('lm');
window.navigate    = navigate;

/* ── Navigation ────────────────────────────────────────────────────────── */
const NAV = [
  { v:'home',         ic:'📊', l:'Dashboard'       },
  { v:'sites',        ic:'🏭', l:'Sites'           },
  { v:'add-industry', ic:'➕', l:'Add Industry', adminOnly: true },
  { v:'sensors',      ic:'🧪', l:'Sensor Channels' },
  { v:'map',          ic:'🗺️', l:'Map View'       },
  { v:'alerts',       ic:'🔔', l:'Alert Log'       },
  { v:'sales',        ic:'💰', l:'Sales & Payments' },
  { sep:'Analysis' },
  { v:'trends',       ic:'📈', l:'Trend Analysis'  },
  { v:'reports',      ic:'📥', l:'Reports'         },
];

const TITLES = {
  home:           ['Dashboard',       'All connected sites · live status'],
  sites:          ['Sites',           'Connected OCEMS sites'],
  'add-industry': ['Add Industry',    'Add plant & configure analyzer parameters'],
  sensors:        ['Sensor Channels', 'Hardware channel mappings & thresholds'],
  map:            ['Map View',        'Geographic status overview'],
  alerts:         ['Alert Log',       'CPCB automated grading'],
  sales:          ['Sales & Payments', 'Client contracts, AMC/CMC balances & collections'],
  detail:         ['Site Detail',     ''],
  trends:         ['Trend Analysis',  'Historical parameter trends'],
  reports:        ['Reports',         'Generate & download data'],
};

export function navigate(view, selected) {
  state.VIEW = view;
  if (selected !== undefined) state.SELECTED = selected;
  render();
  closeSb();
}

/* ── Shell ─────────────────────────────────────────────────────────────── */
function buildNav() {
  const nav = document.getElementById('sbNav');
  nav.innerHTML = '';
  const isAdmin = (state.USER?.role === 'admin') || (window._ocemsUser?.role === 'admin');

  NAV.forEach(item => {
    if (item.adminOnly && !isAdmin) return;
    if (item.sep) {
      const s = document.createElement('div');
      s.className = 'sb-sec';
      s.textContent = item.sep;
      nav.append(s);
      return;
    }
    const d = document.createElement('div');
    d.className = 'sb-item' + (state.VIEW === item.v ? ' on' : '');
    d.dataset.v = item.v;
    d.innerHTML = `<span class="ic">${item.ic}</span>${item.l}`;
    d.onclick = () => navigate(item.v);
    nav.append(d);
  });
}

function updNav() {
  document.querySelectorAll('.sb-item').forEach(el =>
    el.classList.toggle('on', el.dataset.v === state.VIEW)
  );
}

export function openSb()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); }
export function closeSb() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

window.openSb  = openSb;
window.closeSb = closeSb;
window.toggleTheme = () => document.body.classList.toggle('lm');
window.navigate    = navigate;

/* ── Render ────────────────────────────────────────────────────────────── */
async function render() {
  const [title, sub] = state.VIEW === 'detail' && state.SELECTED
    ? [state.SELECTED.name, state.SELECTED.id + ' · ' + state.SELECTED.sector]
    : (TITLES[state.VIEW] || ['—', '']);

  document.getElementById('tbTitle').textContent = title;
  document.getElementById('tbSub').textContent   = sub;
  updNav();

  const content = document.getElementById('content');
  content.innerHTML = '';

  const views = { home:vHome, sites:vSites, 'add-industry':vAddIndustry, sensors:vSensorChannels, map:vMap, alerts:vAlerts, detail:vDetail, trends:vTrends, reports:vReports, sales:vSales };
  const fn    = views[state.VIEW];
  if (!fn) return;

  const el = await fn();
  if (el) {
    el.classList.add('page-in');
    content.append(el);
  }
}

/* ── Live Alert Simulation ─────────────────────────────────────────────── */
async function liveAlertTick() {
  try {
    const alerts = await fetchAlerts();
    const flagged = alerts.filter(a => ['red','yellow'].includes(a.sig));
    if (!flagged.length) return;
    const a    = flagged[Math.floor(Math.random()*flagged.length)];
    const type = a.sig === 'red' ? 'crit' : 'warn';
    toast(
      `${a.sig==='red'?'🚨':'⚠️'} Alert: ${a.site_name.split(' ')[0]}`,
      `${a.param} = ${a.value}${a.unit} (Limit: ${a.limit_val})`,
      type
    );
    const n = document.getElementById('bellN');
    if (n) n.textContent = parseInt(n.textContent||'0') + 1;
  } catch(_) {}
}

/* ── Init ──────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  try {
    const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : 'http://localhost:3001';
    const userRes = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
    const userJson = await userRes.json();
    if (userJson.success) currentUser = userJson.data;
  } catch(_) {}

  if (!currentUser) {
    try {
      const stored = sessionStorage.getItem('ocems_user');
      if (stored) currentUser = JSON.parse(stored);
    } catch (_) {}
  }

  if (currentUser) {
    setState({ USER: currentUser });
    window._ocemsUser = currentUser;
  }

  buildNav();
  render();
  initModalParamRows();
  tickClock();
  setInterval(tickClock, 1000);

  // Bell count
  try {
    const alerts = await fetchAlerts();
    const r1h    = alerts.filter(a => Date.now() - a.triggered_at < 3600000).length;
    const bellN  = document.getElementById('bellN');
    if (bellN) bellN.textContent = r1h;
    const siteCount = document.getElementById('siteCountLbl');
    if (siteCount) {
      const { fetchSites } = await import('./api.js');
      const sites = await fetchSites();
      siteCount.textContent = sites.length;
    }
  } catch(_) {}

  setTimeout(() => {
    toast('🌿 AirWatch Online', 'Monitoring OCEMS industrial sites in real-time.', 'info');
  }, 1100);

  setTimeout(() => {
    liveAlertTick();
    setInterval(liveAlertTick, 22000);
  }, 7000);
});
