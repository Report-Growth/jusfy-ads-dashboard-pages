// ── helpers locais ──
const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

function aggMetaByAd(rows) {
  const m = {};
  for (const r of rows) {
    const key = r.ad_name; // agrupa por nome do criativo (une ad_ids do mesmo criativo)
    if (+r.spend === 0 && !m[key]) continue;
    if (!m[key]) m[key] = {
      ad_id:r.ad_id, ad_name:r.ad_name, campaign_name:r.campaign_name,
      adset_name:r.adset_name, status:r.status, thumbnail_url:r.thumbnail_url,
      permalink_url:r.permalink_url||null,
      spend:0, reach:0, impressions:0, clicks:0, conversions:0,
      thruplay:0, video_p25:0, video_p50:0, video_p75:0, video_p100:0
    };
    const a = m[key];
    a.spend       += +r.spend||0;
    a.reach       += +r.reach||0;
    a.impressions += +r.impressions||0;
    a.clicks      += +r.clicks||0;
    a.conversions += +r.conversions||0;
    a.thruplay    += +r.thruplay||0;
    a.video_p25   += +r.video_p25||0;
    a.video_p50   += +r.video_p50||0;
    a.video_p75   += +r.video_p75||0;
    a.video_p100  += +r.video_p100||0;
    if (r.thumbnail_url && !a.thumbnail_url) a.thumbnail_url = r.thumbnail_url;
    if (r.permalink_url && !a.permalink_url) a.permalink_url = r.permalink_url;
    if (r.status && r.status !== 'UNKNOWN') a.status = r.status;
  }
  return Object.values(m).filter(a => a.spend > 0);
}

function aggGoogleByAd(rows) {
  const m = {};
  for (const r of rows) {
    if (+r.spend === 0 && !m[r.ad_id]) continue;
    if (!m[r.ad_id]) m[r.ad_id] = {
      ad_id:r.ad_id, ad_name:r.ad_name, campaign_name:r.campaign_name,
      adgroup_name:r.adgroup_name, status:r.status,
      video_id:r.video_id, thumbnail_url:r.thumbnail_url,
      spend:0, impressions:0, clicks:0, video_views:0,
      _p25w:0, _p50w:0, _p100w:0
    };
    const a = m[r.ad_id];
    const imp = +r.impressions||0;
    a.spend       += +r.spend||0;
    a.impressions += imp;
    a.clicks      += +r.clicks||0;
    a.video_views += +r.video_views||0;
    a._p25w       += (+r.video_p25_rate||0) * imp;
    a._p50w       += (+r.video_p50_rate||0) * imp;
    a._p100w      += (+r.video_p100_rate||0) * imp;
    if (r.video_id) a.video_id = r.video_id;
    if (r.thumbnail_url) a.thumbnail_url = r.thumbnail_url;
    if (r.status && r.status !== 'UNKNOWN') a.status = r.status;
  }
  return Object.values(m).filter(a => a.spend > 0).map(a => ({
    ...a,
    vtr:             a.impressions > 0 ? a.video_views / a.impressions * 100 : 0,
    cpe:             a.video_views > 0 ? a.spend / a.video_views : 0,
    ctr:             a.impressions > 0 ? a.clicks / a.impressions * 100 : 0,
    video_p25_rate:  a.impressions > 0 ? a._p25w / a.impressions : 0,
    video_p50_rate:  a.impressions > 0 ? a._p50w / a.impressions : 0,
    video_p100_rate: a.impressions > 0 ? a._p100w / a.impressions : 0,
  }));
}

