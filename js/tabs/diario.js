// Regra: GA4 → apenas sessões | conversões → Metabase (jusfy_conversions_daily) | spend → plataformas (campaign_daily)
let _diarioData = null;
let _diarioChannelFilter = null;
let _diarioCategoryFilter = null;
let _diarioWeekdayFilter = new Set(); // vazio = todos os dias
let _diarioWeekdayDropdownOpen = false;

const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekdayOf = dateStr => new Date(dateStr+'T12:00:00').getDay();

function diarioWeekdayLabel() {
  if (_diarioWeekdayFilter.size === 0) return 'Todos os Dias';
  if (_diarioWeekdayFilter.size === 7) return 'Todos os Dias';
  const sorted = [..._diarioWeekdayFilter].sort((a,b)=>a-b);
  if (sorted.length <= 3) return sorted.map(i => WEEKDAY_LABELS[i]).join(', ');
  return `${sorted.length} dias selecionados`;
}

function toggleDiarioWeekdayDropdown() {
  _diarioWeekdayDropdownOpen = !_diarioWeekdayDropdownOpen;
  renderDiarioBody();
  if (_diarioWeekdayDropdownOpen) {
    // fecha ao clicar fora — listener único, removido ao fechar
    setTimeout(() => document.addEventListener('click', closeDiarioWeekdayDropdownOutside), 0);
  }
}

function closeDiarioWeekdayDropdownOutside(e) {
  if (e.target.closest('#diarioWeekdayDropdown')) return;
  _diarioWeekdayDropdownOpen = false;
  document.removeEventListener('click', closeDiarioWeekdayDropdownOutside);
  renderDiarioBody();
}

function toggleDiarioWeekdayDay(idx) {
  if (_diarioWeekdayFilter.has(idx)) _diarioWeekdayFilter.delete(idx);
  else _diarioWeekdayFilter.add(idx);
  renderDiarioBody();
}

function clearDiarioWeekdayFilter() {
  _diarioWeekdayFilter = new Set();
  renderDiarioBody();
}

// Recalcula os totais (KPIs + rodapé) a partir de um subconjunto de linhas — usado quando o filtro
// de dia da semana reduz as linhas exibidas, pra manter os totais coerentes com o que está na tabela.
function aggregateDiarioRows(rows, hasCmpBase) {
  const totSpend = sum(rows, 'spend');
  const totSess  = sum(rows, 'sessions');
  const totConv  = sum(rows, 'conversions');
  const totCAC   = totConv > 0 ? totSpend / totConv : null;
  const totTX    = totSess > 0 ? totConv / totSess * 100 : 0;

  const withCmp = hasCmpBase ? rows.filter(r => r.cmpRow) : [];
  const cTotSpend = hasCmpBase ? withCmp.reduce((s,r)=>s+r.cmpRow.spend, 0) : undefined;
  const cTotConv  = hasCmpBase ? withCmp.reduce((s,r)=>s+r.cmpRow.conversions, 0) : undefined;
  const cTotCAC   = (cTotConv && cTotSpend && cTotConv > 0) ? cTotSpend / cTotConv : undefined;

  return { totSpend, totSess, totConv, totCAC, totTX, cTotSpend, cTotConv, cTotCAC };
}

function spendByDate(campRows, channelFilter, categoryFilter) {
  const m = {};
  if (channelFilter === 'Orgânico') return m; // orgânico não tem spend de ads
  for (const r of campRows) {
    if (channelFilter === 'Google Ads' && r.platform !== 'google_ads') continue;
    if (channelFilter === 'Meta Ads'   && r.platform !== 'meta')       continue;
    if (channelFilter === 'Bing Ads'   && r.platform !== 'bing_ads')   continue;
    if (channelFilter === 'TikTok Ads' && r.platform !== 'tiktok_ads') continue;
    if (categoryFilter && campaignCategory(r.campaign_name) !== categoryFilter) continue;
    if (!m[r.date]) m[r.date] = 0;
    m[r.date] += +r.spend || 0;
  }
  return m;
}

function convByDate(convRows, channelFilter, categoryFilter, campaignLookup) {
  const m = {};
  for (const r of convRows) {
    const ch = classifyRealConversionChannel(r, campaignLookup);
    if (channelFilter && ch !== channelFilter) continue;
    if (categoryFilter && (r.marketing_category||'') !== categoryFilter) continue;
    if (!m[r.date]) m[r.date] = 0;
    m[r.date] += +r.clientes_unicos || 0;
  }
  return m;
}

