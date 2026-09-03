// ── Visão Geral — retrabalhada em 03/09/2026 como resumo consolidado, usando a mesma
// metodologia do Relatório Diário de Aquisição (Slack), sem a parte de "análise" (callouts,
// texto interpretativo) nem "Melhores campanhas" nem os KPIs fixos do "dia" — isso já é coberto
// pelo Diário. Seções: Números do Período (respeita o filtro do topo), Últimos 7 Dias (janela
// fixa, sempre os 7 dias corridos mais recentes — proteção contra a janela de atribuição do
// GA4, igual o relatório do Slack já faz), Previsão até o Fim do Mês (mês corrente fixo, com
// metas do plano Q3), Cadastro por Canal e Cadastro por Categoria (ambos respeitam o filtro).
//
// Nomes prefixados com "geral"/"GERAL_" de propósito — diario.js já declara `weekdayOf` e
// `WEEKDAY_LABELS` no mesmo escopo global (scripts soltos, sem module system), então evitamos
// colidir declarando os nossos próprios equivalentes aqui.

// ── Metas de cadastros por canal, plano Q3 2026 do usuário (não vem do Metabase — valor fixo
// por mês). Usada só na seção "Previsão até o Fim do Mês". Atualizar aqui quando o usuário
// compartilhar metas de meses novos (mesma tabela usada no Relatório Diário de Aquisição).
// `_total`: total oficial do mês no plano do usuário — em julho/agosto bate exato com a soma dos
// 7 canais (10.000), mas em setembro a soma fecha em 10.074 (diferença de 74 mantida como está no
// plano, mesma nota do Relatório Diário). O card/KPI "Meta do Mês" e o % de alcance usam sempre
// `_total` (nunca a soma dos canais), pra bater com o número que o time já vê no relatório do Slack.
const GERAL_METAS_MES = {
  '2026-07': { 'Google Non-brand':4644, 'Google Brand':1632, 'Meta':365, 'Bing':325, 'Afiliados':64,  'Orgânico':2863, 'Outros':107,  _total:10000 },
  '2026-08': { 'Google Non-brand':2955, 'Google Brand':1732, 'Meta':749, 'Bing':369, 'Afiliados':396, 'Orgânico':2848, 'Outros':951,  _total:10000 },
  '2026-09': { 'Google Non-brand':2535, 'Google Brand':1773, 'Meta':776, 'Bing':374, 'Afiliados':540, 'Orgânico':3050, 'Outros':1026, _total:10000 },
};

// ── Feriados nacionais + SP (mesma lista do Relatório Diário de Aquisição) — usados só pra
// projeção de dias restantes do mês (tratados como "dia não-útil", baseline = média de
// sábados+domingos em vez da média do mesmo dia da semana). Atualizar todo início de ano.
const GERAL_FERIADOS = new Set([
  '2025-01-01','2025-01-25','2025-03-03','2025-03-04','2025-04-18','2025-04-21','2025-05-01','2025-06-19','2025-07-09','2025-09-07','2025-10-12','2025-11-02','2025-11-15','2025-11-20','2025-12-25',
  '2026-01-01','2026-01-25','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-07-09','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25',
]);

const GERAL_WD_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const geralWeekday = dateStr => new Date(dateStr+'T12:00:00').getDay();
const geralDiaNaoUtil = dateStr => { const wd = geralWeekday(dateStr); return wd===0 || wd===6 || GERAL_FERIADOS.has(dateStr); };

// ── Cores por canal (reaproveita as cores de marca já usadas no resto do dashboard) ──
const GERAL_CANAL_COLOR = {
  'Google Non-brand':'#0182ab', 'Google Brand':'#045c74', 'Meta':'#ed723e', 'Bing':'#9551FB',
  'TikTok':'#EE1D52', 'Orgânico':'#02A378', 'Afiliados':'#41C78F', 'Outros':'#CECED2',
};
const GERAL_CANAIS_GOALS = ['Google Non-brand','Google Brand','Meta','Bing','Afiliados','Orgânico','Outros']; // ordem da tabela de metas

