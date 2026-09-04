let _bingData = null;
let _bingFilter = null;
let _bingCategoryFilter = null;
let _bingSubTab = 'campanhas';
let _bingKeywords = null;
let _bingKwFilter = { campaign: null, adGroup: null };

function renderBingKeywords(filterCampaign, filterAdGroup) {
  if (filterCampaign !== undefined) { _bingKwFilter.campaign = filterCampaign; _bingKwFilter.adGroup = null; }
  if (filterAdGroup !== undefined) _bingKwFilter.adGroup = filterAdGroup;
  const body = document.getElementById('bi-subtab-body');
  if (!body || !_bingKeywords) return;
  const all = _bingKeywords.rows;
  const filtered = filterKeywordRows(all, _bingKwFilter);
  body.innerHTML = keywordFilterBar(all, _bingKwFilter, 'renderBingKeywords') + renderKeywordTable(filtered, 'bing-keywords', 'Bing Ads');
}

function bingSubtabBtn(id, label) {
  const active = _bingSubTab === id;
  return `<button onclick="switchBingSubTab('${id}')"
    style="background:${active ? '#9551FB22' : '#ffffff'};border:1px solid ${active ? '#9551FB' : '#E7E8EC'};
      color:${active ? '#9551FB' : '#212121BF'};border-radius:6px;padding:7px 16px;font-size:13px;font-weight:600;
      cursor:pointer;transition:all .15s">${label}</button>`;
}

function renderBingSubtabs() {
  return `<div style="display:flex;gap:8px;margin-bottom:20px">
    ${bingSubtabBtn('campanhas', 'Campanhas')}
    ${bingSubtabBtn('keywords', 'Palavras-chave')}
  </div>`;
}

