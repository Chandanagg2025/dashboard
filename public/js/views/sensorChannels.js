/**
 * sensorChannels.js — Dedicated Hardware Sensor Channel Parameter Registry Table View
 */
import { mk, SIG_LBL, SIG_COL } from '../utils.js';
import { fetchSites } from '../api.js';
import { navigate } from '../app.js';

export async function vSensorChannels() {
  const panel = mk('div', 'card');
  const ph    = mk('div', 'card-h');
  ph.innerHTML = `<h3>🧪 Sensor Channels &amp; Parameter Registry</h3><span class="hint">Hardware response channel mappings, threshold limits &amp; live telemetry stream status</span>`;

  const topRow = mk('div');
  topRow.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px';

  const inp = mk('input', 'srch');
  inp.type = 'text';
  inp.placeholder = 'Search by site, parameter name, or sensor CH ID…';
  inp.style.maxWidth = '360px';
  topRow.append(inp);

  const filterWrap = mk('div');
  filterWrap.style.cssText = 'display:flex;gap:6px;align-items:center';

  let currentCat = 'all';

  const cats = [
    { id: 'all',   lbl: 'All Channels' },
    { id: 'ETP',   lbl: '🌊 Water Analyzers' },
    { id: 'Stack', lbl: '🏭 Stack Emissions' },
  ];

  cats.forEach(c => {
    const btn = mk('button', `btn btn-sm ${currentCat === c.id ? 'btn-p' : 'btn-g'}`, c.lbl);
    btn.onclick = () => {
      currentCat = c.id;
      filterWrap.querySelectorAll('button').forEach(b => {
        b.className = 'btn btn-sm btn-g';
      });
      btn.className = 'btn btn-sm btn-p';
      fill(inp.value);
    };
    filterWrap.append(btn);
  });

  topRow.append(filterWrap);
  ph.append(topRow);
  panel.append(ph);

  const w = mk('div', 'tbl-w');
  const t = mk('table', 'tbl');
  t.innerHTML = `<thead><tr>
    <th>Industry / Plant</th>
    <th>Parameter</th>
    <th>Hardware Param ID</th>
    <th>Unit</th>
    <th>Min Limit</th>
    <th>Warn Limit</th>
    <th>Exceedance Limit</th>
    <th>Latest Analyzer Reading</th>
    <th>Stream Status</th>
  </tr></thead>`;

  const tb = mk('tbody');
  tb.innerHTML = `<tr><td colspan="9"><div class="loading-state"><div class="spinner"></div><span>Loading sensor channels…</span></div></td></tr>`;
  t.append(tb);
  w.append(t);
  panel.append(w);

  let allChannels = [];

  function fill(q) {
    tb.innerHTML = '';
    const query = (q || '').toLowerCase().trim();

    let list = allChannels.filter(c => {
      const matchCat = (currentCat === 'all') || (c.siteCat === currentCat);
      const matchQ   = !query || (c.siteName + c.siteId + c.key + c.param_id + c.unit).toLowerCase().includes(query);
      return matchCat && matchQ;
    });

    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="9"><div class="empty">No sensor channels matching filter.</div></td></tr>`;
      return;
    }

    list.forEach(c => {
      const tr = mk('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = () => navigate('detail', c.siteRaw);

      const hasVal = (c.value !== null && c.value !== undefined);
      const col    = SIG_COL[c.sig] || '#10b981';

      tr.innerHTML = `
        <td><b style="color:var(--text-1)">${c.siteName}</b><br><span style="font-size:11px;color:var(--text-3)">🔑 ${c.siteId} · 📍${c.city}</span></td>
        <td><b style="color:var(--text-1)">${c.key}</b></td>
        <td class="mono" style="color:var(--cyan-l);font-weight:700">${c.param_id || '—'}</td>
        <td style="color:var(--text-2)">${c.unit || '—'}</td>
        <td class="mono">${c.min_val != null ? c.min_val : '—'}</td>
        <td class="mono" style="color:var(--yellow-l)">${c.warn_val != null ? c.warn_val : '—'}</td>
        <td class="mono" style="color:#f87171">${c.limit_val != null ? c.limit_val : '—'}</td>
        <td class="mono" style="font-weight:700;color:${hasVal ? col : 'var(--text-3)'}">
          ${hasVal ? `${c.value} ${c.unit}` : '<span style="color:var(--text-3);font-weight:400">⏳ Waiting for Telemetry</span>'}
        </td>
        <td>
          <span class="badge ${c.sig}">${hasVal ? SIG_LBL[c.sig] : 'Awaiting Data'}</span>
        </td>
      `;
      tb.append(tr);
    });
  }

  try {
    const sites = await fetchSites();
    allChannels = [];

    sites.forEach(s => {
      (s.params || []).forEach(p => {
        allChannels.push({
          siteId:   s.id,
          siteName: s.name,
          siteCat:  s.cat,
          city:     s.city,
          siteRaw:  s,
          key:      p.key,
          param_id: p.param_id,
          unit:     p.unit,
          value:    p.value,
          limit_val:p.limit_val,
          warn_val: p.warn_val,
          min_val:  p.min_val,
          sig:      p.sig,
        });
      });
    });

    fill(inp.value);
    inp.addEventListener('input', () => fill(inp.value));
  } catch (err) {
    tb.innerHTML = `<tr><td colspan="9"><div class="error-box">⚠️ ${err.message}</div></td></tr>`;
  }

  return panel;
}
