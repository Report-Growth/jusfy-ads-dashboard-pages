// ── Match de conversões reais (Metabase) contra campanhas de ads ──
// referral no Metabase é um valor solto por canal (Google/Meta/Bing/Affiliate/Others/OAB/ChatGPT/TikTok,
// nunca em branco) — tudo que não bate nesses padrões é tráfego orgânico/não pago e fica de fora por definição.
const PLATFORM_REFERRAL_PATTERNS = {
  google_ads: /google|adwords/i,
  meta:       /meta|fb|facebook|v4facebookads/i,
  bing_ads:   /bing/i,
};

// Vocabulário de features conhecidas nos nomes de campanha (ex: google_nonbrand_vendas_search_<feature>).
// Usado quando o utm_campaign do Metabase não bate com o nome exato da campanha (DSA/PMax/JusFinder
// e nomes de anúncio entre colchetes só carregam a feature, não o nome completo da campanha).
// "institucional" fica por último de propósito: nomes como "[ONGOING]...Jusprocessos (Institucional)"
// contêm as duas palavras, e a feature específica (jusprocessos) deve ganhar da genérica (institucional).
const FEATURE_KEYWORDS = [
  'jusfinder','dsa','pmax','jusgpt','jusprocessos','jusrevisional',
  'risprudencia','justrabalhista','juscalc','oabsp','oabmg','oabrj','oabrs',
  'institucional',
];

// Categorias "de conteúdo" que o Metabase já marca via marketing_category — não são plataforma de
// ads, então não fazem sentido cair em "Outros" quando existe um rótulo mais específico.
const CONTENT_CATEGORIES = ['Social', 'Comunidade', 'CRM', 'ChatGPT'];

// Monta um índice (por plataforma) de nomes de campanha + campaign_id, a partir de linhas cruas de
// campaign_daily (com campaign_id — get_camp_agg não tem esse campo, por isso pedimos fetchCamps).
// Usado pra corrigir casos em que o Metabase gravou o referral errado (Affiliate/Others) mas o
// utm_campaign é claramente uma campanha paga (nome completo ou o próprio campaign_id numérico).
function buildCampaignLookup(campaignRows) {
  const lookup = {
    google_ads: { names: new Set(), ids: new Set() },
    meta:       { names: new Set(), ids: new Set() },
    bing_ads:   { names: new Set(), ids: new Set() },
  };
  for (const r of campaignRows||[]) {
    const bucket = lookup[r.platform];
    if (!bucket) continue;
    if (r.campaign_name) bucket.names.add(r.campaign_name.toLowerCase());
    if (r.campaign_id != null) bucket.ids.add(String(r.campaign_id));
  }
  return lookup;
}

// label 'Google Ads'/'Meta Ads'/'Bing Ads' -> chave de PLATFORM_REFERRAL_PATTERNS
const PLATFORM_LABEL_TO_KEY = { 'Google Ads': 'google_ads', 'Meta Ads': 'meta', 'Bing Ads': 'bing_ads' };

// Resolve um utm_campaign pra 'Google Ads'/'Meta Ads'/'Bing Ads' usando o lookup acima — por nome
// exato, campaign_id exato, ou feature keyword compartilhada com alguma campanha real daquela
// plataforma. Retorna null se não achar nada (aí quem chamou decide o fallback).
// `referral` é usado só pra desempatar quando o mesmo nome/ID existe em mais de uma plataforma
// (ex: campanha do Bing cadastrada por engano com o prefixo "google_" — ver conversas de review).
function resolveAdPlatformForUtm(utm, lookup, referral) {
  if (!lookup) return null;
  const val = (utm||'').trim().toLowerCase();
  if (!val) return null;

  const exactMatches = [];
  if (lookup.google_ads.names.has(val) || lookup.google_ads.ids.has(val)) exactMatches.push('Google Ads');
  if (lookup.meta.names.has(val)       || lookup.meta.ids.has(val))       exactMatches.push('Meta Ads');
  if (lookup.bing_ads.names.has(val)   || lookup.bing_ads.ids.has(val))   exactMatches.push('Bing Ads');

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    // Nome/ID ambíguo entre plataformas: só decide se o referral apontar claramente pra uma única
    // das plataformas em conflito. Senão, devolve null e deixa classifyRealConversionChannel cair
    // no fallback por referral puro — mais honesto do que "roubar" pra uma plataforma por prioridade fixa.
    const byReferral = exactMatches.filter(p => PLATFORM_REFERRAL_PATTERNS[PLATFORM_LABEL_TO_KEY[p]].test(referral||''));
    return byReferral.length === 1 ? byReferral[0] : null;
  }

  // Bing usa a mesma convenção de nomes (bing_nonbrand_vendas_search_<feature>) — não tenta casar
  // por keyword nos buckets Google/Meta nesse caso, senão "bing_..._jusfinder" seria roubado.
  if (val.startsWith('bing_') || PLATFORM_REFERRAL_PATTERNS.bing_ads.test(val)) return null;
  for (const kw of FEATURE_KEYWORDS) {
    if (!val.includes(kw)) continue;
    if ([...lookup.google_ads.names].some(n => n.includes(kw))) return 'Google Ads';
    if ([...lookup.meta.names].some(n => n.includes(kw)))       return 'Meta Ads';
  }
  return null;
}

