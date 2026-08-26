let _googleData = null;
let _googleFilter = null;
let _googleCategoryFilter = null;
let _googleSubTab = 'campanhas';
let _googleKeywords = null;
let _googleKwFilter = { campaign: null, adGroup: null };

function renderGoogleKeywords(filterCampaign, filterAdGroup) {
  if (filterCampaign !== undefined) { _googleKwFilter.campaign = filterCampaign; _googleKwFilter.adGroup = null; }
  if (filterAdGroup !== undefined) _googleKwFilter.adGroup = filterAdGroup;
  const body = document.getElementById('go-subtab-body');
  if (!body || !_googleKeywords) return;
  const all = _googleKeywords.rows;
  const filtered = filterKeywordRows(all, _googleKwFilter);
  body.innerHTML = keywordFilterBar(all, _googleKwFilter, 'renderGoogleKeywords') + renderKeywordTable(filtered, 'google-keywords', 'Google Ads');
}

function googleSubtabBtn(id, label) {
  const active = _googleSubTab === id;
  return `<button onclick="switchGoogleSubTab('${id}')"
    style="background:${active ? '#0182ab22' : '#ffffff'};border:1px solid ${active ? '#0182ab' : '#E7E8EC'};
      color:${active ? '#0182ab' : '#212121BF'};border-radius:6px;padding:7px 16px;font-size:13px;font-weight:600;
      cursor:pointer;transition:all .15s">${label}</button>`;
}

function renderGoogleSubtabs() {
  return `<div style="display:flex;gap:8px;margin-bottom:20px">
    ${googleSubtabBtn('campanhas', 'Campanhas')}
    ${googleSubtabBtn('keywords', 'Palavras-chave')}
  </div>`;
}

