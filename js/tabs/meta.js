let _metaData = null;
let _metaSubTab = 'campanhas';
let _metaCreativos = { topo: null, fundo: null };

function metaSubtabBtn(id, label) {
  const active = _metaSubTab === id;
  return `<button onclick="switchMetaSubTab('${id}')"
    style="background:${active ? '#ed723e22' : '#ffffff'};border:1px solid ${active ? '#ed723e' : '#E7E8EC'};
      color:${active ? '#ed723e' : '#212121BF'};border-radius:6px;padding:7px 16px;font-size:13px;font-weight:600;
      cursor:pointer;transition:all .15s">${label}</button>`;
}

function renderMetaSubtabs() {
  return `<div style="display:flex;gap:8px;margin-bottom:20px">
    ${metaSubtabBtn('campanhas', 'Campanhas')}
    ${metaSubtabBtn('fundo', 'Criativos Fundo')}
    ${metaSubtabBtn('topo', 'Criativos Topo')}
  </div>`;
}

// changeFn precisa ser um nome de função global sem argumentos (embutido cru no onclick do
// dropdown) — daí os dois wrappers fixos por sub-aba em vez de uma closure parametrizada por id.
function metaCreativeFilterChangedFundo() { metaCreativeFilterChanged('fundo'); }
function metaCreativeFilterChangedTopo()  { metaCreativeFilterChanged('topo'); }

function metaCreativeFilterChanged(id) {
  const cached = _metaCreativos[id];
  if (!cached) return;
  document.getElementById('m-subtab-body').innerHTML = renderMetaCreativeSubtab(id, cached.rawRows, cached.realMap);
}

function renderMetaCreativeFilters(id, rawRows) {
  const campKey  = 'metaCreativeCamp_' + id;
  const adsetKey = 'metaCreativeAdset_' + id;
  const changeFn = id === 'topo' ? 'metaCreativeFilterChangedTopo' : 'metaCreativeFilterChangedFundo';

  const selectedCamps = msState(campKey).selected;
  const campaigns = [...new Set(rawRows.map(r => r.campaign_name).filter(Boolean))].sort();
  const adsetPool = selectedCamps.size ? rawRows.filter(r => selectedCamps.has(r.campaign_name)) : rawRows;
  const adsets = [...new Set(adsetPool.map(r => r.adset_name).filter(Boolean))].sort();

  // Poda seleções de conjunto que saíram da lista (ex: usuário restringiu a campanha depois)
  const selectedAdsets = msState(adsetKey).selected;
  [...selectedAdsets].forEach(a => { if (!adsets.includes(a)) selectedAdsets.delete(a); });

  return `<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    ${renderMultiSelect(campKey, 'Campanha', 'Todas as Campanhas', campaigns, changeFn, 240)}
    ${renderMultiSelect(adsetKey, 'Conjunto de Anúncios', 'Todos os Conjuntos', adsets, changeFn, 240)}
  </div>`;
}

function metaCreativeFilteredAds(id, rawRows, realMap) {
  const selectedCamps  = msState('metaCreativeCamp_' + id).selected;
  const selectedAdsets = msState('metaCreativeAdset_' + id).selected;
  let rows = rawRows;
  if (selectedCamps.size)  rows = rows.filter(r => selectedCamps.has(r.campaign_name));
  if (selectedAdsets.size) rows = rows.filter(r => selectedAdsets.has(r.adset_name));
  return mergeCreativeRealConversions(aggMetaByAd(rows), realMap);
}

function renderMetaCreativeSubtab(id, rawRows, realMap) {
  const tableId = 'meta-' + id;
  registerSortRenderer(tableId, () => {
    if (_metaSubTab === id) document.getElementById('m-subtab-body').innerHTML = renderMetaCreativeSubtabHtml(id, rawRows, realMap);
  });
  return renderMetaCreativeSubtabHtml(id, rawRows, realMap);
}

function renderMetaCreativeSubtabHtml(id, rawRows, realMap) {
  const tableId = 'meta-' + id;
  const ads = metaCreativeFilteredAds(id, rawRows, realMap);
  const table = id === 'topo'
    ? metaTable(ads, '🟡 Meta · Criativos Topo (Branding)', null, tableId)
    : metaFundoTable(ads, '🟡 Meta · Criativos Fundo (Conversão)', null, tableId);
  return renderMetaCreativeFilters(id, rawRows) + table;
}