function aggGoogleByName(rows) {
  const m = {};
  for (const r of rows) {
    const key = (r.ad_name || r.ad_id);
    if (+r.spend === 0 && !m[key]) continue;
    if (!m[key]) m[key] = {
      ad_id: r.ad_id, ad_name: r.ad_name, campaign_name: r.campaign_name,
      adgroup_name: r.adgroup_name, status: r.status,
      video_id: r.video_id, thumbnail_url: r.thumbnail_url,
      spend: 0, impressions: 0, clicks: 0, video_views: 0,
      _p25w: 0, _p50w: 0, _p100w: 0
    };
    const a = m[key];
    const imp = +r.impressions || 0;
    a.spend       += +r.spend || 0;
    a.impressions += imp;
    a.clicks      += +r.clicks || 0;
    a.video_views += +r.video_views || 0;
    a._p25w       += (+r.video_p25_rate || 0) * imp;
    a._p50w       += (+r.video_p50_rate || 0) * imp;
    a._p100w      += (+r.video_p100_rate || 0) * imp;
    if (r.video_id) a.video_id = r.video_id;
    if (r.thumbnail_url) a.thumbnail_url = r.thumbnail_url;
    if (r.status && r.status !== 'UNKNOWN') a.status = r.status;
  }
  return Object.values(m).filter(a => a.spend > 0).map(a => ({
    ...a,
    vtr:             a.impressions > 0 ? a.video_views / a.impressions * 100 : 0,
    cpe:             a.video_views > 0 ? a.spend / a.video_views : 0,
    ctr:             a.impressions > 0 ? a.clicks / a.impressions * 100 : 0,
    video_p25_rate:  a.impressions > 0 ? a._p25w / a.impressions : 0,
    video_p50_rate:  a.impressions > 0 ? a._p50w / a.impressions : 0,
    video_p100_rate: a.impressions > 0 ? a._p100w / a.impressions : 0,
  }));
}

function statusBadge(status) {
  const active = status === 'ACTIVE' || status === 'ENABLED';
  return `<span style="background:${active?'#02A37820':'#E7E8EC'};color:${active?'#02A378':'#212121BF'};border:1px solid ${active?'#02A37844':'#E7E8EC'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">${active?'ATIVO':'PAUSADO'}</span>`;
}

function retentionBars(thruplayRate, p50Rate, p25Rate) {
  const bar = (color, pct) => `<div style="flex:1;height:5px;background:#FAFAFA;border-radius:3px;overflow:hidden"><div style="height:100%;background:${color};width:${Math.min(pct,100).toFixed(1)}%;border-radius:3px"></div></div>`;
  const row = (label, color, pct) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:10px">
      <span style="color:#212121BF;min-width:50px">${label}</span>
      ${bar(color, pct)}
      <span style="color:${color};min-width:32px;text-align:right">${pct.toFixed(1)}%</span>
    </div>`;
  return `<div style="display:flex;flex-direction:column;gap:4px;min-width:170px">
    ${row('ThruPlay','#02A378', thruplayRate)}
    ${row('50%','#0182ab', p50Rate)}
    ${row('25%','#ed723e', p25Rate)}
  </div>`;
}

function ensureCreativeModal() {
  if (document.getElementById('creativeModal')) return;
  const m = document.createElement('div');
  m.id = 'creativeModal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:#000000cc;z-index:9999;align-items:center;justify-content:center;padding:20px';
  m.innerHTML = `
    <div style="background:#ffffff;border:1px solid #E7E8EC;border-radius:12px;padding:24px;max-width:440px;width:100%;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <div style="font-size:10px;color:#212121BF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Preview do Criativo</div>
          <div id="modalAdName" style="font-size:14px;font-weight:600;color:#212121;word-break:break-word"></div>
        </div>
        <button onclick="document.getElementById('creativeModal').style.display='none'"
          style="background:none;border:1px solid #E7E8EC;color:#212121BF;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;flex-shrink:0;margin-left:12px">&#x2715;</button>
      </div>
      <div id="modalContent" style="border-radius:8px;overflow:hidden;background:#FAFAFA;min-height:180px;display:flex;align-items:center;justify-content:center"></div>
      <div style="margin-top:12px">
        <a id="modalLink" href="#" target="_blank" rel="noopener"
          style="display:block;text-align:center;background:#02A378;color:#fff;border-radius:6px;padding:10px;font-size:13px;text-decoration:none">
          Abrir no Gerenciador &#x2192;
        </a>
      </div>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
  document.body.appendChild(m);
}

