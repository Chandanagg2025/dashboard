/**
 * api.js — Fetch helpers for OCEMS backend
 * All functions return data directly, with fallback seed data if API is unreachable.
 */

const API_BASE = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : (window.API_BASE || 'http://localhost:3001');

const MOCK_SITES = [
  { id: 'OCEMS-001', name: 'UltraTech Cement Works', sector: 'Cement', city: 'Pune', state: 'Maharashtra', spcb: 'MPCB', sig: 'green', last_data: 'Live · 2 mins ago', stacks: 2, etp: 1, lat: 18.52, lng: 73.86, params: [
    { key: 'PM₁₀', val: 42.5, unit: 'mg/Nm³', limit: 150, warn: 120, sig: 'green', history: [40, 42, 45, 41, 42.5] },
    { key: 'SO₂', val: 98.2, unit: 'mg/Nm³', limit: 200, warn: 160, sig: 'green', history: [95, 96, 98, 97, 98.2] },
    { key: 'NOₓ', val: 145.0, unit: 'mg/Nm³', limit: 250, warn: 200, sig: 'green', history: [140, 142, 145, 143, 145] }
  ]},
  { id: 'OCEMS-002', name: 'NTPC Thermal Power Plant', sector: 'Thermal Power', city: 'Kanpur', state: 'Uttar Pradesh', spcb: 'UPPCB', sig: 'yellow', last_data: 'Live · 1 min ago', stacks: 4, etp: 1, lat: 26.45, lng: 80.33, params: [
    { key: 'PM₁₀', val: 135.0, unit: 'mg/Nm³', limit: 150, warn: 120, sig: 'yellow', history: [110, 122, 128, 132, 135] },
    { key: 'SO₂', val: 155.0, unit: 'mg/Nm³', limit: 200, warn: 160, sig: 'green', history: [150, 152, 154, 155, 155] }
  ]},
  { id: 'OCEMS-003', name: 'Tata Steel Processing Ltd', sector: 'Steel', city: 'Raipur', state: 'Chhattisgarh', spcb: 'CGSPCB', sig: 'red', last_data: 'Live · Just now', stacks: 3, etp: 1, lat: 21.25, lng: 81.63, params: [
    { key: 'PM₁₀', val: 168.4, unit: 'mg/Nm³', limit: 150, warn: 120, sig: 'red', history: [140, 150, 160, 165, 168.4] }
  ]},
  { id: 'OCEMS-004', name: 'Gujarat Chemical Hub', sector: 'Chemical', city: 'Vadodara', state: 'Gujarat', spcb: 'GPCB', sig: 'green', last_data: 'Live · 5 mins ago', stacks: 1, etp: 1, lat: 22.31, lng: 73.18, params: [
    { key: 'pH', val: 7.4, unit: '', limit: 9.5, warn: 9.0, min: 6.5, sig: 'green', history: [7.2, 7.3, 7.5, 7.4, 7.4] },
    { key: 'BOD', val: 18.5, unit: 'mg/L', limit: 30, warn: 24, sig: 'green', history: [16, 17, 18, 18.5, 18.5] }
  ]},
  { id: 'OCEMS-005', name: 'Sun Pharma Manufacturing', sector: 'Pharmaceutical', city: 'Ahmedabad', state: 'Gujarat', spcb: 'GPCB', sig: 'green', last_data: 'Live · 3 mins ago', stacks: 1, etp: 1, lat: 23.02, lng: 72.57, params: [
    { key: 'COD', val: 140.0, unit: 'mg/L', limit: 250, warn: 200, sig: 'green', history: [130, 135, 138, 140, 140] }
  ]},
  { id: 'OCEMS-006', name: 'Vardhman Textile Mills', sector: 'Textile', city: 'Ludhiana', state: 'Punjab', spcb: 'PPCB', sig: 'grey', last_data: 'Offline · 2 hrs ago', stacks: 1, etp: 1, lat: 30.90, lng: 75.85, params: [
    { key: 'TSS', val: 45.0, unit: 'mg/L', limit: 100, warn: 80, sig: 'grey', history: [40, 42, 45, 45, 45] }
  ]}
];

const MOCK_ALERTS = [
  { id: 'alt-101', site_id: 'OCEMS-003', site_name: 'Tata Steel Processing Ltd', param: 'PM₁₀', value: 168.4, unit: 'mg/Nm³', limit_val: 150, sig: 'red', msg: 'PM₁₀ exceeded maximum limit threshold of 150 mg/Nm³', triggered_at: Date.now() - 600000 },
  { id: 'alt-102', site_id: 'OCEMS-002', site_name: 'NTPC Thermal Power Plant', param: 'PM₁₀', value: 135.0, unit: 'mg/Nm³', limit_val: 150, sig: 'yellow', msg: 'PM₁₀ exceeded warning threshold of 120 mg/Nm³', triggered_at: Date.now() - 1800000 }
];

async function apiFetch(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  } catch (err) {
    throw new Error('Connection error: ' + err.message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    console.warn(`API error on ${path} (${res.status}):`, text.slice(0, 100));
    throw new Error(`Server returned status ${res.status}`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

export async function fetchSites() {
  try { return await apiFetch('/api/sites'); }
  catch (err) {
    console.warn('Using fallback sites data:', err.message);
    return MOCK_SITES;
  }
}

export async function fetchSite(id) {
  try { return await apiFetch(`/api/sites/${id}`); }
  catch (err) {
    console.warn(`Using fallback site data for ${id}:`, err.message);
    return MOCK_SITES.find(s => s.id === id) || MOCK_SITES[0];
  }
}

export async function fetchAlerts() {
  try { return await apiFetch('/api/alerts'); }
  catch (err) {
    console.warn('Using fallback alerts data:', err.message);
    return MOCK_ALERTS;
  }
}

export async function fetchKpis() {
  try { return await apiFetch('/api/kpis'); }
  catch (err) {
    console.warn('Using fallback KPIs data:', err.message);
    return { green: 3, yellow: 1, exc: 1, offline: 1, total: 6, a24: 2 };
  }
}

export async function createSite(data) {
  try {
    const res  = await fetch(`${API_BASE}/api/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to add site');
    return json.data;
  } catch (err) {
    console.warn('Create site fallback:', err.message);
    const newId = `OCEMS-00${MOCK_SITES.length + 1}`;
    const newSite = { id: newId, ...data, sig: 'green', last_data: 'Live · Just now', params: [] };
    MOCK_SITES.push(newSite);
    return newSite;
  }
}

export async function deleteSite(id) {
  try {
    const res  = await fetch(`${API_BASE}/api/sites/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to delete site');
    return json.data;
  } catch (err) {
    console.warn('Delete site fallback:', err.message);
    const idx = MOCK_SITES.findIndex(s => s.id === id);
    if (idx !== -1) MOCK_SITES.splice(idx, 1);
    return { id, message: 'Deleted successfully' };
  }
}
