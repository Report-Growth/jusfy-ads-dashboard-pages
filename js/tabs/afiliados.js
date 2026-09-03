// ── Afiliados/Influenciadores — campanha(s) do Meta Ads que remuneram afiliados/influenciadores
// por indicação (comissão, não leilão de mídia) — separada do resto do Meta Ads a pedido do
// usuário em 03/09/2026, pra não misturar custo/resultado desse canal com o desempenho de mídia
// paga tradicional (CAC/CTR de Meta Ads ficavam distorcidos). Mesmo padrão de tabs/tiktok.js (sem
// sub-abas de criativos/keywords — essa campanha já é filtrada fora do "Criativos Fundo/Topo" do
// Meta Ads, ver switchMetaSubTab em meta.js). Nome(s) de campanha em AFILIADOS_CAMPAIGN_NAMES
// (conversions-match.js) — hoje só "meta_leads_fundo_afiliados".
let _afiliadosData = null;
let _afiliadosFilter = null;

function renderAfiliadosChart() {
  const { chart, agg, dailySpendByGroup: spendMap, dailyConvByGroup: convMap, allDates } = _afiliadosData;
  let series = chart;

  if (_afiliadosFilter) {
    const matchingGids = new Set(agg.filter(r => r.campaign_name === _afiliadosFilter).map(r => r._groupId));
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

  renderComboChart('afiliadosChart', series.labels, [{ label:'Afiliados/Influenciadores', data:series.spend, backgroundColor:'#41C78F' }], [
    { label:'Cadastros Reais', data:series.conv, borderColor:'#017858', yAxisID:'y1' },
    { label:'CAC', data:series.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
  ]);
}

function renderAfiliadosTable(filterCamp) {
  if (filterCamp !== undefined) _afiliadosFilter = filterCamp;
  if (!_afiliadosData) return;
  const { agg, cmpAgg, cmpMap, hasCmp } = _afiliadosData;
  const filterVal = _afiliadosFilter;
  const matches   = r => !filterVal || r.campaign_name === filterVal;
  const filtered0   = agg.filter(matches);
  const cmpFiltered = cmpAgg.filter(matches);

  const st = getSort('afiliados', 'spend', 'desc');
  const filtered = sortRows(filtered0, st.key, st.dir);

  const totSpend = sum(filtered,'spend'), totClicks=sum(filtered,'clicks'), totConv=sum(filtered,'conversions');
  const totImpr = sum(filtered,'impressions'), totSessions = sum(filtered,'sessions');
  const totCTR = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totTx  = totSessions>0 ? totConv/totSessions*100 : 0;
  const totCac = totConv>0 ? totSpend/totConv : null;
  const cTotSpend = cmpFiltered.length ? sum(cmpFiltered,'spend')       : undefined;
  const cTotClick = cmpFiltered.length ? sum(cmpFiltered,'clicks')      : undefined;
  const cTotConv  = cmpFiltered.length ? sum(cmpFiltered,'conversions') : undefined;

  document.getElementById('af-kpis').innerHTML =
    kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-green') +
    kpiCard('Cliques',      totClicks, cTotClick, fN, 'c-blue') +
    kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-yellow') +
    kpiCard('CAC Real Médio', totConv>0?totSpend/totConv:null, (cTotConv&&cTotSpend&&cTotConv>0)?cTotSpend/cTotConv:undefined, fR, 'c-brand', true);

  document.getElementById('af-thead').innerHTML =
    `<th>#</th>${sortTh('afiliados','Campanha','campaign_name','asc','')}
     ${sortTh('afiliados','Gasto','spend')}${sortTh('afiliados','Impressões','impressions')}
     ${sortTh('afiliados','Cliques','clicks')}${sortTh('afiliados','Sessões','sessions')}
     ${sortTh('afiliados','CTR','ctr')}${sortTh('afiliados','Tx Conversão','txConv')}
     ${sortTh('afiliados','Cadastros','conversions')}${sortTh('afiliados','CAC Real','cpa')}
     ${hasCmp?'<th class="r">Δ Gasto</th>':''}`;

  if (_afiliadosData.chart.labels.length) renderAfiliadosChart();

  document.getElementById('af-tbody').innerHTML = filtered.length ? filtered.map((r,i) => {
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

  document.getElementById('af-tfoot').innerHTML = filtered.length ? `
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

function renderAfiliadosBody() {
  document.getElementById('content').innerHTML = `
  ${_afiliadosData.agg.length > 1 ? `
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Campanha</label>
      <select id="afiliadosCampFilter" onchange="renderAfiliadosTable(this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:280px">
        <option value="">Todas as Campanhas</option>
        ${_afiliadosData.agg.map(r=>r.campaign_name).map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
      </select>
    </div>
  </div>` : ''}
  <div class="section-note" style="margin-bottom:16px">Campanha de comissão por indicação (Meta Ads) — separada do restante do Meta Ads, pra não misturar custo/resultado de afiliados/influenciadores com o desempenho de mídia paga tradicional.</div>
  <div class="kpi-grid cols-4" id="af-kpis" style="margin-bottom:20px"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Investimento Diário × Cadastros Reais</div>
    <div style="height:300px;position:relative">
      ${_afiliadosData.chart.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="afiliadosChart"></canvas>'}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Afiliados/Influenciadores — Campanhas (${disp(S.start)} → ${disp(S.end)})</div>
    <div class="table-wrap"><table>
      <thead><tr id="af-thead"></tr></thead>
      <tbody id="af-tbody"></tbody>
      <tfoot><tr id="af-tfoot" style="border-top:2px solid #E7E8EC;background:#ffffff"></tr></tfoot>
    </table></div>
  </div>`;

  renderAfiliadosTable(null);
  renderAfiliadosChart();
}

async function tabAfiliados() {
  loading();
  const isAfCamp = r => r.platform === 'meta' && isAfiliadosCampaign(r.campaign_name);

  const [campAgg, cmpCampAgg, ga4Camp, cmpGA4Camp, convRows, cmpConvRows, convDaily, campsRaw] = await Promise.all([
    fetchCampAgg(S.start, S.end),
    S.compare && S.cmpStart ? fetchCampAgg(S.cmpStart, S.cmpEnd) : [],
    fetchGA4SessionsByCampaign(S.start, S.end),
    S.compare && S.cmpStart ? fetchGA4SessionsByCampaign(S.cmpStart, S.cmpEnd) : [],
    fetchJusfyConversionsByCampaign(S.start, S.end),
    S.compare && S.cmpStart ? fetchJusfyConversionsByCampaign(S.cmpStart, S.cmpEnd) : [],
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

  const aggRaw    = addMetrics(campAgg.filter(isAfCamp), sessMap);
  const cmpAggRaw = cmpCampAgg.length ? addMetrics(cmpCampAgg.filter(isAfCamp), cmpSessMap) : [];

  // Substitui conversões/CPA de plataforma pelas conversões reais do Metabase (jusfy_conversions_daily)
  const agg    = mergeRealConversions(aggRaw, convRows, 'meta');
  const cmpAgg = cmpAggRaw.length ? mergeRealConversions(cmpAggRaw, cmpConvRows, 'meta') : [];
  const cmpMap = Object.fromEntries(cmpAgg.map(r=>[r.campaign_name,r]));
  const hasCmp = S.compare && cmpAgg.length > 0;

  const spendByDate = {};
  for (const r of campsRaw) if (isAfCamp(r)) spendByDate[r.date] = (spendByDate[r.date]||0) + (+r.spend||0);
  const campaignLookup = buildCampaignLookup(campsRaw);
  const channelConvMap = aggregateDailyRealConversionsByChannel(convDaily, campaignLookup);
  const chart = buildComboChartSeries(S.start, S.end, spendByDate, channelConvMap, 'Afiliados/Influenciadores');

  // Mesma quebra diária, mas por grupo de campanha (não por canal) — usada quando o usuário filtra
  // por campanha, pra refazer o gráfico só com o grupo marcado.
  const { groupIdOf } = buildCampaignGroupIndex(aggRaw, 'meta');
  const spendByGroupMap = dailySpendByGroup(campsRaw.filter(isAfCamp), groupIdOf);
  const convByGroupMap = dailyRealConversionsByGroup(convDaily, aggRaw, 'meta');
  const allDates = Object.keys(spendByDate);

  _afiliadosData = { agg, cmpAgg, cmpMap, hasCmp, chart, campaignLookup,
    dailySpendByGroup: spendByGroupMap, dailyConvByGroup: convByGroupMap, allDates };
  _afiliadosFilter = null;
  registerSortRenderer('afiliados', () => renderAfiliadosTable());

  renderAfiliadosBody();
}