async function switchMetaSubTab(id) {
  _metaSubTab = id;
  document.getElementById('m-subtabs').innerHTML = renderMetaSubtabs();
  const body = document.getElementById('m-subtab-body');
  if (id === 'campanhas') { renderMetaCampanhas(); return; }

  body.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando criativos…</div>`;
  const cached = _metaCreativos[id];
  let rawRows, realMap;
  if (cached && cached.start === S.start && cached.end === S.end) {
    ({ rawRows, realMap } = cached);
  } else {
    const [rows, realRows] = await Promise.all([
      supa(`meta_creatives?select=*&date=gte.${S.start}&date=lte.${S.end}&campaign_name=ilike.*${id}*&order=date.asc`),
      fetchCreativeRealConversions(S.start, S.end),
    ]);
    realMap = buildCreativeConversionsMap(realRows);
    rawRows = rows;
    msReset('metaCreativeCamp_' + id);
    msReset('metaCreativeAdset_' + id);
    _metaCreativos[id] = { start: S.start, end: S.end, rawRows, realMap };
  }

  const html = renderMetaCreativeSubtab(id, rawRows, realMap);
  if (_metaSubTab === id) body.innerHTML = html;
}

function renderMetaCampanhasFilterChange() {
  const { agg } = _metaData;
  const camps = [...new Set(agg.map(r => r.campaign_name))].sort();
  document.getElementById('m-campfilter').innerHTML =
    renderMultiSelect('metaCampFilter', 'Filtrar Campanha', 'Todas as Campanhas', camps, 'renderMetaCampanhasFilterChange', 280);
  renderMetaTable();
  renderMetaChart();
}

// Reconstrói o gráfico a partir das campanhas selecionadas no multi-select — soma a série diária
// de gasto+cadastros reais só dos grupos de campanha marcados. Nada selecionado = total combinado
// (reaproveita o gráfico já calculado, igual ao comportamento de antes).
function renderMetaChart() {
  const { dailyChart, agg, dailySpendByGroup: spendMap, dailyConvByGroup: convMap, allDates } = _metaData;
  const selected = msState('metaCampFilter').selected;
  let series = dailyChart;

  if (selected.size) {
    const matchingGids = new Set(agg.filter(r => selected.has(r.campaign_name)).map(r => r._groupId));
    const spendByDate = {}, convByDate = {};
    for (const d of allDates) {
      let s = 0, c = 0;
      for (const gid of matchingGids) {
        s += (spendMap[d] && spendMap[d][gid]) || 0;
        c += (convMap[d]  && convMap[d][gid])  || 0;
      }
      spendByDate[d] = s;
      convByDate[d] = { sel: c };
    }
    series = buildComboChartSeries(S.start, S.end, spendByDate, convByDate, 'sel');
  }

  renderComboChart('metaChart', series.labels, [{ label:'Meta Ads', data:series.spend, backgroundColor:'#017858' }], [
    { label:'Cadastros Reais', data:series.conv, borderColor:'#41C78F', yAxisID:'y1' },
    { label:'CAC', data:series.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
  ]);
}

function renderMetaCampanhas() {
  if (!_metaData) return;
  const { agg, dailyChart } = _metaData;
  const camps = [...new Set(agg.map(r => r.campaign_name))].sort();
  msReset('metaCampFilter');
  registerSortRenderer('meta', () => renderMetaTable());

  document.getElementById('m-subtab-body').innerHTML = `
  <div id="m-campfilter" style="margin-bottom:16px">
    ${renderMultiSelect('metaCampFilter', 'Filtrar Campanha', 'Todas as Campanhas', camps, 'renderMetaCampanhasFilterChange', 280)}
  </div>
  <div class="kpi-grid cols-4" id="m-kpis" style="margin-bottom:20px"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Investimento Diário × Cadastros Reais</div>
    <div style="height:300px;position:relative">
      ${dailyChart.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="metaChart"></canvas>'}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Meta Ads — Campanhas (${disp(S.start)} → ${disp(S.end)})</div>
    <div class="table-wrap"><table>
      <thead><tr id="m-thead"></tr></thead>
      <tbody id="m-tbody"></tbody>
      <tfoot><tr id="m-tfoot" style="border-top:2px solid #E7E8EC;background:#ffffff"></tr></tfoot>
    </table></div>
  </div>`;

  renderMetaTable();
  renderMetaChart();
}

function renderMetaTable() {
  if (!_metaData) return;
  const { agg, cmpAgg, cmpMap, hasCmp } = _metaData;
  const selected    = msState('metaCampFilter').selected;
  const filtered0   = selected.size ? agg.filter(r => selected.has(r.campaign_name)) : agg;
  const cmpFiltered = selected.size ? cmpAgg.filter(r => selected.has(r.campaign_name)) : cmpAgg;

  const st = getSort('meta', 'spend', 'desc');
  const filtered = sortRows(filtered0, st.key, st.dir);

  const totSpend = sum(filtered,'spend'), totClicks=sum(filtered,'clicks'), totConv=sum(filtered,'conversions');
  const totImpr = sum(filtered,'impressions'), totSessions = sum(filtered,'sessions');
  const totCTR = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totTx  = totSessions>0 ? totConv/totSessions*100 : 0;
  const totCac = totConv>0 ? totSpend/totConv : null;
  const cTotSpend = cmpFiltered.length ? sum(cmpFiltered,'spend')       : undefined;
  const cTotClick = cmpFiltered.length ? sum(cmpFiltered,'clicks')      : undefined;
  const cTotConv  = cmpFiltered.length ? sum(cmpFiltered,'conversions') : undefined;

  document.getElementById('m-kpis').innerHTML =
    kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-yellow') +
    kpiCard('Cliques',      totClicks, cTotClick, fN, 'c-green') +
    kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-blue') +
    kpiCard('CAC Real Médio', totConv>0?totSpend/totConv:null, (cTotConv&&cTotSpend&&cTotConv>0)?cTotSpend/cTotConv:undefined, fR, 'c-brand', true);

  document.getElementById('m-thead').innerHTML =
    `<th>#</th>${sortTh('meta','Campanha','campaign_name','asc','')}
     ${sortTh('meta','Gasto','spend')}${sortTh('meta','Impressões','impressions')}
     ${sortTh('meta','Cliques','clicks')}${sortTh('meta','Sessões','sessions')}
     ${sortTh('meta','CTR','ctr')}${sortTh('meta','Tx Conversão','txConv')}
     ${sortTh('meta','Cadastros','conversions')}${sortTh('meta','CAC Real','cpa')}
     ${hasCmp?'<th class="r">Δ Gasto</th>':''}`;

  document.getElementById('m-tbody').innerHTML = filtered.length ? filtered.map((r,i) => {
    const cmp    = cmpMap[r.campaign_name];
    const cpaCls = r.cpa==null?'c-muted':r.cpa<60?'c-green':r.cpa<130?'c-yellow':'c-red';
    return `<tr>
      <td class="c-muted">${i+1}</td>
      <td><strong>${r.campaign_name}</strong></td>
      <td class="r c-brand">${fR(r.spend)}</td>
      <td class="r c-muted">${fN(r.impressions)}</td>
      <td class="r">${fN(r.clicks)}</td>
      <td class="r">${fN(r.sessions)}</td>
      <td class="r">${fP(r.ctr)}</td>
      <td class="r">${fP(r.txConv)}</td>
      <td class="r">${fN(r.conversions)}</td>
      <td class="r ${cpaCls}">${r.cpa?fR(r.cpa):'—'}</td>
      ${hasCmp?`<td class="r">${cmp?deltaHtml(r.spend,cmp.spend):'<span class="d-neu">novo</span>'}</td>`:''}
    </tr>`;
  }).join('') : emptyRow(hasCmp ? 11 : 10);

  document.getElementById('m-tfoot').innerHTML = filtered.length ? `
    <td></td>
    <td><strong>Total</strong></td>
    <td class="r c-brand"><strong>${fR(totSpend)}</strong></td>
    <td class="r"><strong>${fN(totImpr)}</strong></td>
    <td class="r"><strong>${fN(totClicks)}</strong></td>
    <td class="r"><strong>${fN(totSessions)}</strong></td>
    <td class="r"><strong>${fP(totCTR)}</strong></td>
    <td class="r"><strong>${fP(totTx)}</strong></td>
    <td class="r"><strong>${fN(totConv)}</strong></td>
    <td class="r c-brand"><strong>${totCac!=null?fR(totCac):'—'}</strong></td>
    ${hasCmp?'<td></td>':''}
  ` : '';
}

async function tabMeta() {
  loading();
  ensureCreativeModal();
  _metaSubTab = 'campanhas';
  _metaCreativos = { topo: null, fundo: null };
  msReset('metaCreativeCamp_fundo'); msReset('metaCreativeAdset_fundo');
  msReset('metaCreativeCamp_topo');  msReset('metaCreativeAdset_topo');

  const [campAgg, cmpCampAgg, ga4Camp, cmpGA4Camp, convRows, cmpConvRows, dailyByPlatform, convDaily, campsRaw] = await Promise.all([
    fetchCampAgg(S.start, S.end),
    S.compare && S.cmpStart ? fetchCampAgg(S.cmpStart, S.cmpEnd) : [],
    fetchGA4SessionsByCampaign(S.start, S.end),
    S.compare && S.cmpStart ? fetchGA4SessionsByCampaign(S.cmpStart, S.cmpEnd) : [],
    fetchJusfyConversionsByCampaign(S.start, S.end),
    S.compare && S.cmpStart ? fetchJusfyConversionsByCampaign(S.cmpStart, S.cmpEnd) : [],
    fetchCampDailyByPlatform(S.start, S.end),
    fetchJusfyConversionsDailyAgg(S.start, S.end),
    fetchCamps(S.start, S.end),
  ]);

  const sessMap    = Object.fromEntries(ga4Camp.map(r => [(r.campaign||'').toLowerCase(), +r.sessions||0]));
  const cmpSessMap = Object.fromEntries(cmpGA4Camp.map(r => [(r.campaign||'').toLowerCase(), +r.sessions||0]));

  const addMetrics = (rows, sMap) => rows.map(r => {
    const sessions = sMap[(r.campaign_name||'').toLowerCase()] || 0;
    return {...r,
      ctr: r.impressions>0 ? r.clicks/r.impressions*100 : 0,
      cpa: r.conversions>0 ? r.spend/r.conversions : null,
      sessions,
      txConv: sessions>0 ? r.conversions/sessions*100 : 0,
    };
  });

  const aggRaw    = addMetrics(campAgg.filter(r=>r.platform==='meta'), sessMap);
  const cmpAggRaw = cmpCampAgg.length ? addMetrics(cmpCampAgg.filter(r=>r.platform==='meta'), cmpSessMap) : [];

  // Substitui conversões/CPA de plataforma pelas conversões reais do Metabase (jusfy_conversions_daily)
  const agg    = mergeRealConversions(aggRaw, convRows, 'meta');
  const cmpAgg = cmpAggRaw.length ? mergeRealConversions(cmpAggRaw, cmpConvRows, 'meta') : [];
  const cmpMap = Object.fromEntries(cmpAgg.map(r=>[r.campaign_name,r]));
  const hasCmp = S.compare && cmpAgg.length > 0;

  const spendByDate = {};
  for (const r of dailyByPlatform) if (r.platform === 'meta') spendByDate[r.date] = (spendByDate[r.date]||0) + (+r.spend||0);
  const campaignLookup = buildCampaignLookup(campsRaw);
  const channelConvMap = aggregateDailyRealConversionsByChannel(convDaily, campaignLookup);
  const dailyChart = buildComboChartSeries(S.start, S.end, spendByDate, channelConvMap, 'Meta Ads');

  // Mesma quebra diária, mas por grupo de campanha (não por canal) — usada quando o usuário
  // seleciona campanhas no multi-select, pra refazer o gráfico só com os grupos marcados.
  const { groupIdOf } = buildCampaignGroupIndex(aggRaw, 'meta');
  const spendByGroupMap = dailySpendByGroup(campsRaw.filter(r => r.platform === 'meta'), groupIdOf);
  const convByGroupMap = dailyRealConversionsByGroup(convDaily, aggRaw, 'meta');
  const allDates = Object.keys(spendByDate);

  _metaData = { agg, cmpAgg, cmpMap, hasCmp, dailyChart,
    dailySpendByGroup: spendByGroupMap, dailyConvByGroup: convByGroupMap, allDates };

  document.getElementById('content').innerHTML = `
    <div id="m-subtabs">${renderMetaSubtabs()}</div>
    <div id="m-subtab-body"></div>`;

  renderMetaCampanhas();
}
