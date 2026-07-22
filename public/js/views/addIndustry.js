/**
 * addIndustry.js — Dedicated Add Industry view with Water & Stack Device Parameter Registry Builder
 */
import { mk, toast } from '../utils.js';
import { createSite } from '../api.js';
import { navigate } from '../app.js';

export async function vAddIndustry() {
  const wrap = mk('div');

  const card = mk('div', 'card');
  card.style.marginBottom = '24px';

  const ch = mk('div', 'card-h');
  ch.innerHTML = `<h3>🏭 Add New Industry / Plant</h3><span class="hint">Configure industry metadata, login credentials &amp; hardware device parameter IDs</span>`;
  card.append(ch);

  const cb = mk('div', 'card-b');

  // Form markup
  cb.innerHTML = `
    <form id="addIndForm" novalidate>
      
      <!-- Section 1: Industry Details & Credentials -->
      <div style="background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px">
        <h4 style="font-size:13px;font-weight:700;color:var(--purple-l);margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em">📍 Industry Details &amp; Login Credentials</h4>
        
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr))">
          <div class="form-group full" style="grid-column:1/-1">
            <label for="aiName">Industry / Plant Name *</label>
            <input type="text" id="aiName" placeholder="e.g. Mumbai Water Treatment Works" required>
          </div>
          <div class="form-group">
            <label for="aiSector">Sector *</label>
            <select id="aiSector" required>
              <option value="Chemical" selected>Chemical</option>
              <option value="Textile">Textile</option>
              <option value="Pharmaceutical">Pharmaceutical</option>
              <option value="Pulp & Paper">Pulp & Paper</option>
              <option value="Sugar">Sugar</option>
              <option value="Distillery">Distillery</option>
              <option value="Tannery">Tannery</option>
              <option value="Cement">Cement</option>
              <option value="Thermal Power">Thermal Power</option>
              <option value="Steel">Steel</option>
              <option value="Fertilizer">Fertilizer</option>
            </select>
          </div>
          <div class="form-group">
            <label for="aiCategory">Monitoring Category *</label>
            <select id="aiCategory" required>
              <option value="ETP" selected>ETP / Water Effluent</option>
              <option value="Stack">Stack Emissions</option>
            </select>
          </div>
          <div class="form-group">
            <label for="aiCity">City *</label>
            <input type="text" id="aiCity" placeholder="e.g. Mumbai" required>
          </div>
          <div class="form-group">
            <label for="aiState">State *</label>
            <input type="text" id="aiState" placeholder="e.g. Maharashtra" required>
          </div>
          <div class="form-group">
            <label for="aiSpcb">State PCB Board *</label>
            <input type="text" id="aiSpcb" placeholder="e.g. MPCB" required>
          </div>
          <div class="form-group">
            <label for="aiPhone">Contact Phone</label>
            <input type="text" id="aiPhone" placeholder="+91-9876543210">
          </div>
          <div class="form-group">
            <label for="aiLat">Latitude (deg N)</label>
            <input type="number" step="0.0001" id="aiLat" value="19.0760">
          </div>
          <div class="form-group">
            <label for="aiLng">Longitude (deg E)</label>
            <input type="number" step="0.0001" id="aiLng" value="72.8777">
          </div>
          <div class="form-group">
            <label for="aiEmail">Industry User Email</label>
            <input type="email" id="aiEmail" placeholder="e.g. water.mumbai@ocems.in">
          </div>
          <div class="form-group">
            <label for="aiPass">Industry Password (Declared)</label>
            <input type="text" id="aiPass" placeholder="e.g. WaterPass2026!">
          </div>
        </div>
      </div>

      <!-- Section 2: Hardware Device Parameter Registry Builder (Full Width) -->
      <div style="background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:12px;padding:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h4 style="font-size:13px;font-weight:700;color:var(--cyan-l);text-transform:uppercase;letter-spacing:.05em">🧪 Hardware Analyzer &amp; Device Parameter Builder</h4>
            <div style="font-size:11.5px;color:var(--text-3);margin-top:2px">Configure Device Parameter IDs (Sensor Channel Mappings), Telemetry Units, Threshold Limits &amp; Initial Readings</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-c btn-sm" id="btnPresetWater">🌊 Load Water Preset</button>
            <button type="button" class="btn btn-g btn-sm" id="btnPresetStack">🏭 Load Stack Preset</button>
            <button type="button" class="btn btn-g btn-sm" id="btnAutoGenerateIds" style="color:var(--cyan-l);border-color:rgba(6,182,212,.4)">⚡ Auto-Generate Device IDs</button>
          </div>
        </div>

        <div style="overflow-x:auto;padding-bottom:4px">
          <div style="min-width:820px">
            <div style="display:grid;grid-template-columns:1fr 1.4fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 30px;gap:8px;font-size:10.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:8px;padding:0 4px">
              <span>Parameter Name</span>
              <span>Device Parameter ID (Hardware CH ID)</span>
              <span>Unit</span>
              <span>Initial Reading</span>
              <span>Exceedance Limit</span>
              <span>Warn Limit</span>
              <span>Min Limit</span>
              <span></span>
            </div>

            <div id="paramRows" style="display:flex;flex-direction:column;gap:8px"></div>
          </div>
        </div>

        <div id="devParamSummary" style="margin-top:12px;padding:8px 12px;background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.2);border-radius:8px;font-size:11px;font-family:var(--mono);color:var(--cyan-l);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>📡 Configured Device Parameter IDs:</span>
          <span id="devParamBadges" style="color:var(--text-1);font-weight:600">None</span>
        </div>

        <button type="button" class="btn btn-g btn-sm" id="btnAddRow" style="margin-top:14px;width:100%;justify-content:center">➕ Add Custom Device Parameter</button>
      </div>

      <div style="margin-top:24px;border-top:1px solid var(--border);padding-top:16px;display:flex;justify-content:flex-end;gap:12px">
        <button type="button" class="btn btn-g" onclick="navigate('sites')">Cancel</button>
        <button type="submit" class="btn btn-p" id="btnSubmitForm">🚀 Create Industry &amp; Route Device Parameters</button>
      </div>
    </form>`;

  card.append(cb);
  wrap.append(card);

  // Dynamic Parameter Rows Builder logic
  setTimeout(() => {
    const rowsWrap = document.getElementById('paramRows');
    const badgesEl = document.getElementById('devParamBadges');
    if (!rowsWrap) return;

    function updateSummaryBadges() {
      if (!badgesEl) return;
      const ids = [];
      rowsWrap.querySelectorAll('.p-id').forEach(inp => {
        const val = inp.value.trim();
        if (val) ids.push(val);
      });
      if (!ids.length) {
        badgesEl.innerHTML = '<span style="color:var(--text-3)">None</span>';
      } else {
        badgesEl.innerHTML = ids.map(id => `<span style="background:rgba(6,182,212,.15);border:1px solid rgba(6,182,212,.3);padding:2px 6px;border-radius:4px;margin-right:4px">${id}</span>`).join('');
      }
    }

    function addParamRow(p = {}) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 1.4fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 30px;gap:8px;align-items:center';

      row.innerHTML = `
        <input type="text" class="p-key" placeholder="e.g. BOD" value="${p.key || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 8px;font-size:12px">
        <input type="text" class="p-id" placeholder="Device Parameter ID" value="${p.param_id || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 8px;font-size:11px;font-family:var(--mono);color:var(--cyan-l);border-color:rgba(6,182,212,.3)">
        <input type="text" class="p-unit" placeholder="e.g. mg/L" value="${p.unit || ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 8px;font-size:12px">
        <input type="number" step="0.1" class="p-val" placeholder="Val" value="${p.value !== null && p.value !== undefined ? p.value : ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 6px;font-size:12px;font-family:var(--mono)">
        <input type="number" step="0.1" class="p-lim" placeholder="Limit" value="${p.limit ?? 100}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 6px;font-size:12px;font-family:var(--mono)">
        <input type="number" step="0.1" class="p-warn" placeholder="Warn" value="${p.warn ?? 80}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 6px;font-size:12px;font-family:var(--mono)">
        <input type="number" step="0.1" class="p-min" placeholder="Min" value="${p.min ?? ''}" style="width:100%;min-width:0;box-sizing:border-box;padding:6px 6px;font-size:12px;font-family:var(--mono)">
        <button type="button" class="btn-del-row" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;color:#f87171;cursor:pointer;font-size:13px;padding:6px 8px;line-height:1;display:flex;align-items:center;justify-content:center" title="Remove parameter">✕</button>
      `;

      row.querySelector('.p-id').addEventListener('input', updateSummaryBadges);
      row.querySelector('.btn-del-row').onclick = () => {
        row.remove();
        updateSummaryBadges();
      };
      rowsWrap.append(row);
      updateSummaryBadges();
    }

    function autoGenerateDeviceIds() {
      const nameInp = document.getElementById('aiName');
      const rawName = nameInp ? nameInp.value.trim() : '';
      let prefix = 'DEV';

      if (rawName) {
        prefix = rawName.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('').replace(/[^\w]/g, '').slice(0, 5) || 'DEV';
      }

      const rows = rowsWrap.querySelectorAll('div');
      rows.forEach((r, idx) => {
        const keyInp = r.querySelector('.p-key');
        const idInp  = r.querySelector('.p-id');
        const keyVal = (keyInp?.value?.trim() || 'PARAM').replace(/[^\w]/g, '').toUpperCase();
        if (idInp) {
          idInp.value = `${prefix}-${keyVal}-CH${idx + 1}`;
        }
      });
      updateSummaryBadges();
    }

    const WATER_PRESET = [
      { key: 'pH',        param_id: 'DEV-WATER-pH-CH1',   unit: '',      limit: 9.5,  warn: 9.0, min: 6.5,  value: 7.4 },
      { key: 'BOD',       param_id: 'DEV-WATER-BOD-CH2',  unit: 'mg/L',  limit: 30,   warn: 24,  min: null, value: 18.5 },
      { key: 'COD',       param_id: 'DEV-WATER-COD-CH3',  unit: 'mg/L',  limit: 250,  warn: 200, min: null, value: 110.0 },
      { key: 'TSS',       param_id: 'DEV-WATER-TSS-CH4',  unit: 'mg/L',  limit: 100,  warn: 80,  min: null, value: 42.0 },
      { key: 'TDS',       param_id: 'DEV-WATER-TDS-CH5',  unit: 'mg/L',  limit: 2100, warn: 1700,min: null, value: 850.0 },
      { key: 'Flow Rate', param_id: 'DEV-WATER-FLOW-CH6', unit: 'm³/hr', limit: 120,  warn: 100, min: null, value: 65.0 },
    ];

    const STACK_PRESET = [
      { key: 'PM₁₀', param_id: 'DEV-STACK-PM10-CH1', unit: 'mg/Nm³', limit: 150, warn: 120, min: null, value: 68.0 },
      { key: 'SO₂',   param_id: 'DEV-STACK-SO2-CH2',  unit: 'mg/Nm³', limit: 200, warn: 160, min: null, value: 92.0 },
      { key: 'NOₓ',   param_id: 'DEV-STACK-NOX-CH3',  unit: 'mg/Nm³', limit: 250, warn: 200, min: null, value: 115.0 },
      { key: 'CO',    param_id: 'DEV-STACK-CO-CH4',   unit: 'mg/Nm³', limit: 500, warn: 400, min: null, value: 140.0 },
    ];

    function loadPreset(preset) {
      rowsWrap.innerHTML = '';
      preset.forEach(p => addParamRow(p));
      updateSummaryBadges();
    }

    // Default to Water Preset initially
    loadPreset(WATER_PRESET);

    document.getElementById('btnPresetWater').onclick = () => loadPreset(WATER_PRESET);
    document.getElementById('btnPresetStack').onclick = () => loadPreset(STACK_PRESET);
    document.getElementById('btnAutoGenerateIds').onclick = autoGenerateDeviceIds;
    document.getElementById('btnAddRow').onclick      = () => addParamRow();

    const catSelect = document.getElementById('aiCategory');
    if (catSelect) {
      catSelect.onchange = () => {
        if (catSelect.value === 'Stack') loadPreset(STACK_PRESET);
        else loadPreset(WATER_PRESET);
      };
    }

    const nameInp = document.getElementById('aiName');
    if (nameInp) {
      nameInp.addEventListener('blur', () => {
        if (nameInp.value.trim()) autoGenerateDeviceIds();
      });
    }

    // Submit handler
    const form = document.getElementById('addIndForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitForm');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Industry & Provisioning Device Parameters…';

      try {
        const paramRows = rowsWrap.querySelectorAll('div');
        const params = [];

        paramRows.forEach(r => {
          const key = r.querySelector('.p-key')?.value?.trim();
          if (!key) return;
          const valStr = r.querySelector('.p-val')?.value;
          params.push({
            key,
            param_id:  r.querySelector('.p-id')?.value?.trim() || '',
            unit:      r.querySelector('.p-unit')?.value?.trim() || '',
            value:     (valStr !== undefined && valStr !== '') ? parseFloat(valStr) : null,
            limit_val: parseFloat(r.querySelector('.p-lim')?.value || '100'),
            warn_val:  parseFloat(r.querySelector('.p-warn')?.value || '80'),
            min_val:   r.querySelector('.p-min')?.value !== '' ? parseFloat(r.querySelector('.p-min')?.value) : null,
          });
        });

        const payload = {
          name:          document.getElementById('aiName').value.trim(),
          sector:        document.getElementById('aiSector').value,
          cat:           document.getElementById('aiCategory').value,
          city:          document.getElementById('aiCity').value.trim(),
          state:         document.getElementById('aiState').value.trim(),
          spcb:          document.getElementById('aiSpcb').value.trim(),
          phone:         document.getElementById('aiPhone').value.trim(),
          lat:           parseFloat(document.getElementById('aiLat').value || '19.076'),
          lng:           parseFloat(document.getElementById('aiLng').value || '72.877'),
          user_email:    document.getElementById('aiEmail').value.trim(),
          user_password: document.getElementById('aiPass').value.trim(),
          params,
        };

        const newSite = await createSite(payload);
        toast('✅ Industry Created', `${newSite.name} (${newSite.id}) created with ${params.length} Device Parameter IDs registered.`, 'success');
        navigate('sites');
      } catch (err) {
        toast('⚠️ Error', err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Create Industry & Route Device Parameters';
      }
    };
  }, 30);

  return wrap;
}
