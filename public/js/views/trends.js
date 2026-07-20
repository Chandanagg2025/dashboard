/**
 * trends.js — Trend analysis view
 */
import { mk } from '../utils.js';
import { fetchSites, fetchKpis } from '../api.js';

const CHARTS = {};

export async function vTrends() {
  const wrap = mk('div');

  const p1 = mk('div','card'); p1.style.marginBottom='20px';
  p1.innerHTML = `<div class="card-h"><h3>Multi-Site PM₁₀ Comparison</h3><span class="hint">Last 24 readings</span></div>
    <div class="card-b"><div class="cw ch-lg"><canvas id="chTrends"></canvas></div></div>`;
  wrap.append(p1);

  const p2  = mk('div','two-col');
  const p2a = mk('div','card');
  p2a.innerHTML = `<div class="card-h"><h3>Compliance Distribution</h3><span class="hint">Current snapshot</span></div>
    <div class="card-b"><div class="cw ch-md"><canvas id="chDist"></canvas></div></div>`;
  const p2b = mk('div','card');
  p2b.innerHTML = `<div class="card-h"><h3>Parameter Exceedance Rate</h3><span class="hint">% sites exceeding limit</span></div>
    <div class="card-b"><div class="cw ch-md"><canvas id="chExcRate"></canvas></div></div>`;
  p2.append(p2a,p2b); wrap.append(p2);

  try {
    const [sites, kpis] = await Promise.all([fetchSites(), fetchKpis()]);

    setTimeout(() => {
      // Multi-site PM₁₀ trend
      const cv = document.getElementById('chTrends');
      if (cv && window.Chart) {
        const pal      = ['#7c3aed','#06b6d4','#f97316','#10b981','#ec4899'];
        const withPM   = sites.filter(s => (s.params||[]).find(p=>p.key==='PM₁₀')).slice(0,5);
        if (withPM.length) {
          const ds = withPM.map((s,i) => {
            const p    = s.params.find(p=>p.key==='PM₁₀');
            const hist = Array.isArray(p.history)?p.history:JSON.parse(p.history||'[]');
            return { label:s.city, data:hist, borderColor:pal[i%5], borderWidth:2, pointRadius:0, tension:.4, fill:false };
          });
          const firstHist = Array.isArray(withPM[0].params[0].history)?withPM[0].params[0].history:JSON.parse(withPM[0].params[0].history||'[]');
          const lbls = firstHist.map((_,i)=>'-'+(23-i)*15+'m');
          if (CHARTS.trn) { try{CHARTS.trn.destroy();}catch(e){} }
          CHARTS.trn = new Chart(cv, {
            type:'line', data:{ labels:lbls, datasets:ds },
            options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
              plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 }, color:'#7a8aaa' } } },
              scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(255,255,255,.05)' }, ticks:{ color:'#7a8aaa' } },
                x:{ grid:{ display:false }, ticks:{ maxTicksLimit:8, color:'#7a8aaa' } } } },
          });
        } else { cv.parentElement.innerHTML='<div class="empty">No PM₁₀ data available.</div>'; }
      }

      // Compliance distribution
      const cv2 = document.getElementById('chDist');
      if (cv2 && window.Chart) {
        if (CHARTS.dst) { try{CHARTS.dst.destroy();}catch(e){} }
        CHARTS.dst = new Chart(cv2, {
          type:'doughnut',
          data:{ labels:['Compliant','Warning','Exceedance','Offline'],
            datasets:[{ data:[kpis.green,kpis.yellow,kpis.exc,kpis.offline],
              backgroundColor:['#10b981','#f59e0b','#ef4444','#6b7280'], borderWidth:0, hoverOffset:8 }] },
          options:{ responsive:true, maintainAspectRatio:false, cutout:'60%',
            plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:11 }, color:'#7a8aaa' } } } },
        });
      }

      // Exceedance rate
      const cv3 = document.getElementById('chExcRate');
      if (cv3 && window.Chart) {
        const paramKeys = [...new Set(sites.flatMap(s=>(s.params||[]).map(p=>p.key)))].slice(0,6);
        const rates = paramKeys.map(k => {
          const sitesWithP = sites.filter(s=>(s.params||[]).find(p=>p.key===k));
          const exc = sitesWithP.filter(s=>(s.params||[]).find(p=>p.key===k&&['yellow','red'].includes(p.sig)));
          return sitesWithP.length ? Math.round(exc.length/sitesWithP.length*100) : 0;
        });
        if (CHARTS.er) { try{CHARTS.er.destroy();}catch(e){} }
        CHARTS.er = new Chart(cv3, {
          type:'bar',
          data:{ labels:paramKeys, datasets:[{ data:rates,
            backgroundColor:rates.map(r=>r>50?'#ef4444':r>25?'#f59e0b':'#10b981'),
            borderRadius:7, borderSkipped:false }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
            scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+'%', color:'#7a8aaa' }, grid:{ color:'rgba(255,255,255,.05)' } },
              x:{ ticks:{ color:'#7a8aaa' }, grid:{ display:false } } } },
        });
      }
    }, 50);

  } catch(err) {
    wrap.innerHTML = `<div class="error-box">⚠️ ${err.message}</div>`;
  }

  return wrap;
}
