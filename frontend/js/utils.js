/**
 * utils.js — Shared helpers: DOM builder, formatting, toast, clock
 */

export const SIG_COL = {
  green:'#10b981', yellow:'#f59e0b', red:'#ef4444',
  grey:'#6b7280', orange:'#f97316', purple:'#a855f7',
};
export const SIG_LBL = {
  green:'Compliant', yellow:'Warning', red:'Exceedance',
  grey:'Offline', orange:'Alert', purple:'Critical',
};
export const RANK = { red:5, orange:4, purple:4, yellow:3, grey:2, green:1 };

/** Lightweight DOM element factory */
export function mk(tag, cls, html) {
  const d = document.createElement(tag);
  if (cls)  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

/** Format a timestamp nicely */
export function fmtT(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

/** Show a toast notification */
export function toast(title, msg, type = 'info') {
  const wrap = document.getElementById('toasts');
  const t    = mk('div', `toast ${type}`);
  t.innerHTML = `<div><div class="t-title">${title}</div><div class="t-msg">${msg}</div></div>
    <div class="t-close" onclick="this.parentElement.remove()">✕</div>`;
  wrap.append(t);
  setTimeout(() => {
    t.style.animation = 'slideOut .3s var(--ease) forwards';
    setTimeout(() => t.remove(), 320);
  }, 5000);
}

/** Render a loading spinner inside a container */
export function showLoading(container) {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Loading data…</span></div>`;
}

/** Render an error message inside a container */
export function showError(container, err) {
  container.innerHTML = `<div class="error-box">⚠️ Failed to load data — ${err.message || err}. Is the backend running on port 3001?</div>`;
}

/** Update the live clock */
export function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', {
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }) + ' IST';
}