// Classifica uma linha de jusfy_conversions_daily em um canal de alto nível, pra bater com o
// controle manual. `campaignLookup` (opcional, de buildCampaignLookup) tem prioridade — um
// utm_campaign que bate com nome/ID de campanha real vale mais que o referral, que às vezes vem
// errado (Affiliate/Others em cadastros que na verdade vieram de uma campanha paga). Sem lookup,
// cai no referral; o que sobrar vira Orgânico, uma categoria de conteúdo conhecida, ou Outros.
function classifyRealConversionChannel(row, campaignLookup) {
  const resolved = resolveAdPlatformForUtm(row.utm_campaign, campaignLookup, row.referral);
  if (resolved) return resolved;

  const tipo = (row.tipo_de_trafego||'').toLowerCase();
  if (tipo.startsWith('org')) return 'Orgânico';
  const referral = row.referral || '';
  if (PLATFORM_REFERRAL_PATTERNS.google_ads.test(referral)) return 'Google Ads';
  if (PLATFORM_REFERRAL_PATTERNS.meta.test(referral))       return 'Meta Ads';
  if (PLATFORM_REFERRAL_PATTERNS.bing_ads.test(referral))   return 'Bing Ads';
  if (CONTENT_CATEGORIES.includes(row.marketing_category))  return row.marketing_category;
  return 'Outros';
}

// Agrega saída de get_jusfy_conversions_totals em totais por canal.
function aggregateRealConversionsByChannel(rows, campaignLookup) {
  const byChannel = {};
  for (const r of rows||[]) {
    const ch = classifyRealConversionChannel(r, campaignLookup);
    if (!byChannel[ch]) byChannel[ch] = { clientes_unicos: 0 };
    byChannel[ch].clientes_unicos += +r.clientes_unicos || 0;
  }
  return byChannel;
}

// ── Match de conversões reais por criativo (jusfy_creative_conversions_daily, Meta) ──
// Chave de match é o ad_name (bate ~86% com meta_creatives — os que faltam são anúncios pausados/
// removidos antes do sync manual de criativos rodar). O conjunto de anúncios (adset_name) entra só
// como quebra secundária: o mesmo criativo pode rodar em conjuntos diferentes com performance bem
// diferente, mas o total do criativo é sempre a soma de todos os conjuntos onde ele apareceu.
function buildCreativeConversionsMap(rows) {
  const map = {};
  for (const r of rows || []) {
    const key = r.ad_name;
    if (!key) continue;
    if (!map[key]) map[key] = { total: 0, byAdset: {} };
    const n = +r.cadastros || 0;
    map[key].total += n;
    const adset = r.adset_name || '(sem conjunto)';
    map[key].byAdset[adset] = (map[key].byAdset[adset] || 0) + n;
  }
  return map;
}

