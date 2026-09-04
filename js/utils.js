// ── Date utils ──
const fmt    = d => d.toISOString().slice(0,10);
const disp   = s => new Date(s+'T12:00:00').toLocaleDateString('pt-BR');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const today     = () => fmt(new Date());
const yesterday = () => fmt(addDays(new Date(), -1));

const PRESETS = {
  hoje:   () => { const t=today();     return {s:t,e:t}; },
  ontem:  () => { const y=yesterday(); return {s:y,e:y}; },
  '7d':   () => { const e=yesterday(); return {s:fmt(addDays(new Date(e),-6)),e}; },
  '14d':  () => { const e=yesterday(); return {s:fmt(addDays(new Date(e),-13)),e}; },
  '30d':  () => { const e=yesterday(); return {s:fmt(addDays(new Date(e),-29)),e}; },
  mes:    () => { const t=new Date(); const s=new Date(t.getFullYear(),t.getMonth(),1); const y=addDays(new Date(),-1); const e=y<s?today():fmt(y); return {s:fmt(s),e}; },
  mesant: () => { const t=new Date(); const s=new Date(t.getFullYear(),t.getMonth()-1,1); const e=new Date(t.getFullYear(),t.getMonth(),0); return {s:fmt(s),e:fmt(e)}; },
};

function calcCmp(mode, s, e) {
  const d1=new Date(s+'T12:00:00'), d2=new Date(e+'T12:00:00');
  const n=Math.round((d2-d1)/864e5);
  if (mode==='anterior') {
    const ce=new Date(d1); ce.setDate(ce.getDate()-1);
    const cs=new Date(ce); cs.setDate(cs.getDate()-n);
    return {s:fmt(cs),e:fmt(ce)};
  }
  if (mode==='mesant') {
    const cs=new Date(d1); cs.setMonth(cs.getMonth()-1);
    const ce=new Date(d2); ce.setMonth(ce.getMonth()-1);
    return {s:fmt(cs),e:fmt(ce)};
  }
  if (mode==='anoant') {
    const cs=new Date(d1); cs.setFullYear(cs.getFullYear()-1);
    const ce=new Date(d2); ce.setFullYear(ce.getFullYear()-1);
    return {s:fmt(cs),e:fmt(ce)};
  }
  return null;
}

// ── Format helpers ──
const fR = n => n!=null&&!isNaN(n) ? 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const fN = n => n!=null&&!isNaN(n) ? Number(n).toLocaleString('pt-BR') : '—';
const fP = n => n!=null&&!isNaN(n) ? Number(n).toFixed(2)+'%' : '—';

// ── Data helpers ──
const sum = (arr, k) => arr.reduce((s,r)=>s+(+r[k]||0), 0);

// Categoria da campanha (Non brand / Brand Search), derivada do nome — segue a mesma convenção
// de nomenclatura já usada (google_brandsearch_vendas_search_... vs google_nonbrand_vendas_...).
function campaignCategory(campaignName) {
  return (campaignName||'').toLowerCase().includes('brandsearch') ? 'Brand Search' : 'Non brand';
}

function aggCamps(rows) {
  const m = {};
  for (const r of rows) {
    const k = `${r.platform}||${r.campaign_name}`;
    if (!m[k]) m[k] = {platform:r.platform,campaign_name:r.campaign_name,spend:0,clicks:0,impressions:0,conversions:0};
    m[k].spend       += +r.spend||0;
    m[k].clicks      += +r.clicks||0;
    m[k].impressions += +r.impressions||0;
    m[k].conversions += +r.conversions||0;
  }
  return Object.values(m).map(r=>({...r,
    ctr: r.impressions>0 ? r.clicks/r.impressions*100 : 0,
    cpa: r.conversions>0 ? r.spend/r.conversions : null
  }));
}