function sessionsByDate(rows) {
  const m = {};
  for (const r of rows) { if (!m[r.date]) m[r.date]=0; m[r.date] += +r.sessions||0; }
  return m;
}

// Investimento por plataforma (quadrante inicial, igual Visão Geral) — honra os mesmos filtros da
// aba (canal/categoria/dia da semana). Se o canal selecionado não é a plataforma, retorna 0 (mantém
// soma das 3 plataformas == Investimento Total, igual acontece em spendByDate).
function platformSpendTotal(campRows, platform, channelFilter, categoryFilter, weekdaySet) {
  const label = platform === 'google_ads' ? 'Google Ads' : platform === 'meta' ? 'Meta Ads' : platform === 'bing_ads' ? 'Bing Ads' : 'TikTok Ads';
  if (channelFilter && channelFilter !== label) return 0;
  let s = 0;
  for (const r of campRows) {
    if (r.platform !== platform) continue;
    if (categoryFilter && campaignCategory(r.campaign_name) !== categoryFilter) continue;
    if (weekdaySet && weekdaySet.size > 0 && !weekdaySet.has(weekdayOf(r.date))) continue;
    s += +r.spend || 0;
  }
  return s;
}

function clicksImprTotals(campRows, channelFilter, categoryFilter, weekdaySet) {
  if (channelFilter === 'Orgânico') return { clicks: 0, impr: 0 };
  let clicks = 0, impr = 0;
  for (const r of campRows) {
    if (channelFilter === 'Google Ads' && r.platform !== 'google_ads') continue;
    if (channelFilter === 'Meta Ads'   && r.platform !== 'meta')       continue;
    if (channelFilter === 'Bing Ads'   && r.platform !== 'bing_ads')   continue;
    if (channelFilter === 'TikTok Ads' && r.platform !== 'tiktok_ads') continue;
    if (categoryFilter && campaignCategory(r.campaign_name) !== categoryFilter) continue;
    if (weekdaySet && weekdaySet.size > 0 && !weekdaySet.has(weekdayOf(r.date))) continue;
    clicks += +r.clicks || 0;
    impr   += +r.impressions || 0;
  }
  return { clicks, impr };
}

// Série do gráfico diário de conversões — consolidado (investimento total, não separado por
// plataforma), a partir das linhas já filtradas (canal/categoria/dia da semana) da tabela.
function buildDiarioChartSeries(rows) {
  const sorted = [...rows].sort((a, b) => a.date < b.date ? -1 : 1);
  if (sorted.length <= 45) {
    return {
      labels: sorted.map(r => r.date.slice(5).split('-').reverse().join('/')),
      spend:  sorted.map(r => r.spend),
      conv:   sorted.map(r => r.conversions),
      cac:    sorted.map(r => r.cac),
    };
  }
  const mMap = {};
  for (const r of sorted) {
    const mon = r.date.slice(0, 7);
    if (!mMap[mon]) mMap[mon] = { spend: 0, conv: 0 };
    mMap[mon].spend += r.spend;
    mMap[mon].conv  += r.conversions;
  }
  const months = Object.keys(mMap).sort();
  const spend = months.map(m => mMap[m].spend);
  const conv  = months.map(m => mMap[m].conv);
  return {
    labels: months.map(mon => new Date(mon + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })),
    spend, conv,
    cac: spend.map((s, i) => conv[i] > 0 ? s / conv[i] : null),
  };
}