// Substitui ad.conversions (número reportado pela plataforma) pelos cadastros reais do Metabase,
// somados por criativo. Guarda o detalhe por conjunto em ad.adsetBreakdown para exibição secundária.
//
// `restrictToAdsets` (default false, mantém o comportamento histórico): quando true, o chamador está
// filtrando por campanha/conjunto (ad._adsets, montado em aggMetaByAd a partir dos conjuntos que
// sobraram no filtro), e a soma passa a respeitar só esses conjuntos — senão o total do criativo
// ficava sempre o mesmo mesmo filtrando por conjunto (gasto/cliques mudavam, cadastros reais não),
// porque real.total é a soma de TODOS os conjuntos onde o criativo já rodou. Sem filtro nenhum,
// continua usando real.total/real.byAdset direto — restringir por _adsets também nesse caso
// subestimaria o total sempre que um conjunto tiver cadastro real no Metabase mas nenhuma linha de
// gasto sincronizada no período (ex: sync de criativos atrasado).
function mergeCreativeRealConversions(ads, realMap, restrictToAdsets) {
  return ads.map(ad => {
    const real = realMap[ad.ad_name];
    if (!real) return { ...ad, conversions: 0, adsetBreakdown: null };

    const scoped = restrictToAdsets && ad._adsets && ad._adsets.size > 0;
    const entries = scoped
      ? Object.entries(real.byAdset).filter(([adset]) => ad._adsets.has(adset))
      : Object.entries(real.byAdset);
    const conversions = entries.reduce((s, [, n]) => s + n, 0);

    return {
      ...ad,
      conversions,
      adsetBreakdown: entries.length ? Object.fromEntries(entries) : null,
    };
  });
}

// Monta o mapa de aliases pra resolver nomes de campanha legados (JusFinder, DSA, PMax) no nível de
// keyword — mesmo problema já resolvido no nível de campanha via resolveAdPlatformForUtm, mas aqui
// precisamos do NOME real da campanha (não só a plataforma), pra casar com search_term_daily. Só
// resolve quando a keyword bate com exatamente 1 campanha real da plataforma — caso contrário, fica
// ambíguo e melhor não adivinhar. Consumido por get_keyword_performance (parâmetro p_aliases).
function buildKeywordCampaignAliases(lookup) {
  const aliases = {};
  if (!lookup) return aliases;
  for (const platformKey of ['google_ads', 'bing_ads']) {
    const bucket = lookup[platformKey];
    if (!bucket) continue;
    for (const legacy of FEATURE_KEYWORDS) {
      const matches = [...bucket.names].filter(n => n.includes(legacy));
      if (matches.length === 1) aliases[`${platformKey}||${legacy}`] = matches[0];
    }
  }
  return aliases;
}

// Monta o índice de agrupamento de campanhas (mesma feature compartilhada por >1 campanha do
// período vira um grupo só, ex: jusfinder/jusfinder_oabrj/variante de teste) — extraído de
// mergeRealConversions pra ser reaproveitado também na quebra DIÁRIA (gráfico filtrado por
// campanha, ver dailyRealConversionsByGroup/dailySpendByGroup em utils.js).
function buildCampaignGroupIndex(campaignRows, platformKey) {
  const pattern = PLATFORM_REFERRAL_PATTERNS[platformKey];
  const nameLower  = c => (c.campaign_name||'').toLowerCase();
  const keywordsOf = c => FEATURE_KEYWORDS.filter(k => nameLower(c).includes(k));

  // keyword -> campanhas (do período atual) cujo nome contém essa keyword
  const keywordToCampaigns = {};
  campaignRows.forEach(c => keywordsOf(c).forEach(k => {
    (keywordToCampaigns[k] = keywordToCampaigns[k] || []).push(c);
  }));

  // Uma keyword só vira "bucket" de verdade se cobrir mais de 1 campanha do período atual —
  // isso já cobre o caso de hoje (jusfinder x3) e se auto-ajusta se surgir uma 2ª campanha DSA/PMax.
  const groupIdOf = c => {
    const shared = keywordsOf(c).filter(k => keywordToCampaigns[k].length > 1);
    return shared.length ? shared[0] : `campaign:${nameLower(c)}`;
  };

  const groups = {}; // groupId -> campaignRow[]
  campaignRows.forEach(c => {
    const g = groupIdOf(c);
    (groups[g] = groups[g] || []).push(c);
  });

  // Resolve o groupId de um utm_campaign do Metabase SEMPRE via groupIdOf de uma campanha real,
  // nunca retornando a keyword crua — senão o id não bate com a chave usada em `groups`.
  const resolveGroupId = (utm, referral) => {
    const lower = (utm||'').trim().toLowerCase();
    if (!lower) return null;
    const exact = campaignRows.find(c => nameLower(c) === lower);
    if (exact) {
      // O mesmo nome pode existir em outra plataforma por engano (ex: campanha do Bing cadastrada
      // com prefixo "google_"). Só aceita o match exato se o referral não apontar claramente pra
      // outra plataforma paga — senão essa conversão seria contada aqui E na aba da plataforma
      // "dona" de verdade daquele referral (double count confirmado em review — ver oabmg/oabrj/oabrs).
      const referralPointsElsewhere = Object.entries(PLATFORM_REFERRAL_PATTERNS)
        .some(([key, pat]) => key !== platformKey && pat.test(referral||''));
      if (!referralPointsElsewhere) return groupIdOf(exact);
    }
    if (!pattern.test(referral||'')) return null;
    const candidates = FEATURE_KEYWORDS.filter(k => lower.includes(k) && keywordToCampaigns[k]);
    if (candidates.length > 1) {
      console.warn(`[realConv] utm_campaign "${utm}" ambíguo entre features: ${candidates.join(', ')} — usando "${candidates[0]}"`);
    }
    if (!candidates.length) return null;
    return groupIdOf(keywordToCampaigns[candidates[0]][0]);
  };

  return { groups, groupIdOf, resolveGroupId };
}

