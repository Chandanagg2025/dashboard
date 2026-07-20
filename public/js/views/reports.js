/**
 * reports.js — Reports & export view
 */
import { mk, SIG_LBL, fmtT, toast } from '../utils.js';
import { fetchSites } from '../api.js';
import { navigate } from '../app.js';

export async function vReports() {
  const wrap  = mk('div');
  const panel = mk('div','card');
  panel.innerHTML = `<div class="card-h"><h3>Reports</h3><span class="hint">Generate &amp; export data</span></div>`;

  // Loading filter area
  const filt = mk('div','rep-filt');
  filt.innerHTML = '<span style="color:var(--text-3);font-size:13px">Loading sites…</span>';
  panel.append(filt);

  const tw = mk('div','card-b');
  tw.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading report data…</span></div>';
  panel.append(tw);
  wrap.append(panel);

  try {
    const sites = await fetchSites();

    // Build filter bar
    filt.innerHTML = `
      <div class="fg"><label>Site</label>
        <select id="rSite"><option value="all">All Sites</option>
          ${sites.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label>Parameter</label>
        <select id="rParam"><option value="all">All Parameters</option>
          ${[...new Set(sites.flatMap(s=>(s.params||[]).map(p=>p.key)))].map(k=>`<option>${k}</option>`).join('')}
        </select></div>
      <div class="fg"><label>From</label>
        <input type="date" id="rFrom" value="${new Date(Date.now()-7*864e5).toISOString().slice(0,10)}"></div>
      <div class="fg"><label>To</label>
        <input type="date" id="rTo" value="${new Date().toISOString().slice(0,10)}"></div>
      <button class="btn btn-p" id="rGenerate">📊 Generate</button>
      <button class="btn btn-c btn-sm" id="rCsv">📥 CSV</button>
      <button class="btn btn-g btn-sm" id="rPdf">📄 PDF</button>`;

    let activeRows = [];

    function generateReportData() {
      const siteVal  = filt.querySelector('#rSite').value;
      const paramVal = filt.querySelector('#rParam').value;

      let filteredSites = sites;
      if (siteVal !== 'all') {
        filteredSites = sites.filter(s => s.id === siteVal);
      }

      activeRows = filteredSites.flatMap(s => {
        let params = s.params || [];
        if (paramVal !== 'all') {
          params = params.filter(p => p.key === paramVal);
        }
        return params.map(p => ({
          siteId: s.id,
          siteName: s.name,
          city: s.city,
          state: s.state,
          sector: s.sector,
          paramKey: p.key,
          value: p.value,
          unit: p.unit,
          limitVal: p.limit_val,
          sig: p.sig,
          timestamp: new Date().toLocaleString('en-IN')
        }));
      });

      renderTable();
    }

    function renderTable() {
      if (!activeRows.length) {
        tw.innerHTML = '<div class="empty"><div class="ei">🔍</div>No data matching selected report filters.</div>';
        return;
      }
      const tbody = activeRows.map(r => {
        const e = ['yellow','red'].includes(r.sig);
        return `<tr>
          <td><b style="color:var(--text-1)">${r.siteName}</b><br><span style="font-size:11px;color:var(--text-3)">${r.siteId} · ${r.city}</span></td>
          <td><b>${r.paramKey}</b></td>
          <td class="mono${e?' exc-v':''}">${r.value}</td>
          <td>${r.unit}</td>
          <td class="mono">${r.limitVal}</td>
          <td><span class="badge ${r.sig}">${SIG_LBL[r.sig]}</span></td>
          <td class="mono" style="color:var(--text-3);font-size:11px">${r.timestamp}</td>
        </tr>`;
      }).join('');

      tw.innerHTML = `<div class="tbl-w"><table class="tbl"><thead><tr>
        <th>Site</th><th>Parameter</th><th>Value</th><th>Unit</th><th>Limit</th><th>Status</th><th>Timestamp</th>
      </tr></thead><tbody>${tbody}</tbody></table></div>`;
    }

    function downloadCsv() {
      if (!activeRows.length) {
        toast('⚠️ Export Error', 'No data available to export.', 'warn');
        return;
      }
      const headers = ['Site Code', 'Site Name', 'City', 'Sector', 'Parameter', 'Value', 'Unit', 'Limit', 'Status', 'Timestamp'];
      const csvRows = [headers.join(',')];

      activeRows.forEach(r => {
        const row = [
          `"${r.siteId}"`,
          `"${r.siteName.replace(/"/g, '""')}"`,
          `"${r.city}"`,
          `"${r.sector}"`,
          `"${r.paramKey}"`,
          r.value,
          `"${r.unit}"`,
          r.limitVal,
          `"${r.sig}"`,
          `"${r.timestamp}"`
        ];
        csvRows.push(row.join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `OCEMS_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('📥 Export Complete', 'CSV report downloaded successfully.', 'success');
    }

    generateReportData();

    filt.querySelector('#rGenerate').onclick = () => {
      generateReportData();
      toast('📊 Report Updated', `Showing ${activeRows.length} records.`, 'info');
    };
    filt.querySelector('#rCsv').onclick = () => downloadCsv();
    filt.querySelector('#rPdf').onclick = () => {
      window.print();
    };

  } catch(err) {
    filt.innerHTML = '';
    tw.innerHTML = `<div class="error-box">⚠️ ${err.message}</div>`;
  }

  return wrap;
}