// Classifica uma linha de cadastro real (jusfy_conversions_daily) num dos 8 "canais" desta aba —
// reaproveita classifyRealConversionChannel (mesma função usada no Diário/Google/Meta/Bing, já
// trata referral errado via utm_campaign+campaignLookup) e só adiciona a quebra Brand/Non-brand
// do Google (mesma regra do Relatório Diário: marketing_category='Brand Search') e o bucket
// "Afiliados" (que a função de canal já joga em "Outros" por não ter padrão de referral próprio).
function geralCanalBucket(row, campaignLookup) {
  if ((row.marketing_category||'').trim().toLowerCase() === 'afiliados') return 'Afiliados';
  const ch = classifyRealConversionChannel(row, campaignLookup);
  if (ch === 'Google Ads') return row.marketing_category === 'Brand Search' ? 'Google Brand' : 'Google Non-brand';
  if (ch === 'Meta Ads') return 'Meta';
  if (ch === 'Bing Ads') return 'Bing';
  if (ch === 'TikTok Ads') return 'TikTok';
  if (ch === 'Orgânico' || ['Social','Comunidade','CRM','ChatGPT'].includes(ch)) return 'Orgânico';
  return 'Outros';
}

// Pra bater com a tabela de metas do plano Q3 (que não tem linha própria de TikTok — é uma fonte
// nova ainda dentro do "Outros" do plano), dobra TikTok dentro de Outros só nesta seção.
function geralGoalsBucket(canalBucket) {
  return canalBucket === 'TikTok' ? 'Outros' : canalBucket;
}

// Classifica pela categoria de marketing crua (Non brand / Brand Search / Orgânico / Afiliados-
// Social) — dimensão diferente do canal: aqui não importa a plataforma, só o tipo de tráfego.
function geralCategoriaBucket(row) {
  const mc = (row.marketing_category||'').trim().toLowerCase();
  if (mc === 'non brand') return 'Non brand';
  if (mc === 'brand search') return 'Brand Search';
  if (mc === 'orgânico' || mc === 'organico' || mc === 'chatgpt') return 'Orgânico';
  if (mc === 'afiliados' || mc === 'social' || mc === 'comunidade' || mc === 'crm') return 'Afiliados/Social';
  return 'Outros';
}

// Gasto de campaign_daily agrupado pelos mesmos buckets de canal (só as 4 plataformas pagas têm
// gasto rastreável — Orgânico/Afiliados/Outros ficam sem gasto, "—" na tabela).
function geralSpendByCanal(campsRaw, start, end) {
  const m = {};
  for (const r of campsRaw) {
    if (r.date < start || r.date > end) continue;
    let canal = null;
    if (r.platform === 'google_ads') canal = campaignCategory(r.campaign_name) === 'Brand Search' ? 'Google Brand' : 'Google Non-brand';
    else if (r.platform === 'meta')       canal = 'Meta';
    else if (r.platform === 'bing_ads')   canal = 'Bing';
    else if (r.platform === 'tiktok_ads') canal = 'TikTok';
    if (!canal) continue;
    m[canal] = (m[canal]||0) + (+r.spend||0);
  }
  return m;
}

