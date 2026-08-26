// ── Tabela de palavras-chave (Google Ads / Bing Ads), reaproveitada pelas duas abas ──
// Guiada pelos cadastros reais (jusfy_keyword_conversions_daily), enriquecida com gasto/cliques da
// KEYWORD configurada pelo anunciante (search_term_daily, apesar do nome da tabela, guarda a keyword —
// ad_group_criterion.keyword.text no Google / coluna Keyword no Bing — não o termo de busca literal;
// o utm_term que a Jusfy manda é o {keyword} do ValueTrack, confirmado em 16/07/2026). Sem gasto -> sem
// CAC, mas o cadastro real continua exibido.

function renderKeywordTable(rows, tableId, platformLabel) {
  if (!rows.length) return `<div class="card"><div class="card-title">🔎 ${platformLabel} — Palavras-chave</div><div class="c-muted" style="padding:20px;text-align:center;font-size:13px">Sem cadastros reais atribuídos a palavras-chave no período</div></div>`;

  const st     = getSort(tableId, 'cadastros', 'desc');
  const sorted = sortRows(rows, st.key, st.dir);
  const totSpend  = rows.reduce((s,r)=>s+(r.spend||0),0);
  const totCad    = rows.reduce((s,r)=>s+(r.cadastros||0),0);
  const totClicks = rows.reduce((s,r)=>s+(r.clicks||0),0);
  const totCpa    = totCad>0 ? totSpend/totCad : null;
  const semGasto = rows.filter(r=>r.spend==null).length;

  const bodyRows = sorted.map(r => {
    const cpaCls = r.cpa==null ? 'c-muted' : r.cpa<100 ? 'c-green' : r.cpa<200 ? 'c-yellow' : 'c-red';
    return `<tr>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px"><strong>${escHtml(r.keyword||'—')}</strong></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" class="c-muted">${escHtml(r.campaign_name||'—')}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" class="c-muted">${escHtml(r.ad_group_name||'—')}</td>
      <td class="r">${r.clicks!=null ? fN(r.clicks) : '<span class="c-muted">—</span>'}</td>
      <td class="r c-brand">${r.spend!=null ? fR(r.spend) : '<span class="c-muted">sem gasto sincronizado</span>'}</td>
      <td class="r"><strong>${fN(r.cadastros)}</strong></td>
      <td class="r ${cpaCls}">${r.cpa!=null ? fR(r.cpa) : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="card">
    <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <span>🔎 ${platformLabel} — Palavras-chave</span>
        <span class="badge by">${sorted.length} KEYWORDS</span>
      </div>
      <span style="font-size:11px;color:#212121BF;font-weight:400">${fN(totCad)} cadastros reais · ${fR(totSpend)} gasto atribuído${semGasto?` · ${semGasto} keyword(s) sem gasto sincronizado`:''}</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        ${sortTh(tableId,'Palavra-chave','keyword','asc','')}
        ${sortTh(tableId,'Campanha','campaign_name','asc','')}
        ${sortTh(tableId,'Grupo de Anúncios','ad_group_name','asc','')}
        ${sortTh(tableId,'Cliques','clicks')}
        ${sortTh(tableId,'Gasto','spend')}
        ${sortTh(tableId,'Cadastros Reais','cadastros')}
        ${sortTh(tableId,'CAC Real','cpa')}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr style="border-top:2px solid #E7E8EC;background:#ffffff">
        <td colspan="3"><strong>Total</strong></td>
        <td class="r"><strong>${fN(totClicks)}</strong></td>
        <td class="r c-brand"><strong>${fR(totSpend)}</strong></td>
        <td class="r"><strong>${fN(totCad)}</strong></td>
        <td class="r"><strong>${totCpa!=null?fR(totCpa):'—'}</strong></td>
      </tr></tfoot>
    </table></div>
  </div>`;
}

// Barra de filtros (Campanha + Conjunto/Grupo de Anúncios) para a sub-aba de palavras-chave.
// `allRows` é o dataset completo (não filtrado) — usado só pra montar as opções dos selects.
// `filters` é {campaign, adGroup}. `onChangeFn` é o nome global da função a chamar no onchange
// (ex: 'renderGoogleKeywords'), que recebe (novaCampanha, novoGrupo) — undefined = não mudou.
function keywordFilterBar(allRows, filters, onChangeFn) {
  const campaigns = [...new Set(allRows.map(r => r.campaign_name))].sort();
  const adGroups  = [...new Set(allRows.filter(r => !filters.campaign || r.campaign_name === filters.campaign).map(r => r.ad_group_name))].sort();
  return `<div style="margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Filtrar Campanha</label>
      <select onchange="${onChangeFn}(this.value||null, null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:260px">
        <option value="">Todas as Campanhas</option>
        ${campaigns.map(c => `<option value="${escHtml(c)}" ${filters.campaign===c?'selected':''}>${escHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:12px;color:#212121BF;white-space:nowrap">Conjunto/Grupo de Anúncios</label>
      <select onchange="${onChangeFn}(undefined, this.value||null)"
        style="background:#ffffff;border:1px solid #E7E8EC;color:#212121;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;min-width:220px">
        <option value="">Todos os Conjuntos</option>
        ${adGroups.map(g => `<option value="${escHtml(g)}" ${filters.adGroup===g?'selected':''}>${escHtml(g)}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function filterKeywordRows(rows, filters) {
  return rows.filter(r => (!filters.campaign || r.campaign_name === filters.campaign) && (!filters.adGroup || r.ad_group_name === filters.adGroup));
}

// Busca cadastros reais + gasto já casados no Postgres (get_keyword_performance) para uma
// plataforma ('google_ads' ou 'bing_ads'). O join (cadastros real x search_term_daily) é feito no
// banco porque o lado do gasto tem dezenas de milhares de linhas no período — inviável trazer pro
// cliente e casar em JS sem estourar o limite de linhas do Supabase.
async function fetchKeywordTableData(platform, start, end, aliases) {
  const rows = await fetchKeywordPerformance(start, end, aliases);
  return rows.filter(r => r.platform === platform).map(r => {
    const spend = r.spend != null ? +r.spend : null;
    const cadastros = +r.cadastros || 0;
    return {
      platform: r.platform,
      campaign_name: r.campaign_name,
      ad_group_name: r.ad_group_name,
      keyword: r.keyword,
      cadastros,
      spend,
      clicks: r.clicks != null ? +r.clicks : null,
      impressions: r.impressions != null ? +r.impressions : null,
      cpa: spend != null && cadastros > 0 ? spend / cadastros : null,
    };
  });
}