async function switchBingSubTab(id) {
  _bingSubTab = id;
  document.getElementById('bi-subtabs').innerHTML = renderBingSubtabs();
  const body = document.getElementById('bi-subtab-body');
  if (id === 'campanhas') { renderBingCampanhas(); return; }

  body.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando palavras-chave…</div>`;
  if (!_bingKeywords || _bingKeywords.start !== S.start || _bingKeywords.end !== S.end) {
    const aliases = buildKeywordCampaignAliases(_bingData.campaignLookup);
    const rows = await fetchKeywordTableData('bing_ads', S.start, S.end, aliases);
    _bingKeywords = { start: S.start, end: S.end, rows };
    _bingKwFilter = { campaign: null, adGroup: null };
  }
  registerSortRenderer('bing-keywords', () => { if (_bingSubTab === 'keywords') renderBingKeywords(); });
  if (_bingSubTab === 'keywords') renderBingKeywords();
}

function renderBingCampanhas() {
  document.getElementById('bi-subtab-body').innerHTML = `
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Campanha</label>
      <select id="bingCampFilter" onchange="renderBingTable(this.value||null, undefined)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:280px">
        <option value="">Todas as Campanhas</option>
        ${_bingData.agg.map(r=>r.campaign_name).map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Categoria</label>
      <select id="bingCategoryFilter" onchange="renderBingTable(undefined, this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:160px">
        <option value="">Todas as Categorias</option>
        <option value="Non brand">Non brand</option>
        <option value="Brand Search">Brand Search</option>
      </select>
    </div>
  </div>
  <div class="kpi-grid cols-4" id="bi-kpis" style="margin-bottom:20px"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title" id="bi-chart-title"></div>
    <div style="height:300px;position:relative">
      ${_bingData.chart.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="bingChart"></canvas>'}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Bing Ads — Campanhas (${disp(S.start)} → ${disp(S.end)})</div>
    <div class="table-wrap"><table>
      <thead><tr id="bi-thead"></tr></thead>
      <tbody id="bi-tbody"></tbody>
      <tfoot><tr id="bi-tfoot" style="border-top:2px solid #E7E8EC;background:#ffffff"></tr></tfoot>
    </table></div>
  </div>`;

  renderBingTable(null);
  renderBingChart();
}

// Reconstrói o gráfico a partir do filtro atual (campanha e/ou categoria) — soma a série diária
// de gasto+cadastros reais só dos grupos de campanha que passam no filtro. Sem filtro nenhum,
// reaproveita o gráfico já calculado com o total combinado (mais barato e já testado).
function renderBingChart() {
  const titleEl = document.getElementById('bi-chart-title');
  if (titleEl) titleEl.innerHTML = chartTitleWithGranularity('Investimento', 'masc', ' × Cadastros Reais', 'renderBingChart');

  const { agg, spendByDate: baseSpend, channelConvMap, dailySpendByGroup: spendMap, dailyConvByGroup: convMap, allDates } = _bingData;
  const gran = currentChartGranularity();
  let series = buildComboChartSeries(S.start, S.end, baseSpend, channelConvMap, 'Bing Ads', gran);

  if (_bingFilter || _bingCategoryFilter) {
    const matchingGids = new Set(
      agg.filter(r => (!_bingFilter || r.campaign_name === _bingFilter)
                    && (!_bingCategoryFilter || campaignCategory(r.campaign_name) === _bingCategoryFilter))
         .map(r => r._groupId)
    );
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
    series = buildComboChartSeries(S.start, S.end, spendByDate, convByDate, 'sel', gran);
  }

  renderComboChart('bingChart', series.labels, [{ label:'Bing Ads', data:series.spend, backgroundColor:'#017858' }], [
    { label:'Cadastros Reais', data:series.conv, borderColor:'#41C78F', yAxisID:'y1' },
    { label:'CAC', data:series.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
  ]);
}

function renderBingTable(filterCamp, filterCategory) {
  if (filterCamp !== undefined) _bingFilter = filterCamp;
  if (filterCategory !== undefined) _bingCategoryFilter = filterCategory;
  if (!_bingData) return;
  const { agg, cmpAgg, cmpMap, hasCmp } = _bingData;
  const filterVal  = _bingFilter;
  const catVal     = _bingCategoryFilter;
  const matches    = r => (!filterVal || r.campaign_name === filterVal) && (!catVal || campaignCategory(r.campaign_name) === catVal);
  const filtered0   = agg.filter(matches);
  const cmpFiltered = cmpAgg.filter(matches);

  const st = getSort('bing', 'spend', 'desc');
  const filtered = sortRows(filtered0, st.key, st.dir);

  const totSpend = sum(filtered,'spend'), totClicks=sum(filtered,'clicks'), totConv=sum(filtered,'conversions');
  const totImpr = sum(filtered,'impressions'), totSessions = sum(filtered,'sessions');
  const totCTR = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totTx  = totSessions>0 ? totConv/totSessions*100 : 0;
  const totCac = totConv>0 ? totSpend/totConv : null;
  const cTotSpend = cmpFiltered.length ? sum(cmpFiltered,'spend')       : undefined;
  const cTotClick = cmpFiltered.length ? sum(cmpFiltered,'clicks')      : undefined;
  const cTotConv  = cmpFiltered.length ? sum(cmpFiltered,'conversions') : undefined;

  document.getElementById('bi-kpis').innerHTML =
    kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-blue') +
    kpiCard('Cliques',      totClicks, cTotClick, fN, 'c-green') +
    kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-yellow') +
    kpiCard('CAC Real Médio', totConv>0?totSpend/totConv:null, (cTotConv&&cTotSpend&&cTotConv>0)?cTotSpend/cTotConv:undefined, fR, 'c-brand', true);

  document.getElementById('bi-thead').innerHTML =
    `<th>#</th>${sortTh('bing','Campanha','campaign_name','asc','')}
     ${sortTh('bing','Gasto','spend')}${sortTh('bing','Impressões','impressions')}
     ${sortTh('bing','Cliques','clicks')}${sortTh('bing','Sessões','sessions')}
     ${sortTh('bing','CTR','ctr')}${sortTh('bing','Tx Conversão','txConv')}
     ${sortTh('bing','Cadastros','conversions')}${sortTh('bing','CAC Real','cpa')}
     ${hasCmp?'<th class="r">Δ Gasto</th>':''}`;

  if (_bingData.chart.labels.length) renderBingChart();

  document.getElementById('bi-tbody').innerHTML = filtered.length ? filtered.map((r,i) => {
    const cmp    = cmpMap[r.campaign_name];
    const cpaCls = r.cpa==null?'c-muted':r.cpa<100?'c-green':r.cpa<200?'c-yellow':'c-red';
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

  document.getElementById('bi-tfoot').innerHTML = filtered.length ? `
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

async function tabBing() {
  loading();
  _bingSubTab = 'campanhas';
  _bingKeywords = null;
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

  const aggRaw    = addMetrics(campAgg.filter(r=>r.platform==='bing_ads'), sessMap);
  const cmpAggRaw = cmpCampAgg.length ? addMetrics(cmpCampAgg.filter(r=>r.platform==='bing_ads'), cmpSessMap) : [];

  // Substitui conversões/CPA de plataforma pelas conversões reais do Metabase (jusfy_conversions_daily)
  const agg    = mergeRealConversions(aggRaw, convRows, 'bing_ads');
  const cmpAgg = cmpAggRaw.length ? mergeRealConversions(cmpAggRaw, cmpConvRows, 'bing_ads') : [];
  const cmpMap = Object.fromEntries(cmpAgg.map(r=>[r.campaign_name,r]));
  const hasCmp = S.compare && cmpAgg.length > 0;

  const spendByDate = {};
  for (const r of dailyByPlatform) if (r.platform === 'bing_ads') spendByDate[r.date] = (spendByDate[r.date]||0) + (+r.spend||0);
  const campaignLookup = buildCampaignLookup(campsRaw);
  const channelConvMap = aggregateDailyRealConversionsByChannel(convDaily, campaignLookup);
  const chart = buildComboChartSeries(S.start, S.end, spendByDate, channelConvMap, 'Bing Ads');

  // Mesma quebra diária, mas por grupo de campanha (não por canal) — usada quando o usuário filtra
  // por campanha/categoria, pra refazer o gráfico só com os grupos que passam no filtro.
  const { groupIdOf } = buildCampaignGroupIndex(aggRaw, 'bing_ads');
  const spendByGroupMap = dailySpendByGroup(campsRaw.filter(r => r.platform === 'bing_ads'), groupIdOf);
  const convByGroupMap = dailyRealConversionsByGroup(convDaily, aggRaw, 'bing_ads');
  const allDates = Object.keys(spendByDate);

  _bingData = { agg, cmpAgg, cmpMap, hasCmp, chart, campaignLookup, spendByDate, channelConvMap,
    dailySpendByGroup: spendByGroupMap, dailyConvByGroup: convByGroupMap, allDates };
  _bingFilter = null;
  _bingCategoryFilter = null;
  registerSortRenderer('bing', () => renderBingTable());

  document.getElementById('content').innerHTML = `
    <div id="bi-subtabs">${renderBingSubtabs()}</div>
    <div id="bi-subtab-body"></div>`;

  renderBingCampanhas();
}
