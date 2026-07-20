/**
 * sites.js — All Sites table view
 */
import { mk, SIG_LBL, RANK } from '../utils.js';
import { fetchSites } from '../api.js';
import { navigate, getState, setState } from '../app.js';

export async function vSites() {
  const storedRole = JSON.parse(sessionStorage.getItem('ocems_user') || '{}')?.role;
  const isAdmin = (getState().USER?.role === 'admin') || (window._ocemsUser?.role === 'admin') || (storedRole === 'admin');
  const panel   = mk('div', 'card');
  const ph      = mk('div', 'card-h');
  ph.innerHTML  = `<h3>All Sites</h3><span class="hint">Connected OCEMS sites · click row for detail</span>`;

  const row = mk('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px';
  const inp = mk('input', 'srch');
  inp.type = 'text'; inp.placeholder = 'Search site, code, sector…';
  inp.value = getState().Q || ''; inp.style.maxWidth = '320px';
  row.append(inp);

  if (isAdmin) {
    const addBtn = mk('button', 'btn btn-p btn-sm');
    addBtn.innerHTML = '➕ Add Industry';
    addBtn.onclick = () => window.openAddSiteModal();
    row.append(addBtn);
  }

  ph.append(row); panel.append(ph);

  const colCount = isAdmin ? 9 : 8;
  const w  = mk('div', 'tbl-w');
  const t  = mk('table', 'tbl');
  t.innerHTML = `<thead><tr><th>Site</th><th>Code</th><th>Sector</th><th>SPCB</th><th>Category</th><th>Params</th><th>Status</th><th>Last Data</th>${isAdmin ? '<th>Action</th>' : ''}</tr></thead>`;
  const tb = mk('tbody');
  tb.innerHTML = `<tr><td colspan="${colCount}"><div class="loading-state"><div class="spinner"></div><span>Loading…</span></div></td></tr>`;
  t.append(tb); w.append(t); panel.append(w);

  try {
    const sites = await fetchSites();

    function fill(q) {
      tb.innerHTML = '';
      let list = sites.filter(s => !q || (s.name+s.id+s.sector+s.city).toLowerCase().includes(q.toLowerCase()));
      list.sort((a,b) => (RANK[b.sig]||0)-(RANK[a.sig]||0));
      if (!list.length) { tb.innerHTML = `<tr><td colspan="${colCount}"><div class="empty">No site matches.</div></td></tr>`; return; }
      list.forEach(s => {
        const tr = mk('tr');
        tr.onclick = () => navigate('detail', s);
        tr.innerHTML = `<td><b style="color:var(--text-1)">${s.name}</b><br><span style="font-size:11px;color:var(--text-3)">📍${s.city}, ${s.state}</span></td>
          <td class="mono" style="color:var(--cyan-l)">${s.id}</td>
          <td>${s.sector}</td><td>${s.spcb}</td><td>${s.cat}</td>
          <td class="mono">${(s.params||[]).length}</td>
          <td><span class="badge ${s.sig}">${SIG_LBL[s.sig]}</span></td>
          <td class="mono" style="color:var(--text-3)">${s.last_data}</td>`;

        if (isAdmin) {
          const tdAct = mk('td');
          const delBtn = mk('button', 'btn btn-danger btn-sm', '🗑️ Delete');
          delBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.deleteSiteFn) {
              window.deleteSiteFn(s.id, s.name);
            }
          };
          tdAct.append(delBtn);
          tr.append(tdAct);
        }

        tb.append(tr);
      });
    }

    fill(inp.value);
    inp.addEventListener('input', () => { setState({ Q: inp.value }); fill(inp.value); });

  } catch(err) {
    tb.innerHTML = `<tr><td colspan="8"><div class="error-box">⚠️ ${err.message}</div></td></tr>`;
  }

  return panel;
}