function buildDiarioView(data, channelFilter, categoryFilter) {
  const { campsRaw, convDaily, ga4, cmpCampsRaw, cmpConvDaily, cmpGA4, hasCmpBase, campaignLookup } = data;

  const spendMap    = spendByDate(campsRaw, channelFilter, categoryFilter);
  const convMap     = convByDate(convDaily, channelFilter, categoryFilter, campaignLookup);
  const ga4Map      = sessionsByDate(ga4);
  const cmpSpendMap = spendByDate(cmpCampsRaw, channelFilter, categoryFilter);
  const cmpConvMap  = convByDate(cmpConvDaily, channelFilter, categoryFilter, campaignLookup);
  const cmpGa4Map   = sessionsByDate(cmpGA4);

  const dates = [...new Set([...Object.keys(spendMap), ...Object.keys(ga4Map), ...Object.keys(convMap)])].sort().reverse();

  const totSpend = Object.values(spendMap).reduce((s,v)=>s+v, 0);
  const totSess  = Object.values(ga4Map).reduce((s,v)=>s+v, 0);
  const totConv  = Object.values(convMap).reduce((s,v)=>s+v, 0);
  const totCAC   = totConv > 0 ? totSpend / totConv : null;
  const totTX    = totSess > 0 ? totConv / totSess * 100 : 0;

  const cTotSpend = hasCmpBase ? Object.values(cmpSpendMap).reduce((s,v)=>s+v, 0) : undefined;
  const cTotSess  = hasCmpBase ? Object.values(cmpGa4Map).reduce((s,v)=>s+v, 0)   : undefined;
  const cTotConv  = hasCmpBase ? Object.values(cmpConvMap).reduce((s,v)=>s+v, 0)  : undefined;
  const cTotCAC   = (cTotConv && cTotSpend && cTotConv > 0) ? cTotSpend / cTotConv : undefined;

  const rows = dates.map(d => {
    const spend       = spendMap[d] || 0;
    const sessions    = ga4Map[d]   || 0;
    const conversions = convMap[d]  || 0;
    const cac = conversions > 0 ? spend / conversions : null;
    const tx  = sessions > 0 ? conversions / sessions * 100 : 0;

    let cmpRow = null;
    if (hasCmpBase) {
      const diffDays = Math.round((new Date(d) - new Date(S.start)) / 864e5);
      const cd  = fmt(addDays(new Date(S.cmpStart), diffDays));
      const cs  = cmpSpendMap[cd] || 0;
      const ccv = cmpConvMap[cd]  || 0;
      cmpRow = { spend: cs, conversions: ccv, cac: ccv > 0 ? cs / ccv : null };
    }

    return { date: d, spend, sessions, conversions, cac, tx, cmpRow };
  });

  return { rows, totSpend, totSess, totConv, totCAC, totTX, cTotSpend, cTotSess, cTotConv, cTotCAC, hasCmp: hasCmpBase };
}