// Datas-base usadas pra projetar `dateStr`: se é dia não-útil (fim de semana ou feriado), usa os
// últimos 4 sábados + últimos 4 domingos (8 valores); senão, as últimas 4 ocorrências do mesmo
// dia da semana, pulando datas que caiam em feriado (mesma regra do Relatório Diário).
//
// `cutoff` (obrigatório) = último dia com dado real (ontem). Sem isso, ao projetar um dia perto
// do fim do mês, a busca por "últimos 4 sábados" ou "última mesma quinta-feira" podia encontrar
// outro dia DENTRO do próprio período ainda não realizado (ex: projetando 06/09 achava 05/09 como
// "sábado mais recente" — mas 05/09 também é um dia futuro, sem dado real, então entrava como 0 na
// média e derrubava a projeção). Cada candidata só é aceita se for <= cutoff.
function geralBaselineDates(dateStr, cutoff) {
  if (geralDiaNaoUtil(dateStr)) {
    const sats = [], suns = [];
    let cursor = addDays(new Date(dateStr+'T12:00:00'), -1), guard = 0;
    while ((sats.length < 4 || suns.length < 4) && guard < 120) {
      const wd = cursor.getDay(), ds = fmt(cursor);
      if (ds <= cutoff) {
        if (wd === 6 && sats.length < 4) sats.push(ds);
        if (wd === 0 && suns.length < 4) suns.push(ds);
      }
      cursor = addDays(cursor, -1);
      guard++;
    }
    return [...sats, ...suns];
  }
  const wd = geralWeekday(dateStr);
  const dates = [];
  let cursor = addDays(new Date(dateStr+'T12:00:00'), -7), guard = 0;
  while (dates.length < 4 && guard < 40) {
    const ds = fmt(cursor);
    if (cursor.getDay() === wd && !GERAL_FERIADOS.has(ds) && ds <= cutoff) dates.push(ds);
    cursor = addDays(cursor, -7);
    guard++;
  }
  return dates;
}

