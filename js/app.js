// ── State ──
let S = { start:'', end:'', compare:false, cmpStart:'', cmpEnd:'' };

// ── Filter UI ──
function onQuickChange() {
  const v = document.getElementById('quickPeriod').value;
  if (v==='custom') return;
  const {s,e} = PRESETS[v]();
  document.getElementById('startDate').value = s;
  document.getElementById('endDate').value   = e;
  calcCmpDates();
  applyFilter();
}

function onDateManual() {
  document.getElementById('quickPeriod').value = 'custom';
  calcCmpDates();
}

function toggleCmp() {
  const on = document.getElementById('cmpCheck').checked;
  document.getElementById('cmpFields').classList.toggle('show', on);
  S.compare = on;
  if (on) calcCmpDates();
}

function calcCmpDates() {
  const mode       = document.getElementById('cmpMode').value;
  const s          = document.getElementById('startDate').value;
  const e          = document.getElementById('endDate').value;
  const cmpStartEl = document.getElementById('cmpStart');
  const cmpEndEl   = document.getElementById('cmpEnd');
  if (mode==='custom') { cmpStartEl.removeAttribute('readonly'); cmpEndEl.removeAttribute('readonly'); return; }
  cmpStartEl.setAttribute('readonly','');
  cmpEndEl.setAttribute('readonly','');
  if (!s||!e) return;
  const cmp = calcCmp(mode, s, e);
  if (cmp) { cmpStartEl.value=cmp.s; cmpEndEl.value=cmp.e; }
}

function applyFilter() {
  const s = document.getElementById('startDate').value;
  const e = document.getElementById('endDate').value;
  if (!s||!e) { alert('Selecione as datas de início e fim.'); return; }
  S.start    = s;
  S.end      = e;
  S.compare  = document.getElementById('cmpCheck').checked;
  S.cmpStart = document.getElementById('cmpStart').value;
  S.cmpEnd   = document.getElementById('cmpEnd').value;
  document.getElementById('headerPeriod').textContent = `${disp(s)} → ${disp(e)}`;
  renderTab(activeTab);
}

// ── Tabs ──
const TABS = [
  {id:'geral',        label:'📊 Visão Geral'}, // retrabalhada em 03/09/2026 — resumo consolidado, ver geral.js
  {id:'diario',       label:'📅 Diário'},
  // {id:'aniversario',  label:'🎂 Aniversário'}, // oculta a pedido do usuário (26/08/2026)
  {id:'google',       label:'🔵 Google Ads'},
  {id:'meta',         label:'🟡 Meta Ads'},
  {id:'afiliados',    label:'🤝 Afiliados/Influenciadores'}, // campanha meta_leads_fundo_afiliados separada do Meta Ads em 03/09/2026
  {id:'bing',         label:'🟢 Bing Ads'},
  {id:'tiktok',       label:'⚫ TikTok Ads'},
  // {id:'mexico',       label:'🇲🇽 México'}, // oculta a pedido do usuário (26/08/2026)
  {id:'instagram',    label:'📸 Instagram Orgânico'},
  {id:'seo',          label:'🔍 Busca Orgânica'},
  {id:'lp',           label:'🎯 LPs'},
  {id:'sync',         label:'⚙️ Sincronização'},
];

let activeTab = 'diario';

async function renderTab(id) {
  const fns = { geral:tabGeral, diario:tabDiario, aniversario:tabAniversario, google:tabGoogle, meta:tabMeta, afiliados:tabAfiliados, bing:tabBing, tiktok:tabTiktok, mexico:tabMexico, instagram:tabInstagram, seo:tabSeo, ga4:tabGA4, lp:tabLP, sync:tabSync };
  try { await (fns[id] || tabGeral)(); }
  catch(e) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center;padding:40px">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px">Erro ao carregar dados</div>
        <div style="font-size:13px;color:#212121BF">${e.message}</div>
      </div>`;
  }
}

// ── Meta token alert ──
async function checkMetaToken() {
  try {
    const r = await fetch(`${SURL}/functions/v1/check-meta-token`, {
      headers: { Authorization: `Bearer ${SKEY}` }
    });
    const d = await r.json();
    if (d.error || !d.valid) {
      showTokenAlert('❌ Token Meta Ads inválido ou expirado! Renove agora para não perder dados.', '#e05a69', '#e05a6944', '#e05a6918');
      return;
    }
    if (d.never_expires) return;
    if (d.days_left <= 14) {
      const cor = d.days_left <= 5 ? '#e05a69' : '#ed723e';
      const bdr = d.days_left <= 5 ? '#e05a6944' : '#ed723e44';
      const bg  = d.days_left <= 5 ? '#e05a6918' : '#ed723e18';
      showTokenAlert(`⚠️ Token Meta Ads expira em <strong>${d.days_left} dias</strong>. Renove antes de ${new Date(d.expires_at*1000).toLocaleDateString('pt-BR')}.`, cor, bdr, bg);
    }
  } catch(_) {}
}

function showTokenAlert(html, cor, bdr, bg) {
  const el = document.getElementById('tokenAlert');
  el.style.background = bg;
  el.style.borderBottomColor = bdr;
  el.querySelector('.token-alert-text').innerHTML = html;
  el.querySelector('.token-alert-text').style.color = cor;
  el.querySelector('.token-alert-close').style.color = cor;
  el.style.display = 'block';
}

// ── Init ──
function init() {
  const {s,e} = PRESETS.mes();
  document.getElementById('startDate').value = s;
  document.getElementById('endDate').value   = e;
  S.start = s; S.end = e;
  document.getElementById('headerPeriod').textContent = `${disp(s)} → ${disp(e)}`;

  const bar = document.getElementById('tabBar');
  bar.innerHTML = TABS.map(t=>`<button class="tab${t.id===activeTab?' active':''}" data-id="${t.id}">${t.label}</button>`).join('');
  bar.addEventListener('click', async e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    activeTab = btn.dataset.id;
    bar.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.id===activeTab));
    await renderTab(activeTab);
  });

  renderTab(activeTab);
  checkMetaToken();
}

// Chamado por js/auth.js depois de confirmar a sessão (login por código @jusfy.com.br)
function startDashboard() {
  const s = getSession();
  if (s && s.email) {
    const el = document.getElementById('headerUser');
    if (el) el.textContent = s.email;
  }
  init();
}