function aggGA4(rows) {
  const m = {};
  for (const r of rows) {
    const k = `${r.channel}||${r.campaign}`;
    if (!m[k]) m[k] = {channel:r.channel,campaign:r.campaign,sessions:0,conversions:0,revenue:0};
    m[k].sessions    += +r.sessions||0;
    m[k].conversions += +r.conversions||0;
    m[k].revenue     += +r.revenue||0;
  }
  return Object.values(m).map(r=>({...r,
    conversion_rate: r.sessions>0 ? r.conversions/r.sessions*100 : 0
  }));
}

// ── Fetch helpers ──

// RPCs agregados (retornam poucos registros, muito mais rápido)
async function fetchCampAgg(s, e)              { return supaRpc('get_camp_agg',                  { p_start: s, p_end: e }); }
async function fetchCampDailyAgg(s, e)         { return supaRpc('get_camp_daily_agg',            { p_start: s, p_end: e }); }
async function fetchCampDailyByPlatform(s, e)  { return supaRpc('get_camp_daily_by_platform',    { p_start: s, p_end: e }); }
async function fetchGA4DailyAgg(s, e)          { return supaRpc('get_ga4_daily_agg',             { p_start: s, p_end: e }); }
async function fetchGA4ChannelsAgg(s, e)       { return supaRpc('get_ga4_channels_agg',          { p_start: s, p_end: e }); }
async function fetchLPAgg(s, e)                { return supaRpc('get_ga4_landing_pages_agg',     { p_start: s, p_end: e }); }
async function fetchGoogleLPAgg(s, e)          { return supaRpc('get_google_landing_pages_agg',  { p_start: s, p_end: e }); }
async function fetchCheckoutAgg(s, e)          { return supaRpc('get_ga4_checkout_pages_agg',    { p_start: s, p_end: e }); }
async function fetchGA4SessionsByCampaign(s, e) { return supaRpc('get_ga4_sessions_by_campaign', { p_start: s, p_end: e }); }
async function fetchJusfyConversionsByCampaign(s, e) { return supaRpc('get_jusfy_conversions_by_campaign', { p_start: s, p_end: e }); }
async function fetchJusfyConversionsTotals(s, e) { return supaRpc('get_jusfy_conversions_totals', { p_start: s, p_end: e }); }
async function fetchJusfyConversionsDailyAgg(s, e) { return supaRpc('get_jusfy_conversions_daily_agg', { p_start: s, p_end: e }); }
async function fetchInstagramMediaAgg(s, e)        { return supaRpc('get_instagram_media_agg',        { p_start: s, p_end: e }); }
async function fetchInstagramAccountDailyAgg(s, e) { return supaRpc('get_instagram_account_daily_agg', { p_start: s, p_end: e }); }
async function fetchCreativeRealConversions(s, e)  { return supaRpc('get_creative_real_conversions',   { p_start: s, p_end: e }); }
async function fetchKeywordPerformance(s, e, aliases) { return supaRpc('get_keyword_performance', { p_start: s, p_end: e, p_aliases: aliases || {} }); }
async function fetchGscTotals(s, e)            { const r = await supaRpc('get_gsc_totals', { p_start: s, p_end: e }); return r[0] || {}; }
async function fetchGscDailyAgg(s, e)          { return supaRpc('get_gsc_daily_agg', { p_start: s, p_end: e }); }
async function fetchGscTopQueries(s, e, limit=30, brandOnly=true) { return supaRpc('get_gsc_top_queries', { p_start: s, p_end: e, p_limit: limit, p_brand_only: brandOnly }); }

// ── Match de conversões reais (Metabase) — ver js/conversions-match.js ──

// ── Gráfico combinado (barras empilhadas + linha), usado em Geral/Google/Meta/Bing ──
function fAxisCompact(n) {
  if (n == null || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'').replace('.', ',') + 'M';
  if (abs >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'').replace('.', ',') + 'k';
  return String(Math.round(n));
}

const _comboCharts = {};

