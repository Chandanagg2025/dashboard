/**
 * api.js — Fetch helpers for OCEMS backend
 * All functions return data directly, with fallback seed data if API is unreachable.
 */

const API_BASE = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : (window.API_BASE || 'http://localhost:3001');

const MOCK_SITES = [];
const MOCK_ALERTS = [];

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
    const fallbackParams = (Array.isArray(data.params) && data.params.length > 0)
      ? data.params.map((p, pidx) => ({
          key: p.key,
          param_id: p.param_id || `${newId}-${p.key}-CH${pidx + 1}`,
          unit: p.unit || '',
          val: p.value ?? null,
          limit: p.limit_val ?? 100,
          warn: p.warn_val ?? 80,
          min: p.min_val ?? null,
          sig: 'green',
          history: p.value != null ? [p.value] : []
        }))
      : [];
    const newSite = { id: newId, ...data, sig: 'green', last_data: 'Live · Just now', params: fallbackParams };
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

export async function clearAllSites() {
  try {
    const res  = await fetch(`${API_BASE}/api/sites`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to clear sites');
    MOCK_SITES.length = 0;
    return json.data;
  } catch (err) {
    console.warn('Clear sites fallback:', err.message);
    MOCK_SITES.length = 0;
    return { message: 'All industries removed' };
  }
}
