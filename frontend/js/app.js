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
    };

    const newSite = await createSite(data);
    closeAddSiteModal();
    document.getElementById('addSiteForm').reset();
    toast('✅ Industry Added', `${newSite.name} (${newSite.id}) has been added successfully.`, 'success');
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

window.openAddSiteModal  = openAddSiteModal;
window.closeAddSiteModal = closeAddSiteModal;
window.submitAddSite     = submitAddSite;
window.deleteSiteFn      = deleteSiteFn;
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

  const views = { home:vHome, sites:vSites, 'add-industry':vAddIndustry, sensors:vSensorChannels, map:vMap, alerts:vAlerts, detail:vDetail, trends:vTrends, reports:vReports };
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
  try {
    const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : 'http://localhost:3001';
    const userRes = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
    const userJson = await userRes.json();
    if (userJson.success) {
      setState({ USER: userJson.data });
      window._ocemsUser = userJson.data;
    }
  } catch(_) {}

  buildNav();
  render();
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
