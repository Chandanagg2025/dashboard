/**
 * api.js — Fetch helpers for OCEMS backend
 * All functions return the data array/object directly and throw on error.
 */

const API_BASE = window.API_BASE || 'http://localhost:3001';

async function apiFetch(path) {
  const res  = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

export async function fetchSites()    { return apiFetch('/api/sites'); }
export async function fetchSite(id)  { return apiFetch(`/api/sites/${id}`); }
export async function fetchAlerts()  { return apiFetch('/api/alerts'); }
export async function fetchKpis()    { return apiFetch('/api/kpis'); }

export async function createSite(data) {
  const res  = await fetch(`${API_BASE}/api/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add site');
  return json.data;
}

export async function deleteSite(id) {
  const res  = await fetch(`${API_BASE}/api/sites/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to delete site');
  return json.data;
}