// barDatasets: [{label, data, backgroundColor}] — sempre em R$, eixo y (esquerda).
// lineDatasets: [{label, data, borderColor, yAxisID}] — yAxisID 'y' (R$, ex: CAC) ou 'y1' (contagem, ex: Cadastros Reais).
function renderComboChart(canvasId, labels, barDatasets, lineDatasets) {
  const canvas = document.getElementById(canvasId);
  if (_comboCharts[canvasId]) { _comboCharts[canvasId].destroy(); delete _comboCharts[canvasId]; }
  if (!canvas || !labels.length) return;

  const y1Line  = lineDatasets.find(d => (d.yAxisID||'y1') === 'y1') || lineDatasets[0];
  const y1Color = (y1Line && y1Line.borderColor) || '#02A378';
  const y1Label = (y1Line && y1Line.label) || 'Cadastros';

  // Chart.js desenha em ordem crescente de "order" — quem desenha por último fica na frente.
  // As barras precisam de order menor (fundo) e as linhas de order maior (frente).
  const datasets = [
    ...barDatasets.map(d => ({ type:'bar', borderRadius:4, borderWidth:0, stack:'spend', yAxisID:'y', order:1, ...d })),
    ...lineDatasets.map(d => ({ type:'line', borderWidth:3, pointBorderWidth:2, pointRadius:3,
      tension:.3, fill:false, backgroundColor:'#ffffff', yAxisID:'y1', order:2, pointBackgroundColor:d.borderColor, ...d })),
  ];

  _comboCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    data: { labels, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      scales:{
        x:{ stacked:true, grid:{display:false}, ticks:{color:'#212121BF', font:{size:10}} },
        y:{ stacked:true, position:'left', grid:{color:'#FAFAFA'},
            ticks:{color:'#212121BF', font:{size:10}, callback:v=>'R$ '+fAxisCompact(v)},
            title:{display:true, text:'Investimento / CAC (R$)', color:'#212121BF', font:{size:10,weight:'600'}} },
        y1:{ position:'right', grid:{drawOnChartArea:false},
             ticks:{color:y1Color, font:{size:10}, callback:v=>fAxisCompact(v)},
             title:{display:true, text:y1Label, color:y1Color, font:{size:10,weight:'600'}} },
      },
      plugins:{
        legend:{display:true, position:'top', align:'end', labels:{color:'#212121', boxWidth:10, usePointStyle:true, font:{size:11}}},
        tooltip:{
          backgroundColor:'#212121', titleColor:'#fff', bodyColor:'#fff', padding:10, cornerRadius:8,
          callbacks:{ label: ctx => (ctx.dataset.type==='bar' || ctx.dataset.yAxisID==='y')
            ? `${ctx.dataset.label}: ${fR(ctx.parsed.y)}` : `${ctx.dataset.label}: ${fN(ctx.parsed.y)}` },
        },
      },
    },
  });
}

// Agrupa saída de get_jusfy_conversions_daily_agg em {data: {canal: clientes_unicos}}, usando a mesma
// classificação por campanha/referral do resto do app (ver classifyRealConversionChannel).
function aggregateDailyRealConversionsByChannel(rows, campaignLookup) {
  const byDate = {};
  for (const r of rows||[]) {
    const ch = classifyRealConversionChannel(r, campaignLookup);
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][ch] = (byDate[r.date][ch]||0) + (+r.clientes_unicos||0);
  }
  return byDate;
}

// ── Seletor de granularidade do gráfico (Dia/Semana/Mês/Ano) — a pedido do usuário em 04/09/2026.
// Estado compartilhado entre todos os gráficos do dash: mesmo período selecionado no topo → mesma
// granularidade "automática" em todo lugar, e trocar num gráfico não perde a escolha ao trocar de
// aba. Troca só reagrupa os dados diários já carregados (buildComboChartSeries), não busca nada de
// novo — por isso os tabs guardam os mapas por data (spendByDate/channelConvMap) e reconstroem a
// série a cada troca, em vez de guardar só a série já pronta.
let _chartGranularity = null; // null = automático (ver chartAutoGranularity)
const CHART_GRANULARITIES = [['dia','Dia'],['semana','Semana'],['mes','Mês'],['ano','Ano']];
// Duas concordâncias porque os títulos dos cards usam o adjetivo de jeitos diferentes
// ("Investimento Diário" masc. sing. vs "Conversões Diárias" fem. plural).
const CHART_GRAN_ADJ = {
  masc:   { dia:'Diário',  semana:'Semanal',  mes:'Mensal',  ano:'Anual'  },
  fem_pl: { dia:'Diárias', semana:'Semanais', mes:'Mensais', ano:'Anuais' },
};