function renderDiarioBody(filterChannel, filterCategory) {
  if (filterChannel !== undefined)  _diarioChannelFilter  = filterChannel;
  if (filterCategory !== undefined) _diarioCategoryFilter = filterCategory;
  if (!_diarioData) return;

  const view = buildDiarioView(_diarioData, _diarioChannelFilter, _diarioCategoryFilter);
  let { rows, totSpend, totSess, totConv, totCAC, totTX, cTotSpend, cTotSess, cTotConv, cTotCAC, hasCmp } = view;

  if (_diarioWeekdayFilter.size > 0) {
    rows = rows.filter(r => _diarioWeekdayFilter.has(weekdayOf(r.date)));
    ({ totSpend, totSess, totConv, totCAC, totTX, cTotSpend, cTotConv, cTotCAC } = aggregateDiarioRows(rows, hasCmp));
  }

  const { campsRaw, cmpCampsRaw } = _diarioData;
  const gSpend  = platformSpendTotal(campsRaw, 'google_ads', _diarioChannelFilter, _diarioCategoryFilter, _diarioWeekdayFilter);
  const mSpend  = platformSpendTotal(campsRaw, 'meta',       _diarioChannelFilter, _diarioCategoryFilter, _diarioWeekdayFilter);
  const biSpend = platformSpendTotal(campsRaw, 'bing_ads',   _diarioChannelFilter, _diarioCategoryFilter, _diarioWeekdayFilter);
  const ttSpend = platformSpendTotal(campsRaw, 'tiktok_ads', _diarioChannelFilter, _diarioCategoryFilter, _diarioWeekdayFilter);
  const { clicks: totClicks, impr: totImpr } = clicksImprTotals(campsRaw, _diarioChannelFilter, _diarioCategoryFilter, _diarioWeekdayFilter);
  const ctr = totImpr > 0 ? totClicks / totImpr * 100 : 0;

  const cGSpend  = hasCmp ? platformSpendTotal(cmpCampsRaw, 'google_ads', _diarioChannelFilter, _diarioCategoryFilter, null) : undefined;
  const cMSpend  = hasCmp ? platformSpendTotal(cmpCampsRaw, 'meta',       _diarioChannelFilter, _diarioCategoryFilter, null) : undefined;
  const cBiSpend = hasCmp ? platformSpendTotal(cmpCampsRaw, 'bing_ads',   _diarioChannelFilter, _diarioCategoryFilter, null) : undefined;
  const cTtSpend = hasCmp ? platformSpendTotal(cmpCampsRaw, 'tiktok_ads', _diarioChannelFilter, _diarioCategoryFilter, null) : undefined;

  const chartSeries = buildDiarioChartSeries(rows);

  const st     = getSort('diario', 'date', 'desc');
  const sorted = sortRows(rows, st.key, st.dir);

  document.getElementById('content').innerHTML = `
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Canal</label>
      <select id="diarioChannelFilter" onchange="renderDiarioBody(this.value||null, undefined)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:180px">
        <option value="" ${!_diarioChannelFilter?'selected':''}>Todos os Canais</option>
        <option value="Orgânico"  ${_diarioChannelFilter==='Orgânico'?'selected':''}>Orgânico</option>
        <option value="Google Ads" ${_diarioChannelFilter==='Google Ads'?'selected':''}>Google Ads</option>
        <option value="Meta Ads"   ${_diarioChannelFilter==='Meta Ads'?'selected':''}>Meta Ads</option>
        <option value="Bing Ads"   ${_diarioChannelFilter==='Bing Ads'?'selected':''}>Bing Ads</option>
        <option value="TikTok Ads" ${_diarioChannelFilter==='TikTok Ads'?'selected':''}>TikTok Ads</option>
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Categoria</label>
      <select id="diarioCategoryFilter" onchange="renderDiarioBody(undefined, this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:160px">
        <option value="" ${!_diarioCategoryFilter?'selected':''}>Todas as Categorias</option>
        <option value="Non brand" ${_diarioCategoryFilter==='Non brand'?'selected':''}>Non brand</option>
        <option value="Brand Search" ${_diarioCategoryFilter==='Brand Search'?'selected':''}>Brand Search</option>
      </select>
    </div>
    <div id="diarioWeekdayDropdown" style="position:relative;display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Dia da Semana</label>
      <button type="button" onclick="event.stopPropagation();toggleDiarioWeekdayDropdown()"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:160px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${diarioWeekdayLabel()}</span><span style="color:#212121BF;font-size:10px">▾</span>
      </button>
      ${_diarioWeekdayDropdownOpen ? `
        <div onclick="event.stopPropagation()" style="position:absolute;top:100%;left:0;margin-top:4px;background:#ffffff;border:1px solid #E7E8EC;border-radius:8px;padding:8px;z-index:20;min-width:170px;box-shadow:0 4px 16px rgba(0,0,0,.12)">
          ${WEEKDAY_LABELS.map((label, idx) => `
            <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:13px;border-radius:4px" onmouseover="this.style.background='#FAFAFA'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" onchange="toggleDiarioWeekdayDay(${idx})" ${_diarioWeekdayFilter.has(idx)?'checked':''} style="cursor:pointer">
              ${label}
            </label>`).join('')}
          <div style="border-top:1px solid #E7E8EC;margin-top:6px;padding-top:6px;text-align:right">
            <button type="button" onclick="clearDiarioWeekdayFilter()" style="background:none;border:none;color:#02A378;font-size:12px;cursor:pointer;font-weight:600">Limpar</button>
          </div>
        </div>
      ` : ''}
    </div>
  </div>

  <div class="kpi-grid cols-5" style="margin-bottom:20px">
    ${kpiCard('Investimento Total', totSpend, cTotSpend, fR, 'c-brand')}
    ${kpiCard('Google Ads',         gSpend,   cGSpend,   fR, 'c-blue')}
    ${kpiCard('Meta Ads',           mSpend,   cMSpend,   fR, 'c-yellow')}
    ${kpiCard('Bing Ads',           biSpend,  cBiSpend,  fR, 'c-green')}
    ${kpiCard('TikTok Ads',         ttSpend,  cTtSpend,  fR, 'c-red')}
  </div>
  <div class="kpi-grid cols-4" style="margin-bottom:20px">
    ${kpiCard('Sessões (GA4)',    totSess, cTotSess, fN, 'c-green')}
    ${kpiCard('CTR Médio',        ctr,     undefined, fP, 'c-muted')}
    ${kpiCard('CAC Real',         totCAC,  cTotCAC,  fR, 'c-brand', true)}
    ${kpiCard('Conversões Totais (Metabase)', totConv, cTotConv, fN, 'c-blue')}
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Conversões Diárias (Consolidado)</div>
    <div style="height:300px;position:relative">
      ${chartSeries.labels.length===0 ? '<div class="c-muted" style="text-align:center;padding:40px;font-size:13px">Sem dados</div>' : '<canvas id="diarioChart"></canvas>'}
    </div>
  </div>

  <div class="card">
    <div class="card-title" style="margin-bottom:14px">
      Performance Diária — ${disp(S.start)} → ${disp(S.end)}
      <span style="font-size:11px;font-weight:400;color:#212121BF">${rows.length} dias</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        ${sortTh('diario','Data','date','desc','')}
        <th>Dia</th>
        ${sortTh('diario','Sessões','sessions')}
        ${sortTh('diario','Cadastros','conversions')}
        ${sortTh('diario','TX. Conversão','tx')}
        ${sortTh('diario','CAC Real','cac')}
        ${sortTh('diario','Investimento','spend')}
        ${hasCmp ? '<th class="r">Δ CAC</th><th class="r">Δ Invest.</th>' : ''}
      </tr></thead>
      <tbody>
        ${sorted.length ? sorted.map(r => {
          const cacCls = r.cac !== null && r.cac < 300 ? 'c-brand' : r.cac !== null && r.cac < 600 ? 'c-yellow' : 'c-red';
          const txCls  = r.tx > 0.5 ? 'c-green' : r.tx > 0.2 ? '' : 'c-muted';
          const noData = r.spend === 0 && r.sessions === 0;
          return `<tr style="${noData ? 'opacity:.45' : ''}">
            <td><strong>${disp(r.date)}</strong></td>
            <td class="c-muted">${WEEKDAY_LABELS[weekdayOf(r.date)]}</td>
            <td class="r">${fN(r.sessions)}</td>
            <td class="r"><strong>${fN(Math.round(r.conversions))}</strong></td>
            <td class="r ${txCls}">${fP(r.tx)}</td>
            <td class="r"><strong class="${cacCls}">${r.cac !== null ? fR(r.cac) : '—'}</strong></td>
            <td class="r">${fR(r.spend)}</td>
            ${hasCmp && r.cmpRow ? `
              <td class="r">${r.cmpRow.cac !== null ? deltaHtml(r.cac, r.cmpRow.cac, true) || fR(r.cmpRow.cac) : '—'}</td>
              <td class="r">${deltaHtml(r.spend, r.cmpRow.spend) || fR(r.cmpRow.spend)}</td>
            ` : hasCmp ? '<td class="r c-muted">—</td><td class="r c-muted">—</td>' : ''}
          </tr>`;
        }).join('') : emptyRow(hasCmp ? 9 : 7)}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #E7E8EC;background:#ffffff">
          <td><strong>Total</strong></td>
          <td></td>
          <td class="r"><strong>${fN(totSess)}</strong></td>
          <td class="r"><strong>${fN(Math.round(totConv))}</strong></td>
          <td class="r"><strong>${fP(totTX)}</strong></td>
          <td class="r"><strong class="c-brand">${totCAC !== null ? fR(totCAC) : '—'}</strong></td>
          <td class="r"><strong class="c-brand">${fR(totSpend)}</strong></td>
          ${hasCmp ? '<td></td><td></td>' : ''}
        </tr>
      </tfoot>
    </table></div>
  </div>`;

  renderComboChart('diarioChart', chartSeries.labels,
    [{ label:'Investimento', data:chartSeries.spend, backgroundColor:'#02A378' }],
    [
      { label:'Cadastros Reais', data:chartSeries.conv, borderColor:'#212121', yAxisID:'y1' },
      { label:'CAC', data:chartSeries.cac, borderColor:'#e05a69', yAxisID:'y', borderDash:[5,3] },
    ]);
}