function showCreative(name, thumb, videoId, managerUrl) {
  ensureCreativeModal();
  document.getElementById('modalAdName').textContent = name;
  const content = document.getElementById('modalContent');
  const link    = document.getElementById('modalLink');
  if (videoId) {
    content.innerHTML = '<iframe width="100%" height="280" src="https://www.youtube.com/embed/' + videoId + '?autoplay=0&mute=1" frameborder="0" allow="fullscreen" allowfullscreen></iframe>';
    link.href = 'https://www.youtube.com/watch?v=' + videoId;
    link.textContent = 'Abrir no YouTube →';
  } else if (managerUrl && /instagram\.com\/(p|reel)\//.test(managerUrl)) {
    // Instagram embed (posts e reels)
    const match = managerUrl.match(/instagram\.com\/(p|reel)\/([^/?#]+)/);
    if (match) {
      const [, kind, shortcode] = match;
      content.innerHTML = '<iframe src="https://www.instagram.com/' + kind + '/' + shortcode + '/embed/?autoplay=false" width="100%" height="380" frameborder="0" scrolling="no" allowtransparency="true" style="border-radius:8px;background:#000"></iframe>';
    } else {
      content.innerHTML = '<div style="color:#212121BF;font-size:13px;padding:40px;text-align:center">Preview não disponível</div>';
    }
    link.href = managerUrl.split('#')[0];
    link.textContent = 'Abrir no Instagram →';
  } else if (thumb) {
    const img = document.createElement('img');
    img.src = thumb;
    img.style.cssText = 'width:100%;display:block;border-radius:4px';
    img.onerror = () => { content.innerHTML = '<div style="color:#212121BF;font-size:13px;padding:40px;text-align:center">Thumbnail indisponível</div>'; };
    content.innerHTML = '';
    content.appendChild(img);
    link.href = managerUrl || 'https://business.facebook.com';
    link.textContent = 'Abrir no Gerenciador →';
  } else {
    content.innerHTML = '<div style="color:#212121BF;font-size:13px;padding:40px;text-align:center">Preview não disponível</div>';
    link.href = managerUrl || '#';
    link.textContent = 'Abrir no Gerenciador →';
  }
  document.getElementById('creativeModal').style.display = 'flex';
}

function previewBtn(name, thumb, videoId, managerUrl) {
  const safe = s => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '').replace(/\r/g, '');
  return '<button onclick="showCreative(\'' + safe(name) + '\',\'' + safe(thumb) + '\',\'' + safe(videoId) + '\',\'' + safe(managerUrl) + '\')" '
    + 'style="width:36px;height:36px;border-radius:50%;background:#FAFAFA;border:1px solid #E7E8EC;color:#212121BF;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s" '
    + 'onmouseover="this.style.background=\'#02A37833\';this.style.color=\'#02A378\';this.style.borderColor=\'#02A37866\'" '
    + 'onmouseout="this.style.background=\'#FAFAFA\';this.style.color=\'#212121BF\';this.style.borderColor=\'#E7E8EC\'">&#x25B6;</button>';
}

function metaTable(ads, title, campaignBadge, tableId) {
  if (!ads.length) return '<div class="card" style="margin-bottom:16px"><div class="card-title">' + title + '</div><div class="c-muted" style="padding:20px;text-align:center;font-size:13px">Sem dados com gasto no período</div></div>';
  const withMetrics = ads.map(ad => {
    const imp = ad.impressions || 1;
    return { ...ad,
      tpRate:  ad.thruplay / imp * 100,
      p50Rate: ad.video_p50 / imp * 100,
      p25Rate: ad.video_p25 / imp * 100,
      cpt:     ad.thruplay > 0 ? ad.spend / ad.thruplay : null,
      freq:    ad.reach > 0 ? ad.impressions / ad.reach : 0,
    };
  });
  const st     = getSort(tableId, 'spend', 'desc');
  const sorted = sortRows(withMetrics, st.key, st.dir);
  const totSpend = sum(sorted,'spend'), totReach = sum(sorted,'reach'), totImpr = sum(sorted,'impressions');
  const totThru  = sum(sorted,'thruplay'), totP25 = sum(sorted,'video_p25'), totP50 = sum(sorted,'video_p50');
  const totConv  = sum(sorted,'conversions');
  const totFreq  = totReach>0 ? totImpr/totReach : 0;
  const totTpRate  = totImpr>0 ? totThru/totImpr*100 : 0;
  const totP25Rate = totImpr>0 ? totP25/totImpr*100  : 0;
  const totP50Rate = totImpr>0 ? totP50/totImpr*100  : 0;
  const totCpt   = totThru>0 ? totSpend/totThru : null;
  let rows = '';
  for (const ad of sorted) {
    const tpRate  = ad.tpRate, p50Rate = ad.p50Rate, p25Rate = ad.p25Rate, cpt = ad.cpt;
    rows += '<tr>'
      + '<td style="text-align:center">' + previewBtn(ad.ad_name, ad.thumbnail_url || '', '', ad.permalink_url || 'https://business.facebook.com') + '</td>'
      + '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + (ad.ad_name || '—') + adsetBreakdownHtml(ad.adsetBreakdown) + '</td>'
      + '<td>' + statusBadge(ad.status) + '</td>'
      + '<td class="r">' + fR(ad.spend) + '</td>'
      + '<td class="r">' + fN(ad.reach) + '</td>'
      + '<td class="r">' + fN(ad.impressions) + '</td>'
      + '<td class="r">' + ad.freq.toFixed(2) + 'x</td>'
      + '<td class="r c-green"><strong>' + fN(ad.thruplay) + '</strong><br><span style="font-size:10px;color:#212121BF">' + tpRate.toFixed(1) + '%</span></td>'
      + '<td class="r">' + (cpt !== null ? fR(cpt) : '—') + '</td>'
      + '<td>' + retentionBars(tpRate, p50Rate, p25Rate) + '</td>'
      + '<td class="r">' + fN(ad.video_p25) + '<br><span style="font-size:10px;color:#212121BF">' + p25Rate.toFixed(1) + '%</span></td>'
      + '<td class="r">' + fN(ad.video_p50) + '<br><span style="font-size:10px;color:#212121BF">' + p50Rate.toFixed(1) + '%</span></td>'
      + '<td class="r">' + fN(ad.conversions||0) + '</td>'
      + '</tr>';
  }
  return '<div class="card" style="margin-bottom:16px">'
    + '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:10px"><span>' + title + '</span>'
    + '<span class="badge by">' + sorted.length + ' ADS</span>'
    + (campaignBadge ? '<span style="font-size:11px;color:#212121BF;font-weight:400">' + campaignBadge + '</span>' : '')
    + '</div>'
    + '<span style="font-size:11px;color:#212121BF;font-weight:400">Clique em &#x25B6; para visualizar o criativo</span>'
    + '</div>'
    + '<div class="table-wrap"><table>'
    + '<thead><tr><th style="width:52px">Preview</th>' + sortTh(tableId,'Anúncio','ad_name','asc','') + sortTh(tableId,'Status','status','asc','')
    + sortTh(tableId,'Gasto','spend') + sortTh(tableId,'Alcance','reach') + sortTh(tableId,'Impressões','impressions')
    + sortTh(tableId,'Frequência','freq')
    + sortTh(tableId,'ThruPlay','thruplay') + sortTh(tableId,'Custo/ThruPlay','cpt')
    + '<th>Retenção</th>' + sortTh(tableId,'Views 25%','video_p25') + sortTh(tableId,'Views 50%','video_p50')
    + sortTh(tableId,'Cadastros Reais','conversions')
    + '</tr></thead><tbody>' + rows + '</tbody>'
    + '<tfoot><tr style="border-top:2px solid #E7E8EC;background:#ffffff">'
    + '<td></td><td><strong>Total</strong></td><td></td>'
    + '<td class="r"><strong>' + fR(totSpend) + '</strong></td>'
    + '<td class="r"><strong>' + fN(totReach) + '</strong></td>'
    + '<td class="r"><strong>' + fN(totImpr) + '</strong></td>'
    + '<td class="r"><strong>' + totFreq.toFixed(2) + 'x</strong></td>'
    + '<td class="r c-green"><strong>' + fN(totThru) + '</strong><br><span style="font-size:10px;color:#212121BF">' + totTpRate.toFixed(1) + '%</span></td>'
    + '<td class="r"><strong>' + (totCpt!==null?fR(totCpt):'—') + '</strong></td>'
    + '<td></td>'
    + '<td class="r"><strong>' + fN(totP25) + '</strong><br><span style="font-size:10px;color:#212121BF">' + totP25Rate.toFixed(1) + '%</span></td>'
    + '<td class="r"><strong>' + fN(totP50) + '</strong><br><span style="font-size:10px;color:#212121BF">' + totP50Rate.toFixed(1) + '%</span></td>'
    + '<td class="r"><strong>' + fN(totConv) + '</strong></td>'
    + '</tr></tfoot></table></div></div>';
}

// Formata a quebra por conjunto de anúncios (adsetBreakdown: {adset_name: cadastros}) como texto
// secundário abaixo do nome do criativo — mesmo criativo pode ter performance bem diferente em
// conjuntos diferentes, e o total sozinho esconde isso. Só mostra quando há 2+ conjuntos.
function adsetBreakdownHtml(breakdown) {
  if (!breakdown) return '';
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length < 2) return '';
  const parts = entries.map(([name, n]) => escHtml(name) + ' (' + fN(n) + ')').join(' · ');
  return '<div style="font-size:10px;color:#212121BF;white-space:normal;word-break:break-word;margin-top:2px" title="Cadastros reais por conjunto de anúncios">' + parts + '</div>';
}

function metaFundoTable(ads, title, campaignBadge, tableId) {
  if (!ads.length) return '<div class="card" style="margin-bottom:16px"><div class="card-title">' + title + '</div><div class="c-muted" style="padding:20px;text-align:center;font-size:13px">Sem dados com gasto no período</div></div>';
  const withMetrics = ads.map(ad => {
    const imp = ad.impressions || 1;
    return { ...ad,
      ctr:  ad.clicks / imp * 100,
      cpa:  ad.conversions > 0 ? ad.spend / ad.conversions : null,
      freq: ad.reach > 0 ? ad.impressions / ad.reach : 0,
    };
  });
  const st     = getSort(tableId, 'spend', 'desc');
  const sorted = sortRows(withMetrics, st.key, st.dir);
  const totSpend = sum(sorted,'spend'), totClicks = sum(sorted,'clicks'), totImpr = sum(sorted,'impressions');
  const totConv  = sum(sorted,'conversions');
  const totCtr   = totImpr>0 ? totClicks/totImpr*100 : 0;
  const totCpa   = totConv>0 ? totSpend/totConv : null;
  let rows = '';
  for (const ad of sorted) {
    const ctr = ad.ctr, cpa = ad.cpa;
    const cpaCls = cpa == null ? 'c-muted' : cpa < 60 ? 'c-green' : cpa < 130 ? 'c-yellow' : 'c-red';
    rows += '<tr>'
      + '<td style="text-align:center">' + previewBtn(ad.ad_name, ad.thumbnail_url || '', '', ad.permalink_url || 'https://business.facebook.com') + '</td>'
      + '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + (ad.ad_name || '—') + adsetBreakdownHtml(ad.adsetBreakdown) + '</td>'
      + '<td>' + statusBadge(ad.status) + '</td>'
      + '<td class="r c-brand">' + fR(ad.spend) + '</td>'
      + '<td class="r">' + fN(ad.clicks) + '</td>'
      + '<td class="r c-muted">' + fN(ad.impressions) + '</td>'
      + '<td class="r">' + ad.freq.toFixed(2) + 'x</td>'
      + '<td class="r">' + fP(ctr) + '</td>'
      + '<td class="r"><strong>' + fN(ad.conversions) + '</strong></td>'
      + '<td class="r ' + cpaCls + '">' + (cpa !== null ? fR(cpa) : '—') + '</td>'
      + '</tr>';
  }
  return '<div class="card" style="margin-bottom:16px">'
    + '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:10px"><span>' + title + '</span>'
    + '<span class="badge by">' + sorted.length + ' ADS</span>'
    + (campaignBadge ? '<span style="font-size:11px;color:#212121BF;font-weight:400">' + campaignBadge + '</span>' : '')
    + '</div>'
    + '<span style="font-size:11px;color:#212121BF;font-weight:400">Cadastros reais (Metabase) · clique em &#x25B6; para visualizar o criativo</span>'
    + '</div>'
    + '<div class="table-wrap"><table>'
    + '<thead><tr><th style="width:52px">Preview</th>' + sortTh(tableId,'Anúncio','ad_name','asc','') + sortTh(tableId,'Status','status','asc','')
    + sortTh(tableId,'Gasto','spend') + sortTh(tableId,'Cliques','clicks') + sortTh(tableId,'Impressões','impressions')
    + sortTh(tableId,'Frequência','freq')
    + sortTh(tableId,'CTR','ctr') + sortTh(tableId,'Cadastros Reais','conversions') + sortTh(tableId,'CAC Real','cpa')
    + '</tr></thead><tbody>' + rows + '</tbody>'
    + '<tfoot><tr style="border-top:2px solid #E7E8EC;background:#ffffff">'
    + '<td></td><td><strong>Total</strong></td><td></td>'
    + '<td class="r c-brand"><strong>' + fR(totSpend) + '</strong></td>'
    + '<td class="r"><strong>' + fN(totClicks) + '</strong></td>'
    + '<td class="r c-muted"><strong>' + fN(totImpr) + '</strong></td>'
    + '<td></td>'
    + '<td class="r"><strong>' + fP(totCtr) + '</strong></td>'
    + '<td class="r"><strong>' + fN(totConv) + '</strong></td>'
    + '<td class="r"><strong>' + (totCpa!==null?fR(totCpa):'—') + '</strong></td>'
    + '</tr></tfoot></table></div></div>';
}

function googleTable(ads, tableId) {
  if (!ads.length) return '<div class="card"><div class="card-title">&#x1F535; Google Ads — Demand Gen</div><div class="c-muted" style="padding:20px;text-align:center;font-size:13px">Sem dados com gasto no período</div></div>';
  const st     = getSort(tableId, 'spend', 'desc');
  const sorted = sortRows(ads, st.key, st.dir);
  let rows = '';
  for (const ad of sorted) {
    rows += '<tr>'
      + '<td style="text-align:center">' + previewBtn(ad.ad_name, ad.thumbnail_url || '', ad.video_id || '', '') + '</td>'
      + '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + (ad.ad_name || '—') + '</td>'
      + '<td>' + statusBadge(ad.status) + '</td>'
      + '<td class="r">' + fR(ad.spend) + '</td>'
      + '<td class="r">' + fN(ad.impressions) + '</td>'
      + '<td class="r">' + fN(ad.clicks) + '</td>'
      + '<td class="r c-blue"><strong>' + fN(ad.video_views) + '</strong></td>'
      + '<td class="r">' + ad.vtr.toFixed(2) + '%</td>'
      + '<td class="r">' + fR(ad.cpe) + '</td>'
      + '<td class="r">' + ad.ctr.toFixed(2) + '%</td>'
      + '<td class="r c-yellow">' + ad.video_p25_rate.toFixed(1) + '%</td>'
      + '<td class="r c-blue">' + ad.video_p50_rate.toFixed(1) + '%</td>'
      + '<td class="r c-green">' + ad.video_p100_rate.toFixed(1) + '%</td>'
      + '</tr>';
  }
  return '<div class="card">'
    + '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<span>&#x1F535; Google Ads — Demand Gen</span>'
    + '<span class="badge bb">' + sorted.length + ' ADS</span></div>'
    + '<span style="font-size:11px;color:#212121BF;font-weight:400">Clique em &#x25B6; para visualizar o criativo</span>'
    + '</div>'
    + '<div class="table-wrap"><table>'
    + '<thead><tr><th style="width:52px">Preview</th>' + sortTh(tableId,'Anúncio','ad_name','asc','') + sortTh(tableId,'Status','status','asc','')
    + sortTh(tableId,'Custo','spend') + sortTh(tableId,'Impressões','impressions') + sortTh(tableId,'Cliques','clicks')
    + sortTh(tableId,'Views (TrueView)','video_views')
    + sortTh(tableId,'VTR','vtr') + sortTh(tableId,'CPV Médio','cpe') + sortTh(tableId,'CTR','ctr')
    + sortTh(tableId,'Ret. 25%','video_p25_rate') + sortTh(tableId,'Ret. 50%','video_p50_rate') + sortTh(tableId,'Ret. 100%','video_p100_rate')
    + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

let _aniversarioData = null;

function renderAniversarioBody() {
  if (!_aniversarioData) return;
  const { metaTopo, metaFundo, googleAni, totSpend, totThru, totViews, totImpMeta } = _aniversarioData;

  document.getElementById('content').innerHTML =
    '<div class="card" style="margin-bottom:20px;border-color:#ed723e44;background:#ed723e0a">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<span style="font-size:20px">&#x1F382;</span>'
    + '<div><div style="font-size:15px;font-weight:700;color:#212121">Campanha de Aniversário</div>'
    + '<div style="font-size:12px;color:#212121BF">' + disp(S.start) + ' → ' + disp(S.end) + '</div></div>'
    + '</div>'
    + '<div class="kpi-grid cols-4">'
    + kpiCard('Investimento Total', totSpend,   undefined, fR, 'c-brand')
    + kpiCard('ThruPlay (Meta)',    totThru,    undefined, fN, 'c-green')
    + kpiCard('Impressões Meta', totImpMeta, undefined, fN, 'c-blue')
    + kpiCard('Views YouTube',     totViews,   undefined, fN, 'c-yellow')
    + '</div></div>'
    + metaTable(metaTopo,  '&#x1F7E1; Meta · Topo (Branding VV)', 'meta_branding_topo_engajamento_aniversário_VV', 'ani-topo')
    + metaFundoTable(metaFundo, '&#x1F7E1; Meta · Fundo (Conversão)', 'meta_vendas_fundo — criativos pilula', 'ani-fundo')
    + googleTable(googleAni, 'ani-google');
}

async function tabAniversario() {
  loading();
  ensureCreativeModal();

  // Queries direcionadas para evitar o limite de 1000 rows do Supabase REST
  // (meta_creatives tem >1000 rows e os ads de aniversário começaram em 18-19/jun)
  const [metaTopoRows, metaFundoRows, googleRows, realRows] = await Promise.all([
    supa(`meta_creatives?select=*&date=gte.${S.start}&date=lte.${S.end}&campaign_name=ilike.*branding_topo*&order=date.asc`),
    supa(`meta_creatives?select=*&date=gte.${S.start}&date=lte.${S.end}&campaign_name=ilike.*vendas_fundo*&ad_name=ilike.*pilula*&order=date.asc`),
    fetchGoogleCreatives(S.start, S.end),
    fetchCreativeRealConversions(S.start, S.end),
  ]);
  const realMap = buildCreativeConversionsMap(realRows);

  // Filtro JS adicional: dentro dos branding_topo, só os de aniversário
  const metaTopoRaw  = metaTopoRows.filter(r => norm(r.campaign_name).includes('aniversar'));
  const metaFundoRaw = metaFundoRows; // já filtrado no DB
  const googleAniRaw = googleRows.filter(r =>
    norm(r.campaign_name).includes('demandgen') &&
    norm(r.ad_name).includes('aniversar')
  );

  const metaTopo  = mergeCreativeRealConversions(aggMetaByAd(metaTopoRaw), realMap);
  const metaFundo = mergeCreativeRealConversions(aggMetaByAd(metaFundoRaw), realMap);
  // Google: agrupa por ad_name (mesmo criativo em diferentes conjuntos)
  const googleAni = aggGoogleByName(googleAniRaw);

  // KPIs consolidados (apenas anúncios com gasto)
  const totSpend   = [...metaTopo, ...metaFundo].reduce((s, r) => s + r.spend, 0)
                   + googleAni.reduce((s, r) => s + r.spend, 0);
  const totThru    = [...metaTopo, ...metaFundo].reduce((s, r) => s + r.thruplay, 0);
  const totViews   = googleAni.reduce((s, r) => s + r.video_views, 0);
  const totImpMeta = [...metaTopo, ...metaFundo].reduce((s, r) => s + r.impressions, 0);

  _aniversarioData = { metaTopo, metaFundo, googleAni, totSpend, totThru, totViews, totImpMeta };
  registerSortRenderer('ani-topo', renderAniversarioBody);
  registerSortRenderer('ani-fundo', renderAniversarioBody);
  registerSortRenderer('ani-google', renderAniversarioBody);
  renderAniversarioBody();
}
