/**
 * sales.js — Sales, Contracts (AMC/CMC) and Payment Transactions view
 */
import { mk, SIG_COL } from '../utils.js';
import { navigate, getState } from '../app.js';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '' : (window.API_BASE || 'http://localhost:3001');

// Helper to fetch API data
async function fetchSalesData(role) {
  const url = role === 'industry' ? `${API_BASE}/api/sales/my` : `${API_BASE}/api/sales`;
  const res = await fetch(url, { credentials: 'include' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch sales data');
  return json.data;
}

// Helper to fetch sites for dropdowns
async function fetchAllSites() {
  const res = await fetch(`${API_BASE}/api/sites`, { credentials: 'include' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch sites');
  return json.data;
}

export async function vSales() {
  // Add CSS styles specifically for sales page
  addSalesStyles();

  const user = JSON.parse(sessionStorage.getItem('ocems_user') || '{}');
  const role = user.role || 'industry';
  const isAdmin = role === 'admin';
  const isEngineer = role === 'engineer';

  const container = mk('div', 'sales-page page-in');

  // Loading indicator
  const loading = mk('div', 'loading-state');
  loading.innerHTML = '<div class="spinner"></div><span>Loading billing details…</span>';
  container.append(loading);

  try {
    const data = await fetchSalesData(role);
    const sites = (isAdmin || isEngineer) ? await fetchAllSites() : [];
    
    loading.remove();

    // ─── 1. RENDER HEADER STATS ───
    const statsGrid = mk('div', 'sales-stats-grid');
    
    if (role === 'industry') {
      // Client Statistics
      const analyzers = data.analyzers || [];
      const transactions = data.transactions || [];
      
      const totalContract = analyzers.reduce((acc, a) => acc + (a.amc_amount || 0) + (a.cmc_amount || 0), 0);
      const totalPaid = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalBalance = analyzers.reduce((acc, a) => acc + (a.balance_amount || 0), 0);

      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="sc-title">AMC Amount</div>
          <div class="sc-val">₹${analyzers.reduce((acc, a) => acc + (a.amc_amount || 0), 0).toLocaleString('en-IN')}</div>
          <div class="sc-sub">Annual Maintenance Contract</div>
        </div>
        <div class="stat-card">
          <div class="sc-title">CMC Amount</div>
          <div class="sc-val">₹${analyzers.reduce((acc, a) => acc + (a.cmc_amount || 0), 0).toLocaleString('en-IN')}</div>
          <div class="sc-sub">Comprehensive Maintenance</div>
        </div>
        <div class="stat-card paid">
          <div class="sc-title">Total Payments Made</div>
          <div class="sc-val">₹${totalPaid.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Settled Transactions</div>
        </div>
        <div class="stat-card bal">
          <div class="sc-title">Outstanding Balance</div>
          <div class="sc-val">₹${totalBalance.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Due Amount</div>
        </div>
      `;
    } else {
      // Admin / Engineer Statistics (All clients aggregated)
      const analyzers = data.analyzers || [];
      const transactions = data.transactions || [];

      const totalAmc = analyzers.reduce((acc, a) => acc + (a.amc_amount || 0), 0);
      const totalCmc = analyzers.reduce((acc, a) => acc + (a.cmc_amount || 0), 0);
      const totalContract = totalAmc + totalCmc;
      const totalPaid = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalBalance = analyzers.reduce((acc, a) => acc + (a.balance_amount || 0), 0);
      const collectionRate = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;

      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="sc-title">Total AMC Contracts</div>
          <div class="sc-val">₹${totalAmc.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Across all connected sites</div>
        </div>
        <div class="stat-card">
          <div class="sc-title">Total CMC Contracts</div>
          <div class="sc-val">₹${totalCmc.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Hardware & component warranties</div>
        </div>
        <div class="stat-card paid">
          <div class="sc-title">Total Collected</div>
          <div class="sc-val">₹${totalPaid.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Collection rate: ${collectionRate}%</div>
        </div>
        <div class="stat-card bal">
          <div class="sc-title">Total Receivables</div>
          <div class="sc-val">₹${totalBalance.toLocaleString('en-IN')}</div>
          <div class="sc-sub">Total outstanding balances</div>
        </div>
      `;
    }
    container.append(statsGrid);

    // ─── 2. ACTION PANEL (FOR ADMIN) ───
    if (isAdmin) {
      const actionPanel = mk('div', 'sales-action-bar');
      actionPanel.innerHTML = `
        <div style="display:flex;gap:10px">
          <button class="btn btn-p" id="btnAddContract">➕ Add Analyzer Contract</button>
          <button class="btn btn-g" id="btnLogPayment">💰 Record Payment</button>
        </div>
      `;
      container.append(actionPanel);

      // Wire modals
      actionPanel.querySelector('#btnAddContract').onclick = () => openContractModal(null, sites, () => refreshSalesPage(container));
      actionPanel.querySelector('#btnLogPayment').onclick = () => openPaymentModal(sites, data.analyzers, () => refreshSalesPage(container));
    }

    // ─── 3. ANALYZERS & CONTRACTS SECTION ───
    const analyzersCard = mk('div', 'card');
    analyzersCard.style.marginBottom = '20px';
    const acHeader = mk('div', 'card-h');
    acHeader.innerHTML = `
      <h3>🏭 Analyzer AMC/CMC Billing Details</h3>
      <span class="hint">${data.analyzers.length} registered analyzers</span>
    `;
    
    // Add search/filter for admin/engineer
    if (isAdmin || isEngineer) {
      const filterBox = mk('div');
      filterBox.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:6px;width:100%';
      filterBox.innerHTML = `
        <input type="text" class="srch" id="analyzerSearch" placeholder="Search site or analyzer..." style="max-width:240px;margin:0">
        <select class="srch" id="statusFilter" style="max-width:160px;margin:0">
          <option value="all">All Payment Statuses</option>
          <option value="Paid">Paid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Pending">Pending</option>
          <option value="Overdue">Overdue</option>
        </select>
      `;
      acHeader.append(filterBox);
    }
    analyzersCard.append(acHeader);

    const acBody = mk('div', 'tbl-w');
    const table = mk('table', 'tbl');
    table.innerHTML = `
      <thead>
        <tr>
          ${(isAdmin || isEngineer) ? '<th>Client / Site</th>' : ''}
          <th>Analyzer Name</th>
          <th>AMC Amount</th>
          <th>CMC Amount</th>
          <th>Outstanding Balance</th>
          <th>Status</th>
          <th>Contract Period</th>
          ${isAdmin ? '<th>Action</th>' : ''}
        </tr>
      </thead>
      <tbody id="analyzersTableBody"></tbody>
    `;
    acBody.append(table);
    analyzersCard.append(acBody);
    container.append(analyzersCard);

    // Populate Analyzers Table
    const populateAnalyzers = () => {
      const tbody = table.querySelector('#analyzersTableBody');
      tbody.innerHTML = '';
      
      const qVal = container.querySelector('#analyzerSearch')?.value.toLowerCase() || '';
      const filterStatus = container.querySelector('#statusFilter')?.value || 'all';

      const filtered = data.analyzers.filter(a => {
        const matchesSearch = !qVal || 
          a.name.toLowerCase().includes(qVal) || 
          (a.site_name && a.site_name.toLowerCase().includes(qVal)) ||
          a.site_id.toLowerCase().includes(qVal);
        const matchesStatus = filterStatus === 'all' || a.payment_status === filterStatus;
        return matchesSearch && matchesStatus;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="${(isAdmin || isEngineer) ? 8 : 7}" style="text-align:center;padding:24px;color:var(--text-2)">No analyzer contract records found.</td></tr>`;
        return;
      }

      filtered.forEach(a => {
        const tr = mk('tr');
        const statusClass = a.payment_status === 'Paid' ? 'green' : a.payment_status === 'Partially Paid' ? 'yellow' : a.payment_status === 'Pending' ? 'orange' : 'red';
        
        tr.innerHTML = `
          ${(isAdmin || isEngineer) ? `<td><b>${a.site_name}</b><br><span style="font-size:11px;color:var(--text-3)">${a.site_id}</span></td>` : ''}
          <td><b style="color:var(--text-1)">${a.name}</b></td>
          <td class="mono">₹${a.amc_amount.toLocaleString('en-IN')}</td>
          <td class="mono">₹${a.cmc_amount.toLocaleString('en-IN')}</td>
          <td class="mono" style="font-weight:700;color:${a.balance_amount > 0 ? 'var(--orange)' : 'var(--green)'}">₹${a.balance_amount.toLocaleString('en-IN')}</td>
          <td><span class="badge ${statusClass}">${a.payment_status}</span></td>
          <td class="mono" style="font-size:11.5px;color:var(--text-2)">
            ${a.contract_start ? `${a.contract_start} to ${a.contract_end}` : '—'}
          </td>
        `;

        if (isAdmin) {
          const tdAct = mk('td');
          
          const editBtn = mk('button', 'btn btn-c btn-sm', '✏️ Edit');
          editBtn.style.marginRight = '6px';
          editBtn.onclick = (e) => {
            e.stopPropagation();
            openContractModal(a, sites, () => refreshSalesPage(container));
          };

          const delBtn = mk('button', 'btn btn-danger btn-sm', '🗑️ Delete');
          delBtn.title = 'Delete contract';
          delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete contract for "${a.name}"? This will not delete past transactions but will disconnect this contract.`)) {
              try {
                const res = await fetch(`${API_BASE}/api/sales/analyzers/${a.id}`, { method: 'DELETE', credentials: 'include' });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);
                refreshSalesPage(container);
              } catch (err) {
                alert('Error: ' + err.message);
              }
            }
          };

          tdAct.append(editBtn, delBtn);
          tr.append(tdAct);
        }
        tbody.append(tr);
      });
    };

    // Wire up search & filter listeners
    if (isAdmin || isEngineer) {
      container.querySelector('#analyzerSearch').addEventListener('input', populateAnalyzers);
      container.querySelector('#statusFilter').addEventListener('change', populateAnalyzers);
    }
    populateAnalyzers();


    // ─── 4. TRANSACTIONS / PAYMENTS LEDGER ───
    const ledgerCard = mk('div', 'card');
    const lHeader = mk('div', 'card-h');
    lHeader.innerHTML = `
      <h3>💰 Payment Transactions Ledger</h3>
      <span class="hint">${data.transactions.length} payments logged</span>
    `;
    ledgerCard.append(lHeader);

    const lBody = mk('div', 'tbl-w');
    const lTable = mk('table', 'tbl');
    lTable.innerHTML = `
      <thead>
        <tr>
          <th>Payment Date</th>
          ${(isAdmin || isEngineer) ? '<th>Client / Site</th>' : ''}
          <th>For Analyzer Contract</th>
          <th>Payment Method</th>
          <th>Reference No / ID</th>
          <th>Remarks</th>
          <th>Amount Paid</th>
          ${isAdmin ? '<th>Action</th>' : ''}
        </tr>
      </thead>
      <tbody id="transactionsTableBody"></tbody>
    `;
    lBody.append(lTable);
    ledgerCard.append(lBody);
    container.append(ledgerCard);

    // Populate Transactions Table
    const populateTransactions = () => {
      const tbody = lTable.querySelector('#transactionsTableBody');
      tbody.innerHTML = '';

      if (!data.transactions.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align:center;padding:24px;color:var(--text-2)">No payment transaction history logged yet.</td></tr>`;
        return;
      }

      data.transactions.forEach(t => {
        const tr = mk('tr');
        tr.innerHTML = `
          <td class="mono">${t.payment_date || '—'}</td>
          ${(isAdmin || isEngineer) ? `<td><b>${t.site_name}</b><br><span style="font-size:11px;color:var(--text-3)">${t.site_id}</span></td>` : ''}
          <td><span style="font-weight:600;color:var(--text-1)">${t.analyzer_name || 'General Payment'}</span></td>
          <td><span class="badge grey">${t.payment_method}</span></td>
          <td class="mono" style="color:var(--cyan-l);font-size:12px">${t.reference_no || '—'}</td>
          <td style="color:var(--text-2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.remarks || ''}">${t.remarks || '—'}</td>
          <td class="mono" style="font-weight:700;color:var(--green)">₹${t.amount.toLocaleString('en-IN')}</td>
        `;

        if (isAdmin) {
          const tdAct = mk('td');
          const delBtn = mk('button', 'btn btn-danger btn-sm', '🗑️ Delete');
          delBtn.onclick = async () => {
            if (confirm(`Remove this transaction of ₹${t.amount.toLocaleString('en-IN')}? Outstanding balances will be recalculated.`)) {
              try {
                const res = await fetch(`${API_BASE}/api/sales/transactions/${t.id}`, { method: 'DELETE', credentials: 'include' });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);
                refreshSalesPage(container);
              } catch (err) {
                alert('Error: ' + err.message);
              }
            }
          };
          tdAct.append(delBtn);
          tr.append(tdAct);
        }
        tbody.append(tr);
      });
    };
    populateTransactions();

  } catch (err) {
    loading.remove();
    const errBox = mk('div', 'error-box', `⚠️ Error loading sales details: ${err.message}`);
    container.append(errBox);
  }

  return container;
}