function chartAutoGranularity() {
  const diffDays = (new Date(S.end) - new Date(S.start)) / 864e5;
  return diffDays <= 45 ? 'dia' : 'mes';
}
function currentChartGranularity() { return _chartGranularity || chartAutoGranularity(); }

function setChartGranularity(gran, rerenderFnName) {
  _chartGranularity = gran;
  const fn = window[rerenderFnName];
  if (typeof fn === 'function') fn();
}

function renderGranularityPicker(rerenderFnName) {
  const current = currentChartGranularity();
  return `<div class="gran-picker">${CHART_GRANULARITIES.map(([val,label]) => `
    <button type="button" class="gran-btn${val===current?' active':''}" onclick="setChartGranularity('${val}','${rerenderFnName}')">${label}</button>
  `).join('')}</div>`;
}

// Título do card do gráfico (com o adjetivo de granularidade embutido) + o seletor, prontos pro
// container flex de `.card-title`. `adjForm` é 'masc' ou 'fem_pl' (ver CHART_GRAN_ADJ acima).
function chartTitleWithGranularity(prefix, adjForm, suffix, rerenderFnName) {
  const adj = CHART_GRAN_ADJ[adjForm][currentChartGranularity()];
  return `<span>${prefix} ${adj}${suffix}</span>${renderGranularityPicker(rerenderFnName)}`;
}

// Chave de agrupamento por granularidade (usada tanto pro bucket quanto, ordenada, pro eixo x).
function chartBucketKey(dateStr, granularity) {
  if (granularity === 'ano') return dateStr.slice(0,4);
  if (granularity === 'mes') return dateStr.slice(0,7);
  if (granularity === 'semana') {
    const d = new Date(dateStr+'T12:00:00');
    return fmt(addDays(d, -d.getDay())); // domingo daquela semana (mesma convenção de WEEKDAY_LABELS)
  }
  return dateStr; // dia
}
function chartBucketLabel(key, granularity) {
  if (granularity === 'ano') return key;
  if (granularity === 'mes') return new Date(key+'-15').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
  return key.slice(5).split('-').reverse().join('/'); // dia e semana (semana = data do domingo)
}

// Constrói labels e arrays alinhados de gasto+conversões, pra alimentar renderComboChart.
// platformSpendMap: {date: valor}. channelConvMap: {date:{canal:qtd}}. `granularity` omitido =
// automático (ver chartAutoGranularity — mantém o comportamento histórico pra quem ainda não usa
// o seletor).
function buildComboChartSeries(start, end, platformSpendMap, channelConvMap, channelLabel, granularity) {
  const days = Object.keys(platformSpendMap).sort();
  const gran = granularity || (((new Date(end) - new Date(start)) / 864e5) <= 45 ? 'dia' : 'mes');

  const cacOf = (spend, conv) => conv > 0 ? spend / conv : null;

  const buckets = {};
  for (const d of days) {
    const key = chartBucketKey(d, gran);
    if (!buckets[key]) buckets[key] = { spend:0, conv:0 };
    buckets[key].spend += (platformSpendMap[d] || 0);
    buckets[key].conv  += (channelConvMap[d] && channelConvMap[d][channelLabel]) || 0;
  }
  const keys = Object.keys(buckets).sort();
  const spend = keys.map(k => buckets[k].spend);
  const conv  = keys.map(k => buckets[k].conv);
  return {
    labels: keys.map(k => chartBucketLabel(k, gran)),
    spend, conv,
    cac: spend.map((s,i) => cacOf(s, conv[i])),
  };
}

