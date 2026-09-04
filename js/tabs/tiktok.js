let _tiktokData = null;
let _tiktokFilter = null;
let _tiktokCategoryFilter = null;

function renderTiktokChart() {
  const titleEl = document.getElementById('tt-chart-title');
  if (titleEl) titleEl.innerHTML = chartTitleWithGranularity('Investimento', 'masc', ' × Cadastros Reais', 'renderTiktokChart');

  const { agg, spendByDate: baseSpend, channelConvMap, dailySpendByGroup: spendMap, dailyConvByGroup: convMap, allDates } = _tiktokData;
  const gran = currentChartGranularity();
  let series = buildComboChartSeries(S.start, S.end, baseSpend, channelConvMap, 'TikTok Ads', gran);

  if (_tiktokFilter || _tiktokCategoryFilter) {
    const matchingGids = new Set(
      agg.filter(r => (!_tiktokFilter || r.campaign_name === _tiktokFilter)
                    && (!_tiktokCategoryFilter || campaignCategory(r.campaign_name) === _tiktokCategoryFilter))
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

  renderComboChart('tiktokChart', series.labels, [{ label:'TikTok Ads', data:series.spend, backgroundColor:'#EE1D52' }], [
    { label:'Cadastros Reais', data:series.conv, borderColor:'#25F4EE', yAxisID:'y1' },
    { label:'CAC', data:series.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
  ]);
}

function renderTiktokTable(filterCamp, filterCategory) {
  if (filterCamp !== undefined) _tiktokFilter = filterCamp;
  if (filterCategory !== undefined) _tiktokCategoryFilter = filterCategory;
  if (!_tiktokData) return;
  const { agg, cmpAgg, cmpMap, hasCmp } = _tiktokData;
  const filterVal  = _tiktokFilter;
  const catVal     = _tiktokCategoryFilter;
  const matches    = r => (!filterVal || r.campaign_name === filterVal) && (!catVal || campaignCategory(r.campaign_name) === catVal);
  const filtered0   = agg.filter(matches);
  const cmpFiltered = cmpAgg.filter(matches);

  const st = getSort('tiktok', 'spend', 'desc');
  const filtered = sortRows(filtered0, st.key, st.dir);

  const totSpend = sum(filtered,'spend'), totClicks=sum(filtered,'clicks'), totConv=sum(filtered,'conversions');
  const totImpr = sum(filtered,'impressions'), totSessions = sum(filtered,'sessions');
  const totCTR = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totTx  = totSessions>0 ? totConv/totSessions*100 : 0;
  const totCac = totConv>0 ? totSpend/totConv : null;
  const cTotSpend = cmpFiltered.length ? sum(cmpFiltered,'spend')       : undefined;
  const cTotClick = cmpFiltered.length ? sum(cmpFiltered,'clicks')      : undefined;
  const cTotConv  = cmpFiltered.length ? sum(cmpFiltered,'conversions') : undefined;

  document.getElementById('tt-kpis').innerHTML =
    kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-red') +
    kpiCard('Cliques',      totClicks, cTotClick, fN, 'c-green') +
    kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-yellow') +
    kpiCard('CAC Real Médio', totConv>0?totSpend/totConv:null, (cTotConv&&cTotSpend&&cTotConv>0)?cTotSpend/cTotConv:undefined, fR, 'c-brand', true);

  document.getElementById('tt-thead').innerHTML =
    `<th>#</th>${sortTh('tiktok','Campanha','campaign_name','asc','')}
     ${sortTh('tiktok','Gasto','spend')}${sortTh('tiktok','Impressões','impressions')}
     ${sortTh('tiktok','Cliques','clicks')}${sortTh('tiktok','Sessões','sessions')}
     ${sortTh('tiktok','CTR','ctr')}${sortTh('tiktok','Tx Conversão','txConv')}
     ${sortTh('tiktok','Cadastros','conversions')}${sortTh('tiktok','CAC Real','cpa')}
     ${hasCmp?'<th class="r">Δ Gasto</th>':''}`;

  if (_tiktokData.chart.labels.length) renderTiktokChart();

  document.getElementById('tt-tbody').innerHTML = filtered.length ? filtered.map((r,i) => {
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

  document.getElementById('tt-tfoot').innerHTML = filtered.length ? `
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

function renderTiktokBody() {
  document.getElementById('content').innerHTML = `
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Campanha</label>
      <select id="tiktokCampFilter" onchange="renderTiktokTable(this.value||null, undefined)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:280px">
        <option value="">Todas as Campanhas</option>
        ${_tiktokData.agg.map(r=>r.campaign_name).map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Categoria</label>
      <select id="tiktokCategoryFilter" onchange="renderTiktokTable(undefined, this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:160px">
        <option value="">Todas as Categorias</option>
        <option value="Non brand">Non brand</option>
        <option value="Brand Search">Brand Search</option>
      </select>
    </div>
  </div>
  <div class="kpi-grid cols-4" id="tt-kpis" style="margin-bottom:20px"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title" id="tt-chart-title"></div>
    <div style="height:300px;position:relative">
      ${_tiktokData.chart.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="tiktokChart"></canvas>'}
    </div>
  </div>
  <div class="card">
    <div class="card-title">TikTok Ads — Campanhas (${disp(S.start)} → ${disp(S.end)})</div>
    <div class="table-wrap"><table>
      <thead><tr id="tt-thead"></tr></thead>
      <tbody id="tt-tbody"></tbody>
      <tfoot><tr id="tt-tfoot" style="border-top:2px solid #E7E8EC;background:#ffffff"></tr></tfoot>
    </table></div>
  </div>`;

  renderTiktokTable(null);
  renderTiktokChart();
}

async function tabTiktok() {
  loading();
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

  const aggRaw    = addMetrics(campAgg.filter(r=>r.platform==='tiktok_ads'), sessMap);
  const cmpAggRaw = cmpCampAgg.length ? addMetrics(cmpCampAgg.filter(r=>r.platform==='tiktok_ads'), cmpSessMap) : [];

  // Substitui conversões/CPA de plataforma pelas conversões reais do Metabase (jusfy_conversions_daily)
  const agg    = mergeRealConversions(aggRaw, convRows, 'tiktok_ads');
  const cmpAgg = cmpAggRaw.length ? mergeRealConversions(cmpAggRaw, cmpConvRows, 'tiktok_ads') : [];
  const cmpMap = Object.fromEntries(cmpAgg.map(r=>[r.campaign_name,r]));
  const hasCmp = S.compare && cmpAgg.length > 0;

  const spendByDate = {};
  for (const r of dailyByPlatform) if (r.platform === 'tiktok_ads') spendByDate[r.date] = (spendByDate[r.date]||0) + (+r.spend||0);
  const campaignLookup = buildCampaignLookup(campsRaw);
  const channelConvMap = aggregateDailyRealConversionsByChannel(convDaily, campaignLookup);
  const chart = buildComboChartSeries(S.start, S.end, spendByDate, channelConvMap, 'TikTok Ads');

  // Mesma quebra diária, mas por grupo de campanha (não por canal) — usada quando o usuário filtra
  // por campanha/categoria, pra refazer o gráfico só com os grupos que passam no filtro.
  const { groupIdOf } = buildCampaignGroupIndex(aggRaw, 'tiktok_ads');
  const spendByGroupMap = dailySpendByGroup(campsRaw.filter(r => r.platform === 'tiktok_ads'), groupIdOf);
  const convByGroupMap = dailyRealConversionsByGroup(convDaily, aggRaw, 'tiktok_ads');
  const allDates = Object.keys(spendByDate);

  _tiktokData = { agg, cmpAgg, cmpMap, hasCmp, chart, campaignLookup, spendByDate, channelConvMap,
    dailySpendByGroup: spendByGroupMap, dailyConvByGroup: convByGroupMap, allDates };
  _tiktokFilter = null;
  _tiktokCategoryFilter = null;
  registerSortRenderer('tiktok', () => renderTiktokTable());

  renderTiktokBody();
}