// Junta campanhas (campaignRows, já com spend/clicks/impressions/sessions) com as conversões reais
// (conversionRows, saída crua de get_jusfy_conversions_by_campaign) para o platformKey dado
// ('google_ads' ou 'meta'). Quando várias campanhas compartilham a mesma feature (ex: jusfinder,
// jusfinder_oabrj e a variante de teste) e o Metabase só consegue diferenciar por essa feature,
// elas são mescladas em 1 linha só — não dá pra inventar um split que o Metabase não fornece.
function mergeRealConversions(campaignRows, conversionRows, platformKey) {
  const { groups, resolveGroupId } = buildCampaignGroupIndex(campaignRows, platformKey);
  const convs = conversionRows||[];

  const realByGroup = {}; // groupId -> {clientes}
  convs.forEach(r => {
    const gid = resolveGroupId(r.utm_campaign, r.referral);
    if (!gid) {
      console.warn(`[realConv][${platformKey}] utm_campaign sem campanha correspondente: "${r.utm_campaign}" (referral="${r.referral}")`);
      return;
    }
    if (!realByGroup[gid]) realByGroup[gid] = { clientes: 0 };
    realByGroup[gid].clientes += +r.clientes_unicos || 0;
  });

  const out = [];
  for (const gid in groups) {
    const members = groups[gid];
    const real = realByGroup[gid] || { clientes: 0 };
    const base = members.length === 1
      ? { ...members[0] }
      : {
          campaign_name: `🔗 ${gid} (${members.length} campanhas agregadas)`,
          spend:       sum(members, 'spend'),
          clicks:      sum(members, 'clicks'),
          impressions: sum(members, 'impressions'),
          sessions:    sum(members, 'sessions'),
        };
    base._groupId = gid; // usado pelo gráfico pra filtrar a série diária pela mesma campanha/grupo
    base.conversions = real.clientes;
    base.cpa = real.clientes > 0 ? base.spend / real.clientes : null;
    base.ctr = base.impressions > 0 ? base.clicks / base.impressions * 100 : 0;
    base.txConv = base.sessions > 0 ? real.clientes / base.sessions * 100 : 0;
    out.push(base);
  }
  return out.sort((a,b) => b.spend - a.spend);
}

// Cadastros reais por dia, agrupados pelo mesmo groupId de mergeRealConversions — usado pra
// filtrar o gráfico "Investimento Diário × Cadastros Reais" quando o usuário seleciona uma
// campanha específica (por padrão o gráfico só mostra o total combinado de todas as campanhas).
function dailyRealConversionsByGroup(convDailyRows, campaignRows, platformKey) {
  const { resolveGroupId } = buildCampaignGroupIndex(campaignRows, platformKey);
  const byDate = {};
  for (const r of convDailyRows || []) {
    const gid = resolveGroupId(r.utm_campaign, r.referral);
    if (!gid) continue;
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][gid] = (byDate[r.date][gid] || 0) + (+r.clientes_unicos || 0);
  }
  return byDate;
}

// Gasto por dia, agrupado pelo mesmo groupId — campaignRows aqui são linhas CRUAS (fetchCamps,
// uma por dia+campanha), não as agregadas do período usadas em mergeRealConversions.
function dailySpendByGroup(rawDailyRows, groupIdOf) {
  const byDate = {};
  for (const r of rawDailyRows || []) {
    const gid = groupIdOf(r);
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][gid] = (byDate[r.date][gid] || 0) + (+r.spend || 0);
  }
  return byDate;
}