// Raw — mantidos para compatibilidade (criativos ainda precisam de linha por linha)
async function fetchCamps(s, e) {
  return supa(`campaign_daily?select=*&date=gte.${s}&date=lte.${e}&order=date.asc`);
}
async function fetchGA4(s, e) {
  return supa(`ga4_conversions?select=*&date=gte.${s}&date=lte.${e}&order=date.asc`);
}
async function fetchLogs() {
  return supa(`sync_logs?select=*&order=finished_at.desc&limit=20`);
}
async function fetchMetaCreatives(s, e) {
  return supa(`meta_creatives?select=*&date=gte.${s}&date=lte.${e}&order=date.asc`);
}
// Jusfy México (JusGPT) — cadastros/status vêm de BigQuery via Metabase (sem PII), spend vem do
// Google Ads MX (Edge Function própria, platform 'google_ads_mx'). Ver Notion: Plano — Dashboard
// de Ads (MVP), Sessão 12.
async function fetchMxConversionsDaily(s, e) {
  return supa(`mx_conversions_daily?select=date,cadastros,pending_checkout,pagos&date=gte.${s}&date=lte.${e}&order=date.asc`);
}
async function fetchMxCampaignDaily(s, e) {
  return supa(`mx_campaign_daily?select=*&date=gte.${s}&date=lte.${e}&order=date.asc`);
}
async function fetchGoogleCreatives(s, e) {
  return supa(`google_creatives?select=*&date=gte.${s}&date=lte.${e}&order=date.asc`);
}

// ── UI helpers ──
function deltaHtml(curr, prev, invert=false) {
  if (prev==null||prev===0||!S.compare) return '';
  const d=(curr-prev)/Math.abs(prev);
  const pct=(d*100).toFixed(1);
  const pos=invert ? d<0 : d>0;
  const cls=pos?'d-up':d===0?'d-neu':'d-down';
  const arrow=d>0?'↑':d<0?'↓':'→';
  return `<span class="${cls}">${arrow} ${d>0?'+':''}${pct}%</span>`;
}

function kpiCard(label, val, cmpVal, fFn=fR, cls='c-brand', invert=false) {
  const cmpHtml = S.compare && cmpVal!==undefined
    ? `<div class="kpi-cmp">${fFn(cmpVal)} ${deltaHtml(val,cmpVal,invert)}</div>`
    : (S.compare ? `<div class="kpi-cmp d-neu">Sem comp.</div>` : '');
  return `<div class="card">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value ${cls}">${fFn(val)}</div>
    ${cmpHtml}
  </div>`;
}