// ── Seção 1: Números do Período (respeita o filtro do topo, mesma métrica/estilo do Diário) ──
function geralRenderPeriodo(data) {
  const { campsRaw, ga4, convDaily, cmpCampsRaw, cmpGA4, cmpConvDaily, hasCmp } = data;
  const totSpend = sum(campsRaw, 'spend');
  const totSess  = sum(ga4, 'sessions');
  const totConv  = sum(convDaily, 'clientes_unicos');
  const totCAC   = totConv > 0 ? totSpend / totConv : null;
  const totTX    = totSess > 0 ? totConv / totSess * 100 : 0;

  const cTotSpend = hasCmp ? sum(cmpCampsRaw, 'spend') : undefined;
  const cTotSess  = hasCmp ? sum(cmpGA4, 'sessions')   : undefined;
  const cTotConv  = hasCmp ? sum(cmpConvDaily, 'clientes_unicos') : undefined;
  const cTotCAC   = (hasCmp && cTotConv > 0) ? cTotSpend / cTotConv : undefined;

  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Números do Período — ${disp(S.start)} → ${disp(S.end)}</div>
    <div class="kpi-grid cols-5">
      ${kpiCard('Investimento', totSpend, cTotSpend, fR, 'c-brand')}
      ${kpiCard('Cadastros Reais', totConv, cTotConv, fN, 'c-blue')}
      ${kpiCard('CAC Real', totCAC, cTotCAC, fR, 'c-brand', true)}
      ${kpiCard('Sessões (GA4)', totSess, cTotSess, fN, 'c-green')}
      ${kpiCard('Taxa de Conversão', totTX, undefined, fP, 'c-muted')}
    </div>
  </div>`;
}

// ── Seção 2: Últimos 7 Dias — janela fixa (7 dias corridos terminando ontem), independente do
// filtro do topo. Mostra sessões junto com cadastros de propósito: sessões de um dia podem
// continuar sendo revisadas por até ~14 dias pela sincronização do GA4 (ver bug documentado no
// sync-ga4), então acompanhar a tendência recente ajuda a pegar isso cedo.
function geralRender7Dias(data) {
  const { rows7d } = data;
  const maxConv = Math.max(1, ...rows7d.map(r => r.conversions));
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Últimos 7 Dias</div>
    <div class="section-note">Cadastros, sessões e conversão dia a dia — proteção contra a janela de atribuição do GA4 (sessões de um dia podem seguir sendo revisadas por até ~14 dias). Do mais recente (${disp(rows7d[0].date)}) para o mais antigo (${disp(rows7d[rows7d.length-1].date)}).</div>
    <div style="display:flex;gap:10px;align-items:flex-end;height:110px;margin-bottom:18px;padding:0 4px">
      ${rows7d.map((r,i) => {
        const isWeekend = geralWeekday(r.date)===0 || geralWeekday(r.date)===6;
        const barColor = i===0 ? 'var(--jf-green)' : (isWeekend ? '#D7D8DC' : 'var(--jf-border-strong)');
        return `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px">
          <div style="font-size:12px;font-weight:700;${i===0?'color:var(--jf-green)':''}">${fN(r.conversions)}</div>
          <div style="width:100%;max-width:40px;background:${barColor};border-radius:4px 4px 0 0;height:${Math.max(4,r.conversions/maxConv*56)}px"></div>
          <div style="font-size:11px;color:var(--jf-muted-dark);text-align:center;${i===0?'font-weight:700':''}">${GERAL_WD_LABELS[geralWeekday(r.date)]}<br>${r.date.slice(8,10)}/${r.date.slice(5,7)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Dia</th><th class="r">Cadastros</th><th class="r">Sessões</th><th class="r">Conversão</th></tr></thead>
      <tbody>${rows7d.map(r => `
        <tr style="${r.isPeriodo?'font-weight:700':''}">
          <td>${GERAL_WD_LABELS[geralWeekday(r.date)]} · ${disp(r.date)}</td>
          <td class="r">${fN(r.conversions)}</td>
          <td class="r">${fN(r.sessions)}</td>
          <td class="r">${r.sessions>0?fP(r.conversions/r.sessions*100):'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

// ── Seção 3: Previsão até o Fim do Mês — mês corrente fixo (não usa o filtro do topo), com
// metas do plano Q3 por canal. Realizado = cadastros reais desde dia 1 do mês até ontem;
// Previsto = Realizado + projeção dos dias restantes (baseline por dia da semana, ver
// geralBaselineDates); % de alcance = Previsto ÷ Meta do mês (a pedido do usuário em 03/09/2026 —
// o Relatório Diário do Slack usa Realizado, mas aqui o time prefere ver a projeção do mês
// inteiro batendo ou não com a meta, não só o ritmo parcial até ontem).
function geralRenderPrevisao(data) {
  const { monthKey, monthLabel, realizadoByCanal, previstoByCanal, diasRestantes, pctMesDecorrido } = data;
  const metas = GERAL_METAS_MES[monthKey];

  const totRealizado = GERAL_CANAIS_GOALS.reduce((s,c)=>s+(realizadoByCanal[c]||0),0);
  const totPrevisto   = GERAL_CANAIS_GOALS.reduce((s,c)=>s+(previstoByCanal[c]||0),0);
  // Meta do mês usa sempre o total oficial do plano (_total), não a soma dos canais — em setembro
  // a soma dos 7 canais fecha em 10.074 mas o plano registra o mês como 10.000 (mesma diferença
  // documentada no Relatório Diário).
  const totMeta        = metas ? metas._total : null;
  const pctAlcance      = totMeta ? totPrevisto/totMeta*100 : null;

  if (!metas) {
    return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Previsão até o Fim do Mês — ${monthLabel}</div>
      <div class="c-muted" style="padding:16px;font-size:13px">Meta de cadastros de ${monthLabel} ainda não cadastrada no dashboard (plano Q3 só cobre jul-set/2026). Realizado até ontem: <strong>${fN(totRealizado)}</strong> cadastros reais.</div>
    </div>`;
  }

  // % de alcance usa o Previsto (projeção do mês inteiro), não o Realizado (parcial até ontem) —
  // por isso a cor compara com 100% fixo, não com "% do mês decorrido" (esse corte só faz sentido
  // pra comparar um número parcial contra o ritmo esperado até aqui; o Previsto já representa o
  // mês inteiro, então "bateu a meta ou não" é sempre vs. 100%).
  const pctCls = v => v==null ? '' : (v >= 100 ? 'c-green' : 'c-red');

  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Previsão até o Fim do Mês — ${monthLabel}</div>
    <div class="kpi-grid cols-4" style="margin-bottom:20px">
      ${kpiCard('Realizado (mês)', totRealizado, undefined, fN, 'c-blue')}
      ${kpiCard('Previsto (mês)', totPrevisto, undefined, fN, 'c-muted')}
      ${kpiCard('Meta do Mês', totMeta, undefined, fN, 'c-muted')}
      <div class="card"><div class="kpi-label">% do Alcance da Meta</div>
        <div class="kpi-value ${pctCls(pctAlcance)}">${fP(pctAlcance)}</div>
        <div class="kpi-cmp">faltam ≈ ${fN(Math.max(0,totMeta-totPrevisto))} · ${pctMesDecorrido.toFixed(0)}% do mês decorrido</div>
      </div>
    </div>
    <div class="section-note">Realizado e Previsto são cadastros reais (Metabase), projetados dia a dia por canal usando a média das últimas 4 ocorrências do mesmo dia da semana (pulando feriados). Barra e % do alcance = Previsto do canal ÷ meta do canal, largura limitada a 100%. Meta vem do plano Q3 do time — cor do % de alcance compara com 100% da meta (não com o ritmo do mês, já que o Previsto projeta o mês inteiro). "Outros" agrupa fontes do plano ainda sem rastreamento no Metabase (inclui TikTok Ads, por enquanto).</div>
    ${GERAL_CANAIS_GOALS.map(c => {
      const prev = previstoByCanal[c]||0, meta = metas[c]||0;
      const pct = meta>0 ? prev/meta*100 : 0;
      return `<div class="chbar-row">
        <div class="name">${c}</div>
        <div class="chbar-track"><div class="chbar-fill" style="width:${Math.min(100,pct)}%;background:${GERAL_CANAL_COLOR[c]}"></div></div>
        <div class="val">${fP(pct)}</div>
      </div>`;
    }).join('')}
    <div class="table-wrap" style="margin-top:16px"><table>
      <thead><tr><th>Canal</th><th class="r">Realizado</th><th class="r">Previsto (mês)</th><th class="r">Meta do Mês</th><th class="r">% do Alcance</th></tr></thead>
      <tbody>
        ${GERAL_CANAIS_GOALS.map(c => {
          const real = realizadoByCanal[c]||0, prev = previstoByCanal[c]||0, meta = metas[c]||0;
          const pct = meta>0 ? prev/meta*100 : null;
          return `<tr>
            <td class="name-cell"><span class="swatch" style="background:${GERAL_CANAL_COLOR[c]}"></span>${c}</td>
            <td class="r">${fN(real)}</td>
            <td class="r c-muted">${fN(prev)}</td>
            <td class="r c-muted">${fN(meta)}</td>
            <td class="r ${pctCls(pct)}"><strong>${pct==null?'—':fP(pct)}</strong></td>
          </tr>`;
        }).join('')}
        <tr style="border-top:2px solid #E7E8EC">
          <td><strong>Total</strong></td>
          <td class="r"><strong>${fN(totRealizado)}</strong></td>
          <td class="r"><strong>${fN(totPrevisto)}</strong></td>
          <td class="r"><strong>${fN(totMeta)}</strong></td>
          <td class="r ${pctCls(pctAlcance)}"><strong>${fP(pctAlcance)}</strong></td>
        </tr>
      </tbody>
    </table></div>
  </div>`;
}

// ── Seção 4: Cadastro por Canal (respeita o filtro do topo) — mesmo padrão visual (chbar-row +
// swatch) do Relatório Diário de Aquisição: barra normalizada pelo MAIOR canal do grupo (não pelo
// total), senão canais pequenos ficam com barra invisível ao lado de um canal dominante. ──
function geralRenderCanal(data) {
  const { canalRows, hasCmp, cmpByCanal } = data;
  const total = canalRows.reduce((s,r)=>s+r.cadastros,0);
  const sorted = canalRows.slice().sort((a,b)=>b.cadastros-a.cadastros).filter(r=>r.cadastros>0 || r.spend>0);
  const maxCadastros = Math.max(1, ...sorted.map(r=>r.cadastros));
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Cadastro por Canal</div>
    <div class="section-note">Dados de ${disp(S.start)} → ${disp(S.end)}. Google aberto em Brand Search (marca) e Non-brand.</div>
    ${sorted.map(r => `
      <div class="chbar-row">
        <div class="name">${r.canal}</div>
        <div class="chbar-track"><div class="chbar-fill" style="width:${(r.cadastros/maxCadastros*100).toFixed(1)}%;background:${GERAL_CANAL_COLOR[r.canal]}"></div></div>
        <div class="val">${fN(r.cadastros)}</div>
      </div>`).join('')}
    <div class="table-wrap" style="margin-top:16px"><table>
      <thead><tr><th>Canal</th><th class="r">Cadastros</th><th class="r">Gasto</th><th class="r">CAC</th><th class="r">% do Total</th>${hasCmp?'<th class="r">Δ Cadastros</th>':''}</tr></thead>
      <tbody>${sorted.map(r => {
        const cmp = cmpByCanal ? cmpByCanal[r.canal] : undefined;
        return `<tr>
          <td class="name-cell"><span class="swatch" style="background:${GERAL_CANAL_COLOR[r.canal]}"></span>${r.canal}</td>
          <td class="r">${fN(r.cadastros)}</td>
          <td class="r c-brand">${r.spend>0?fR(r.spend):'<span class="dim">—</span>'}</td>
          <td class="r">${r.cadastros>0&&r.spend>0?fR(r.spend/r.cadastros):'<span class="dim">—</span>'}</td>
          <td class="r c-muted">${total>0?fP(r.cadastros/total*100):'—'}</td>
          ${hasCmp?`<td class="r">${cmp!=null?deltaHtml(r.cadastros,cmp):'<span class="d-neu">novo</span>'}</td>`:''}
        </tr>`;
      }).join('')}
      <tr style="border-top:2px solid #E7E8EC">
        <td><strong>Total</strong></td>
        <td class="r"><strong>${fN(total)}</strong></td>
        <td class="r c-brand"><strong>${fR(sorted.reduce((s,r)=>s+r.spend,0))}</strong></td>
        <td class="r"></td>
        <td class="r"><strong>100%</strong></td>
        ${hasCmp?'<td></td>':''}
      </tr>
      </tbody>
    </table></div>
  </div>`;
}

// ── Seção 5: Cadastro por Categoria (respeita o filtro do topo) ──
function geralRenderCategoria(data) {
  const { categoriaRows, hasCmp, cmpByCategoria } = data;
  const total = categoriaRows.reduce((s,r)=>s+r.cadastros,0);
  const order = ['Non brand','Brand Search','Orgânico','Afiliados/Social','Outros'];
  const sorted = order.map(c => categoriaRows.find(r=>r.categoria===c) || {categoria:c, cadastros:0}).filter(r=>r.cadastros>0);
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Cadastro por Categoria</div>
    <div class="section-note">Dados de ${disp(S.start)} → ${disp(S.end)}.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Categoria</th><th class="r">Cadastros</th><th class="r">% do Total</th>${hasCmp?'<th class="r">Δ Cadastros</th>':''}</tr></thead>
      <tbody>${sorted.length ? sorted.map(r => {
        const cmp = cmpByCategoria ? cmpByCategoria[r.categoria] : undefined;
        return `<tr>
          <td><strong>${r.categoria}</strong></td>
          <td class="r">${fN(r.cadastros)}</td>
          <td class="r c-muted">${total>0?fP(r.cadastros/total*100):'—'}</td>
          ${hasCmp?`<td class="r">${cmp!=null?deltaHtml(r.cadastros,cmp):'<span class="d-neu">novo</span>'}</td>`:''}
        </tr>`;
      }).join('') : emptyRow(hasCmp?4:3)}
      <tr style="border-top:2px solid #E7E8EC">
        <td><strong>Total</strong></td>
        <td class="r"><strong>${fN(total)}</strong></td>
        <td class="r"><strong>100%</strong></td>
        ${hasCmp?'<td></td>':''}
      </tr>
      </tbody>
    </table></div>
  </div>`;
}

async function tabGeral() {
  loading();

  const todayD    = today();
  const yestD     = yesterday();
  const monthStart = fmt(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const monthEnd    = fmt(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0));
  const monthKey    = todayD.slice(0,7);
  const monthLabel  = new Date(monthStart+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const last7Start  = fmt(addDays(new Date(yestD+'T12:00:00'), -6));

  // Janela de histórico pra baseline de projeção: até 9 semanas antes do início do mês corrente,
  // garante 4 ocorrências de qualquer dia da semana mesmo pulando feriados.
  const baselineStart = fmt(addDays(new Date(monthStart+'T12:00:00'), -63));
  const wideStart = baselineStart < last7Start ? baselineStart : last7Start; // cobre as 3 janelas (período filtrado tratado à parte)

  const [
    campsRaw, ga4, convDaily,                              // período filtrado (S.start..S.end)
    cmpCampsRaw, cmpGA4, cmpConvDaily,                      // comparação do período filtrado
    ga47d, conv7d,                                          // últimos 7 dias (janela fixa)
    convWide, campsWide,                                    // janela ampla p/ baseline de projeção
  ] = await Promise.all([
    fetchCamps(S.start, S.end),
    fetchGA4DailyAgg(S.start, S.end),
    fetchJusfyConversionsDailyAgg(S.start, S.end),
    S.compare && S.cmpStart ? fetchCamps(S.cmpStart, S.cmpEnd) : [],
    S.compare && S.cmpStart ? fetchGA4DailyAgg(S.cmpStart, S.cmpEnd) : [],
    S.compare && S.cmpStart ? fetchJusfyConversionsDailyAgg(S.cmpStart, S.cmpEnd) : [],
    fetchGA4DailyAgg(last7Start, yestD),
    fetchJusfyConversionsDailyAgg(last7Start, yestD),
    fetchJusfyConversionsDailyAgg(wideStart, todayD),
    fetchCamps(wideStart, todayD),
  ]);

  const hasCmp = S.compare && !!S.cmpStart && cmpCampsRaw.length + cmpConvDaily.length > 0;

  // ── Seção 1 ──
  const periodoHtml = geralRenderPeriodo({ campsRaw, ga4, convDaily, cmpCampsRaw, cmpGA4, cmpConvDaily, hasCmp });

  // ── Seção 2: Últimos 7 dias (mais recente primeiro) ──
  const sess7Map = Object.fromEntries(ga47d.map(r => [r.date, +r.sessions||0]));
  const conv7Map = {};
  for (const r of conv7d) conv7Map[r.date] = (conv7Map[r.date]||0) + (+r.clientes_unicos||0);
  const dates7 = [];
  for (let i=0;i<7;i++) dates7.push(fmt(addDays(new Date(yestD+'T12:00:00'), -i)));
  const rows7d = dates7.map((d,i) => ({ date:d, sessions: sess7Map[d]||0, conversions: conv7Map[d]||0, isPeriodo: i===0 }));
  const dias7Html = geralRender7Dias({ rows7d });

  // ── Seção 3: Previsão até o fim do mês (canal via campaignLookup construído na janela ampla) ──
  const campaignLookupWide = buildCampaignLookup(campsWide);
  const byDateCanal = {}; // {date: {canal: cadastros}}
  for (const r of convWide) {
    const canal = geralGoalsBucket(geralCanalBucket(r, campaignLookupWide));
    if (!byDateCanal[r.date]) byDateCanal[r.date] = {};
    byDateCanal[r.date][canal] = (byDateCanal[r.date][canal]||0) + (+r.clientes_unicos||0);
  }
  const realizadoByCanal = {};
  for (const c of GERAL_CANAIS_GOALS) realizadoByCanal[c] = 0;
  for (let d = monthStart; d <= yestD; d = fmt(addDays(new Date(d+'T12:00:00'), 1))) {
    const dayData = byDateCanal[d] || {};
    for (const c of GERAL_CANAIS_GOALS) realizadoByCanal[c] += dayData[c] || 0;
  }
  const previstoByCanal = { ...realizadoByCanal };
  for (let d = todayD; d <= monthEnd; d = fmt(addDays(new Date(d+'T12:00:00'), 1))) {
    const baseDates = geralBaselineDates(d, yestD);
    for (const c of GERAL_CANAIS_GOALS) {
      const vals = baseDates.map(bd => (byDateCanal[bd] && byDateCanal[bd][c]) || 0);
      const avg = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
      previstoByCanal[c] += avg;
    }
  }
  for (const c of GERAL_CANAIS_GOALS) previstoByCanal[c] = Math.round(previstoByCanal[c]);
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
  const diasDecorridos = Math.min(diasNoMes, new Date(yestD+'T12:00:00').getDate());
  const pctMesDecorrido = diasDecorridos / diasNoMes * 100;
  const previsaoHtml = geralRenderPrevisao({ monthKey, monthLabel, realizadoByCanal, previstoByCanal, pctMesDecorrido });

  // ── Seções 4 e 5: canal/categoria do período filtrado. Usa sempre campaignLookupWide (janela
  // ampla, já buscada pra Seção 3) em vez de montar um lookup só com as campanhas do período
  // filtrado — um lookup mais estreito muda a classificação de linhas ambíguas (utm_campaign que
  // bate com mais de uma campanha candidata) e fazia "Realizado" da Previsão divergir do total de
  // "Cadastro por Canal" pros mesmos dias. O lookup amplo é sempre um superconjunto, nunca perde
  // campanha nenhuma do período filtrado — só evita ficar mais pobre de contexto que o necessário.
  const spendByCanal = geralSpendByCanal(campsRaw, S.start, S.end);
  const canalMap = {}, categoriaMap = {};
  for (const r of convDaily) {
    const canal = geralCanalBucket(r, campaignLookupWide);
    canalMap[canal] = (canalMap[canal]||0) + (+r.clientes_unicos||0);
    const cat = geralCategoriaBucket(r);
    categoriaMap[cat] = (categoriaMap[cat]||0) + (+r.clientes_unicos||0);
  }
  const canalRows = Object.keys(GERAL_CANAL_COLOR).map(c => ({ canal:c, cadastros: canalMap[c]||0, spend: spendByCanal[c]||0 }));
  const categoriaRows = Object.entries(categoriaMap).map(([categoria,cadastros]) => ({categoria, cadastros}));

  let cmpByCanal, cmpByCategoria;
  if (hasCmp) {
    cmpByCanal = {}; cmpByCategoria = {};
    for (const r of cmpConvDaily) {
      const canal = geralCanalBucket(r, campaignLookupWide);
      cmpByCanal[canal] = (cmpByCanal[canal]||0) + (+r.clientes_unicos||0);
      const cat = geralCategoriaBucket(r);
      cmpByCategoria[cat] = (cmpByCategoria[cat]||0) + (+r.clientes_unicos||0);
    }
  }

  const canalHtml = geralRenderCanal({ canalRows, hasCmp, cmpByCanal });
  const categoriaHtml = geralRenderCategoria({ categoriaRows, hasCmp, cmpByCategoria });

  document.getElementById('content').innerHTML = periodoHtml + dias7Html + previsaoHtml + canalHtml + categoriaHtml;
}