// Function to refresh the sales page
async function refreshSalesPage(container) {
  const parent = container.parentElement;
  if (!parent) return;
  const newEl = await vSales();
  container.replaceWith(newEl);
}

// ─── CONTRACT MODAL ───
function openContractModal(analyzer, sites, onSave) {
  // Remove existing modal if any
  const old = document.getElementById('salesContractModal');
  if (old) old.remove();

  const isEdit = !!analyzer;
  const modalBg = mk('div', 'modal-bg show');
  modalBg.id = 'salesContractModal';

  const modal = mk('div', 'modal');
  modal.style.maxWidth = '480px';
  modal.innerHTML = `
    <div class="modal-h">
      <h3>${isEdit ? '✏️ Edit Analyzer Contract' : '🏭 Add Analyzer Contract'}</h3>
      <span class="modal-close">✕</span>
    </div>
    <div class="modal-b">
      <form id="contractForm" novalidate>
        <div class="form-grid" style="grid-template-columns: 1fr">
          <div class="form-group">
            <label for="cSiteId">Select Client Site *</label>
            <select id="cSiteId" required ${isEdit ? 'disabled' : ''}>
              ${sites.map(s => `<option value="${s.id}" ${analyzer?.site_id === s.id ? 'selected' : ''}>${s.name} (${s.id})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="cName">Analyzer / Contract Name *</label>
            <input type="text" id="cName" placeholder="e.g. CEMS Stack Gas Analyzer" value="${analyzer?.name || ''}" required>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
              <label for="cAmc">AMC Amount (₹) *</label>
              <input type="number" id="cAmc" value="${analyzer?.amc_amount ?? 0}" required min="0">
            </div>
            <div class="form-group">
              <label for="cCmc">CMC Amount (₹) *</label>
              <input type="number" id="cCmc" value="${analyzer?.cmc_amount ?? 0}" required min="0">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
              <label for="cBalance">Outstanding Balance (₹)</label>
              <input type="number" id="cBalance" value="${analyzer?.balance_amount ?? 0}" min="0" placeholder="If left empty, defaults to AMC+CMC">
            </div>
            <div class="form-group">
              <label for="cStatus">Payment Status</label>
              <select id="cStatus">
                <option value="Pending" ${analyzer?.payment_status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Partially Paid" ${analyzer?.payment_status === 'Partially Paid' ? 'selected' : ''}>Partially Paid</option>
                <option value="Paid" ${analyzer?.payment_status === 'Paid' ? 'selected' : ''}>Paid</option>
                <option value="Overdue" ${analyzer?.payment_status === 'Overdue' ? 'selected' : ''}>Overdue</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
              <label for="cStart">Contract Start Date</label>
              <input type="date" id="cStart" value="${analyzer?.contract_start || ''}">
            </div>
            <div class="form-group">
              <label for="cEnd">Contract End Date</label>
              <input type="date" id="cEnd" value="${analyzer?.contract_end || ''}">
            </div>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
          <button type="button" class="btn btn-g btn-cancel">Cancel</button>
          <button type="submit" class="btn btn-p">${isEdit ? 'Save Changes' : 'Create Contract'}</button>
        </div>
      </form>
    </div>
  `;

  // Close handers
  const close = () => modalBg.remove();
  modal.querySelector('.modal-close').onclick = close;
  modal.querySelector('.btn-cancel').onclick = close;

  // Submit handler
  modal.querySelector('#contractForm').onsubmit = async (e) => {
    e.preventDefault();
    const site_id = modal.querySelector('#cSiteId').value;
    const name = modal.querySelector('#cName').value.trim();
    const amc_amount = parseFloat(modal.querySelector('#cAmc').value || '0');
    const cmc_amount = parseFloat(modal.querySelector('#cCmc').value || '0');
    let balance_amount = modal.querySelector('#cBalance').value;
    if (balance_amount === '') {
      balance_amount = amc_amount + cmc_amount;
    } else {
      balance_amount = parseFloat(balance_amount);
    }
    const payment_status = modal.querySelector('#cStatus').value;
    const contract_start = modal.querySelector('#cStart').value;
    const contract_end = modal.querySelector('#cEnd').value;

    if (!name) return alert('Contract/Analyzer name is required');

    try {
      const url = isEdit ? `${API_BASE}/api/sales/analyzers/${analyzer.id}` : `${API_BASE}/api/sales/analyzers`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = { site_id, name, amc_amount, cmc_amount, balance_amount, payment_status, contract_start, contract_end };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      close();
      onSave();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  modalBg.append(modal);
  document.body.append(modalBg);
}

// ─── PAYMENT MODAL ───
function openPaymentModal(sites, analyzers, onSave) {
  // Remove existing modal if any
  const old = document.getElementById('salesPaymentModal');
  if (old) old.remove();

  const modalBg = mk('div', 'modal-bg show');
  modalBg.id = 'salesPaymentModal';

  const modal = mk('div', 'modal');
  modal.style.maxWidth = '450px';
  modal.innerHTML = `
    <div class="modal-h">
      <h3>💰 Record Payment Transaction</h3>
      <span class="modal-close">✕</span>
    </div>
    <div class="modal-b">
      <form id="paymentForm" novalidate>
        <div class="form-grid" style="grid-template-columns: 1fr">
          <div class="form-group">
            <label for="pSiteId">Select Client Site *</label>
            <select id="pSiteId" required>
              <option value="">-- Choose Client Site --</option>
              ${sites.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="pAnalyzerId">Select Analyzer Contract (Optional)</label>
            <select id="pAnalyzerId">
              <option value="">General Site Payment</option>
            </select>
          </div>
          <div class="form-group">
            <label for="pAmount">Payment Amount (₹) *</label>
            <input type="number" id="pAmount" placeholder="e.g. 50000" required min="1">
          </div>
          <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px">
            <div class="form-group">
              <label for="pDate">Payment Date *</label>
              <input type="date" id="pDate" required>
            </div>
            <div class="form-group">
              <label for="pMethod">Method *</label>
              <select id="pMethod">
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI / Net Banking</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="pRef">Reference Number / Transaction ID</label>
            <input type="text" id="pRef" placeholder="e.g. UPI txn ref or cheque number">
          </div>
          <div class="form-group">
            <label for="pRemarks">Remarks</label>
            <input type="text" id="pRemarks" placeholder="e.g. Advance AMC payment">
          </div>
        </div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
          <button type="button" class="btn btn-g btn-cancel">Cancel</button>
          <button type="submit" class="btn btn-p">Record Payment</button>
        </div>
      </form>
    </div>
  `;

  // Close handers
  const close = () => modalBg.remove();
  modal.querySelector('.modal-close').onclick = close;
  modal.querySelector('.btn-cancel').onclick = close;

  const siteSelect = modal.querySelector('#pSiteId');
  const analyzerSelect = modal.querySelector('#pAnalyzerId');

  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  modal.querySelector('#pDate').value = today;

  // Dynamically update analyzers dropdown based on selected site
  siteSelect.onchange = () => {
    const siteId = siteSelect.value;
    analyzerSelect.innerHTML = '<option value="">General Site Payment</option>';
    if (!siteId) return;

    const filtered = analyzers.filter(a => a.site_id === siteId);
    filtered.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.name} (Outstanding: ₹${a.balance_amount.toLocaleString('en-IN')})`;
      analyzerSelect.append(opt);
    });
  };

  // Submit handler
  modal.querySelector('#paymentForm').onsubmit = async (e) => {
    e.preventDefault();
    const site_id = siteSelect.value;
    const analyzer_id = analyzerSelect.value;
    const amount = parseFloat(modal.querySelector('#pAmount').value || '0');
    const payment_date = modal.querySelector('#pDate').value;
    const payment_method = modal.querySelector('#pMethod').value;
    const reference_no = modal.querySelector('#pRef').value.trim();
    const remarks = modal.querySelector('#pRemarks').value.trim();

    if (!site_id) return alert('Client site is required');
    if (amount <= 0) return alert('Payment amount must be greater than zero');
    if (!payment_date) return alert('Payment date is required');

    try {
      const res = await fetch(`${API_BASE}/api/sales/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ site_id, analyzer_id: analyzer_id || null, amount, payment_date, payment_method, reference_no, remarks })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      close();
      onSave();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  modalBg.append(modal);
  document.body.append(modalBg);
}

// SCOPED CUSTOM STYLING BLOCK FOR THE SALES & PAYMENTS SECTION
function addSalesStyles() {
  const styleId = 'sales-custom-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .sales-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--r);
      padding: 16px 20px;
      box-shadow: var(--sha-sm);
      position: relative;
      overflow: hidden;
      transition: all 0.2s var(--ease);
    }
    .stat-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--purple), var(--cyan));
      opacity: 0.7;
    }
    .stat-card.paid::after {
      background: linear-gradient(90deg, var(--green), #059669);
    }
    .stat-card.bal::after {
      background: linear-gradient(90deg, var(--orange), var(--red));
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-hi);
      box-shadow: var(--sha-md);
    }
    .sc-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-2);
      letter-spacing: 0.05em;
    }
    .sc-val {
      font-size: 26px;
      font-weight: 800;
      color: var(--text-1);
      margin: 8px 0 4px 0;
      font-family: var(--mono);
    }
    .sc-sub {
      font-size: 11px;
      color: var(--text-3);
    }
    .sales-action-bar {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 12px 18px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: var(--sha-sm);
    }
    .badge.orange {
      background: rgba(249, 115, 22, 0.15);
      color: var(--orange);
      border: 1px solid rgba(249, 115, 22, 0.3);
    }
  `;
  document.head.append(style);
}