// ── Dropdown multi-seleção (checkboxes) genérico — filtros de campanha/conjunto/canal etc.
// Estado global por "key" (ex: 'metaCampFilter'). selected vazio = sem filtro (mostra tudo).
function escAttr(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const _ms = {};

function msState(key) {
  if (!_ms[key]) _ms[key] = { open: false, selected: new Set() };
  return _ms[key];
}

function msReset(key) {
  _ms[key] = { open: false, selected: new Set() };
}

function msToggleOpen(key, onChange) {
  const st = msState(key);
  st.open = !st.open;
  onChange();
  if (st.open) {
    setTimeout(() => document.addEventListener('click', function outside(e) {
      if (e.target.closest(`[data-ms-key="${key}"]`)) return;
      st.open = false;
      document.removeEventListener('click', outside);
      onChange();
    }), 0);
  }
}

function msToggleOption(key, value, onChange) {
  const st = msState(key);
  if (st.selected.has(value)) st.selected.delete(value); else st.selected.add(value);
  onChange();
}

function msClear(key, onChange) {
  msState(key).selected.clear();
  onChange();
}

function msLabel(key, allLabel) {
  const sel = [...msState(key).selected];
  if (sel.length === 0) return allLabel;
  if (sel.length <= 2) return sel.join(', ');
  return `${sel.length} selecionadas`;
}

// changeFn: nome (string) de uma função global sem args, chamada após abrir/marcar/limpar — re-renderiza a tela.
function renderMultiSelect(key, label, allLabel, options, changeFn, minWidth = 240) {
  const st = msState(key);
  return `<div data-ms-key="${key}" style="position:relative;display:flex;align-items:center;gap:10px">
    <label style="font-size:12px;color:#212121BF;white-space:nowrap">${label}</label>
    <button type="button" onclick="event.stopPropagation();msToggleOpen('${key}',${changeFn})"
      style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:${minWidth}px;max-width:360px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(msLabel(key, allLabel))}</span><span style="color:#212121BF;font-size:10px;flex-shrink:0">▾</span>
    </button>
    ${st.open ? `
      <div onclick="event.stopPropagation()" style="position:absolute;top:100%;left:0;margin-top:4px;background:#ffffff;border:1px solid #E7E8EC;border-radius:8px;padding:8px;z-index:20;min-width:${minWidth}px;max-width:420px;max-height:320px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.12)">
        ${options.map(opt => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:13px;border-radius:4px;word-break:break-word" onmouseover="this.style.background='#FAFAFA'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" onchange="msToggleOption('${key}','${escAttr(opt)}',${changeFn})" ${st.selected.has(opt) ? 'checked' : ''} style="cursor:pointer;flex-shrink:0">
            <span>${escHtml(opt)}</span>
          </label>`).join('')}
        <div style="border-top:1px solid #E7E8EC;margin-top:6px;padding-top:6px;text-align:right">
          <button type="button" onclick="msClear('${key}',${changeFn})" style="background:none;border:none;color:#02A378;font-size:12px;cursor:pointer;font-weight:600">Limpar</button>
        </div>
      </div>
    ` : ''}
  </div>`;
}

function loading() {
  document.getElementById('content').innerHTML = `<div class="loading"><div class="spinner"></div>Carregando dados…</div>`;
}

function emptyRow(cols, msg='Sem dados para o período selecionado') {
  return `<tr><td colspan="${cols}" class="c-muted" style="text-align:center;padding:28px">${msg}</td></tr>`;
}

// ── Generic sortable tables ──
// Cada tabela ordenável tem um id próprio: sort state e função de re-render ficam
// registrados aqui, para que o clique no <th> funcione sem re-buscar os dados.
const _sortState    = {};
const _sortRenderers = {};

function registerSortRenderer(tableId, renderFn) {
  _sortRenderers[tableId] = renderFn;
}

function getSort(tableId, fallbackKey, fallbackDir='desc') {
  if (!_sortState[tableId]) _sortState[tableId] = { key: fallbackKey, dir: fallbackDir };
  return _sortState[tableId];
}

function onSortClick(tableId, key, defaultDir) {
  const cur = _sortState[tableId];
  if (cur && cur.key === key) cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
  else _sortState[tableId] = { key, dir: defaultDir };
  const fn = _sortRenderers[tableId];
  if (fn) fn();
}

function sortRows(rows, key, dir) {
  return rows.slice().sort((a, b) => {
    let va = a[key], vb = b[key];
    const bothNumeric = (typeof va === 'number' || va == null) && (typeof vb === 'number' || vb == null);
    if (bothNumeric) {
      va = va == null ? -Infinity : va;
      vb = vb == null ? -Infinity : vb;
    } else {
      va = String(va ?? '').toLowerCase();
      vb = String(vb ?? '').toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortTh(tableId, label, key, defaultDir='desc', align='r') {
  const st = getSort(tableId, null, defaultDir);
  const active = st.key === key;
  const arrow = active ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="${align} th-sort${active?' active':''}" onclick="onSortClick('${tableId}','${key}','${defaultDir}')">${label}${arrow}</th>`;
}