async function switchGoogleSubTab(id) {
  _googleSubTab = id;
  document.getElementById('go-subtabs').innerHTML = renderGoogleSubtabs();
  const body = document.getElementById('go-subtab-body');
  if (id === 'campanhas') { renderGoogleCampanhas(); return; }

  body.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando palavras-chave…</div>`;
  if (!_googleKeywords || _googleKeywords.start !== S.start || _googleKeywords.end !== S.end) {
    const aliases = buildKeywordCampaignAliases(_googleData.campaignLookup);
    const rows = await fetchKeywordTableData('google_ads', S.start, S.end, aliases);
    _googleKeywords = { start: S.start, end: S.end, rows };
    _googleKwFilter = { campaign: null, adGroup: null };
  }
  registerSortRenderer('google-keywords', () => { if (_googleSubTab === 'keywords') renderGoogleKeywords(); });
  if (_googleSubTab === 'keywords') renderGoogleKeywords();
}

function renderGoogleCampanhas() {
  document.getElementById('go-subtab-body').innerHTML = `
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Campanha</label>
      <select id="googleCampFilter" onchange="renderGoogleTable(this.value||null, undefined)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:280px">
        <option value="">Todas as Campanhas</option>
        ${_googleData.agg.map(r=>r.campaign_name).map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Categoria</label>
      <select id="googleCategoryFilter" onchange="renderGoogleTable(undefined, this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:160px">
        <option value="">Todas as Categorias</option>
        <option value="Non brand">Non brand</option>
        <option value="Brand Search">Brand Search</option>
      </select>
    </div>
  </div>
  <div class="kpi-grid cols-4" id="g-kpis" style="margin-bottom:20px"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Investimento Diário × Cadastros Reais</div>
    <div style="height:300px;position:relative">
      ${_googleData.chart.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="googleChart"></canvas>'}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Google Ads — Campanhas (${disp(S.start)} → ${disp(S.end)})</div>
    <div class="table-wrap"><table>
      <thead><tr id="g-thead"></tr></thead>
      <tbody id="g-tbody"></tbody>
      <tfoot><tr id="g-tfoot" style="border-top:2px solid #E7E8EC;background:#ffffff"></tr></tfoot>
    </table></div>
  </div>`;

  renderGoogleTable(null);
  renderGoogleChart();
}

// Reconstrói o gráfico a partir do filtro atual (campanha e/ou categoria) — soma a série diária
// de gasto+cadastros reais só dos grupos de campanha que passam no filtro. Sem filtro nenhum,
// reaproveita o gráfico já calculado com o total combinado (mais barato e já testado).
function renderGoogleChart() {
  const { chart, agg, dailySpendByGroup: spendMap, dailyConvByGroup: convMap, allDates } = _googleData;
  let series = chart;

  if (_googleFilter || _googleCategoryFilter) {
    const matchingGids = new Set(
      agg.filter(r => (!_googleFilter || r.campaign_name === _googleFilter)
                    && (!_googleCategoryFilter || campaignCategory(r.campaign_name) === _googleCategoryFilter))
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
    series = buildComboChartSeries(S.start, S.end, spendByDate, convByDate, 'sel');
  }

  renderComboChart('googleChart', series.labels, [{ label:'Google Ads', data:series.spend, backgroundColor:'#017858' }], [
    { label:'Cadastros Reais', data:series.conv, borderColor:'#41C78F', yAxisID:'y1' },
    { label:'CAC', data:series.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
  ]);
}

function renderGoogleTable(filterCamp, filterCategory) {
  if (filterCamp !== undefined) _googleFilter = filterCamp;
  if (filterCategory !== undefined) _googleCategoryFilter = filterCategory;
  if (!_googleData) return;
  const { agg, cmpAgg, cmpMap, hasCmp } = _googleData;
  const filterVal  = _googleFilter;
  const catVal     = _googleCategoryFilter;
  const matches    = r => (!filterVal || r.campaign_name === filterVal) && (!catVal || campaignCategory(r.campaign_name) === catVal);
  const filtered0   = agg.filter(matches);
  const cmpFiltered = cmpAgg.filter(matches);

  const st = getSort('google', 'spend', 'desc');
  const filtered = sortRows(filtered0, st.key, st.dir);

  const totSpend = sum(filtered,'spend'), totClicks=sum(filtered,'clicks'), totConv=sum(filtered,'conversions');
  const totImpr = sum(filtered,'impressions'), totSessions = sum(filtered,'sessions');
  const totCTR = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totTx  = totSessions>0 ? totConv/totSessions*100 : 0;
  const totCac = totConv>0 ? totSpend/totConv : null;
  const cTotSpend = cmpFiltered.length ? sum(cmpFiltered,'spend')       : undefined;
  const cTotClick = cmpFiltered.length ? sum(cmpFiltered,'clicks')      : undefined;
  const cTotConv  = cmpFiltered.length ? sum(cmpFiltered,'conversions') : undefined;

  document.getElementById('g-kpis').innerHTML =
    kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-blue') +
    kpiCard('Cliques',      totClicks, cTotClick, fN, 'c-green') +
    kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-yellow') +
    kpiCard('CAC Real Médio', totConv>0?totSpend/totConv:null, (cTotConv&&cTotSpend&&cTotConv>0)?cTotSpend/cTotConv:undefined, fR, 'c-brand', true);

  document.getElementById('g-thead').innerHTML =
    `<th>#</th>${sortTh('google','Campanha','campaign_name','asc','')}
     ${sortTh('google','Gasto','spend')}${sortTh('google','Impressões','impressions')}
     ${sortTh('google','Cliques','clicks')}${sortTh('google','Sessões','sessions')}
     ${sortTh('google','CTR','ctr')}${sortTh('google','Tx Conversão','txConv')}
     ${sortTh('google','Cadastros','conversions')}${sortTh('google','CAC Real','cpa')}
     ${hasCmp?'<th class="r">Δ Gasto</th>':''}`;

  if (_googleData.chart.labels.length) renderGoogleChart();

  document.getElementById('g-tbody').innerHTML = filtered.length ? filtered.map((r,i) => {
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

  document.getElementById('g-tfoot').innerHTML = filtered.length ? `
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

async function tabGoogle() {
  loading();
  _googleSubTab = 'campanhas';
  _googleKeywords = null;
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

  const aggRaw    = addMetrics(campAgg.filter(r=>r.platform==='google_ads'), sessMap);
  const cmpAggRaw = cmpCampAgg.length ? addMetrics(cmpCampAgg.filter(r=>r.platform==='google_ads'), cmpSessMap) : [];

  // Substitui conversões/CPA de plataforma pelas conversões reais do Metabase (jusfy_conversions_daily)
  const agg    = mergeRealConversions(aggRaw, convRows, 'google_ads');
  const cmpAgg = cmpAggRaw.length ? mergeRealConversions(cmpAggRaw, cmpConvRows, 'google_ads') : [];
  const cmpMap = Object.fromEntries(cmpAgg.map(r=>[r.campaign_name,r]));
  const hasCmp = S.compare && cmpAgg.length > 0;

  // Gráfico diário: gasto Google Ads x cadastros reais atribuídos ao Google
  const spendByDate = {};
  for (const r of dailyByPlatform) if (r.platform === 'google_ads') spendByDate[r.date] = (spendByDate[r.date]||0) + (+r.spend||0);
  const campaignLookup = buildCampaignLookup(campsRaw);
  const channelConvMap = aggregateDailyRealConversionsByChannel(convDaily, campaignLookup);
  const chart = buildComboChartSeries(S.start, S.end, spendByDate, channelConvMap, 'Google Ads');

  // Mesma quebra diária, mas por grupo de campanha (não por canal) — usada quando o usuário filtra
  // por campanha/categoria, pra refazer o gráfico só com os grupos que passam no filtro.
  const { groupIdOf } = buildCampaignGroupIndex(aggRaw, 'google_ads');
  const spendByGroupMap = dailySpendByGroup(campsRaw.filter(r => r.platform === 'google_ads'), groupIdOf);
  const convByGroupMap = dailyRealConversionsByGroup(convDaily, aggRaw, 'google_ads');
  const allDates = Object.keys(spendByDate);

  _googleData = { agg, cmpAgg, cmpMap, hasCmp, chart, campaignLookup,
    dailySpendByGroup: spendByGroupMap, dailyConvByGroup: convByGroupMap, allDates };
  _googleFilter = null;
  _googleCategoryFilter = null;
  registerSortRenderer('google', () => renderGoogleTable());

  document.getElementById('content').innerHTML = `
    <div id="go-subtabs">${renderGoogleSubtabs()}</div>
    <div id="go-subtab-body"></div>`;

  renderGoogleCampanhas();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