async function tabDiario() {
  loading();
  const [campsRaw, ga4, cmpCampsRaw, cmpGA4, convDaily, cmpConvDaily] = await Promise.all([
    fetchCamps(S.start, S.end),
    fetchGA4DailyAgg(S.start, S.end),
    S.compare && S.cmpStart ? fetchCamps(S.cmpStart, S.cmpEnd) : [],
    S.compare && S.cmpStart ? fetchGA4DailyAgg(S.cmpStart, S.cmpEnd)  : [],
    fetchJusfyConversionsDailyAgg(S.start, S.end),
    S.compare && S.cmpStart ? fetchJusfyConversionsDailyAgg(S.cmpStart, S.cmpEnd) : [],
  ]);

  const hasCmpBase = S.compare && !!S.cmpStart && cmpCampsRaw.length > 0;

  const campaignLookup = buildCampaignLookup(campsRaw);

  _diarioData = { campsRaw, ga4, cmpCampsRaw, cmpGA4, convDaily, cmpConvDaily, hasCmpBase, campaignLookup };
  _diarioChannelFilter = null;
  _diarioCategoryFilter = null;
  _diarioWeekdayFilter = new Set();
  _diarioWeekdayDropdownOpen = false;
  registerSortRenderer('diario', () => renderDiarioBody());
  renderDiarioBody();
}
