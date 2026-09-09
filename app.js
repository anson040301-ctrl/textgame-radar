/* 文生游戏热点雷达 —— 前端渲染（原生 JS，无外部依赖） */
(async function () {
  'use strict';

  // GitHub Pages 版：数据与页面分离（dist/ 本地版才是内嵌数据）
  var D = await (await fetch('meta.json')).json();
  D.products = await (await fetch('products.json')).json();
  var _parts = await Promise.all(['data-1.jsonl','data-2.jsonl','data-3.jsonl','data-4.jsonl','data-5.jsonl'].map(function (u) { return fetch(u).then(function (r) { return r.text(); }); }));
  D.items = _parts.join('').split('\n')
    .filter(function (s) { return s.trim(); })
    .map(function (s) { return JSON.parse(s); });
  var TRACKS = {};
  D.tracks.forEach(function (t) { TRACKS[t.key] = t; });

  var TYPE_COLOR = {
    paper: '#5b4dee', news: '#d4483b', community: '#e0862a', repo: '#2f9e6e'
  };
  var TYPE_LABEL = { paper: '论文', news: '资讯', community: '社区', repo: '开源' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function alpha(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function shortName(zh) {
    var s = zh.split('·')[0].trim();
    return s.length > 8 ? s.slice(0, 8) : s;
  }
  function fmt(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  /* ---------------------------------------------------------- 主题 */
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('tgr-theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) { }
  document.getElementById('themeBtn').addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('tgr-theme', next); } catch (e) { }
    drawRadar(); drawLine();
  });

  /* ---------------------------------------------------------- 顶栏 / KPI */
  document.getElementById('stamp').textContent = D.generated_at;
  document.getElementById('dropped').textContent = D.counts.dropped;
  document.getElementById('itemNote').textContent = D.site_item_note || '';

  var c = D.counts;
  var topTrack = D.tracks.slice().sort(function (a, b) { return b.heat - a.heat; })[0];
  var fastest = D.tracks.slice().sort(function (a, b) { return b.momentum - a.momentum; })[0];
  var kpis = [
    { n: c.total, l: '入库条目', s: '覆盖 ' + c.sources + ' 个信息来源' },
    { n: c.d7, l: '近 7 天新发布', s: '近 30 天 ' + c.d30 + ' 条' },
    {
      n: D.first_build ? c.total : c.new_today, l: '本次新增',
      s: D.first_build ? '首次建库，全部计入' : '相对上一次抓取'
    },
    { n: Math.round(topTrack.heat), l: '最热赛道', s: topTrack.zh },
    {
      n: (fastest.momentum >= 0 ? '+' : '') + Math.round(fastest.momentum * 100) + '%',
      l: '最快增速', s: fastest.zh
    }
  ];
  document.getElementById('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="n">' + esc(k.n) + '</div>'
      + '<div class="l">' + esc(k.l) + '</div>'
      + '<div class="s">' + esc(k.s) + '</div></div>';
  }).join('');

  /* ---------------------------------------------------------- 综述 */
  document.getElementById('summary').innerHTML = D.summary.map(function (p) {
    return '<div class="s-block"><div class="s-tag">' + esc(p[0]) + '</div>'
      + '<div class="s-txt">' + md(p[1]) + '</div></div>';
  }).join('');

  /* ---------------------------------------------------------- 产品榜 */
  var PROD = {};
  D.products.forEach(function (p) { PROD[p.name] = p; });

  function sparkline(series, color, w, h) {
    w = w || 560; h = h || 92;
    var n = series.length, mx = Math.max.apply(null, series.concat([1]));
    var css = getComputedStyle(root);
    var bd = css.getPropertyValue('--border').trim() || '#e2e6f0';
    var t3 = css.getPropertyValue('--text-3').trim() || '#8b93a8';
    var pad = 4, iw = w - pad * 2, ih = h - 20;
    function X(i) { return pad + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '">';
    s += '<line x1="0" y1="' + (4 + ih) + '" x2="' + w + '" y2="' + (4 + ih)
      + '" stroke="' + bd + '" stroke-width="1"/>';
    // 条目数少时柱状比折线更可读
    var bw = Math.max(3, iw / n - 3);
    series.forEach(function (v, i) {
      var hh = v / mx * ih;
      s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (4 + ih - hh).toFixed(1)
        + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, hh).toFixed(1)
        + '" rx="2" fill="' + color + '" fill-opacity="' + (i === n - 1 ? .45 : .8) + '"/>';
      if (v > 0) {
        s += '<text x="' + X(i).toFixed(1) + '" y="' + (4 + ih - hh - 3).toFixed(1)
          + '" font-size="9" text-anchor="middle" fill="' + t3 + '">' + v + '</text>';
      }
    });
    D.labels.forEach(function (lb, i) {
      if (i % 3 === 0 || i === n - 1) {
        s += '<text x="' + X(i).toFixed(1) + '" y="' + (h - 4) + '" font-size="9.5" '
          + 'text-anchor="middle" fill="' + t3 + '">' + esc(lb) + '</text>';
      }
    });
    s += '</svg>';
    return s;
  }

  (function () {
    var g = document.getElementById('prodGrid');
    if (!D.products.length) {
      g.innerHTML = '<div class="empty">本次更新未识别出产品，请检查配置。</div>';
      return;
    }
    g.innerHTML = D.products.slice(0, 12).map(function (p) {
      var momCls = Math.abs(p.momentum) < 0.08 ? 'flat' : (p.momentum > 0 ? 'up' : 'dn');
      var momTxt = (p.momentum > 0 ? '+' : '') + Math.round(p.momentum * 100) + '%';
      var dots = Object.keys(p.src_types).map(function (k) {
        return '<i class="prod-src" style="background:' + TYPE_COLOR[k] + '" title="'
          + esc(TYPE_LABEL[k]) + '"></i>';
      }).join('');
      return '<div class="prod" data-p="' + esc(p.name) + '" style="--pc:' + p.color + '">'
        + '<div class="prod-top"><div class="prod-n">' + esc(p.name) + '</div>'
        + '<div class="prod-idx">' + Math.round(p.heat_index) + '</div></div>'
        + '<div class="prod-meta"><span class="prod-cat">' + esc(p.cat) + '</span>'
        + '<span class="prod-vendor">' + esc(p.vendor) + '</span></div>'
        + '<div class="prod-bar"><i style="width:' + Math.min(100, p.heat_index) + '%"></i></div>'
        + '<div class="prod-bot"><span>近 60 天 ' + p.recent + ' 条 · 动能 '
        + '<b class="' + momCls + '">' + momTxt + '</b></span>'
        + '<span class="prod-srcs">' + dots + '</span></div>'
        + '<div class="prod-more">查看专属情报 →</div></div>';
    }).join('');
    g.addEventListener('click', function (e) {
      var c = e.target.closest('.prod'); if (!c) return;
      openModal(c.dataset.p);
    });

    var np = document.getElementById('prodNew');
    if (D.new_projects && D.new_projects.length) {
      np.hidden = false;
      np.innerHTML = '<b>本期新发现的项目名</b>（自动扫描论文与仓库标题所得，尚未收录进产品表）：'
        + D.new_projects.map(function (x) {
          return '<span class="np">' + esc(x.name) + ' ×' + x.count + '</span>';
        }).join('')
        + '<br>这些是潜在的新玩家，确认值得跟踪后可加入产品表。';
    }
  })();

  /* ---------------------------------------------------------- 产品详情弹窗 */
  var modal = document.getElementById('modal');
  var modalBody = document.getElementById('modalBody');
  var lastFocus = null;

  function openModal(name) {
    var p = PROD[name];
    if (!p) return;
    lastFocus = document.activeElement;
    var momCls = Math.abs(p.momentum) < 0.08 ? 'flat' : (p.momentum > 0 ? 'up' : 'dn');
    var momTxt = (p.momentum > 0 ? '+' : '') + Math.round(p.momentum * 100) + '%';
    var srcDots = Object.keys(p.src_types).map(function (k) {
      return '<span class="md-tag" style="color:' + TYPE_COLOR[k] + ';background:'
        + alpha(TYPE_COLOR[k], .12) + '">' + esc(TYPE_LABEL[k]) + ' ' + p.src_types[k] + ' 条</span>';
    }).join('');
    var trackTags = (p.tracks || []).map(function (k) {
      var t = TRACKS[k]; if (!t) return '';
      return '<span class="md-tag" style="color:' + t.color + ';background:' + alpha(t.color, .11)
        + '">' + esc(t.zh) + '</span>';
    }).join('');
    var termTags = (p.terms || []).map(function (t) {
      return '<span class="md-tag" style="color:var(--text-2);background:var(--surface-3)">'
        + esc(t) + '</span>';
    }).join('');
    var news = (p.items || []).map(function (x) {
      return '<a class="md-item" href="' + esc(x.url) + '" target="_blank" rel="noopener">'
        + '<div class="t">' + esc(x.title) + '</div>'
        + '<div class="m"><span class="b-type" style="color:' + TYPE_COLOR[x.source_type]
        + ';background:' + alpha(TYPE_COLOR[x.source_type], .12) + '">'
        + esc(TYPE_LABEL[x.source_type] || x.source_type) + '</span>'
        + '<span>' + esc(x.source) + '</span><span>' + esc(x.date) + '</span>'
        + '<span>热度 ' + Math.round(x.heat) + '</span></div>'
        + (x.summary ? '<div class="s">' + esc(x.summary) + '</div>' : '')
        + '</a>';
    }).join('');

    modalBody.innerHTML =
      '<div class="md-hd">'
      + '<div class="md-idx" style="background:' + p.color + '">' + Math.round(p.heat_index) + '</div>'
      + '<div class="md-t"><h3 id="modalTitle">' + esc(p.name) + '</h3>'
      + '<div class="sub">' + esc(p.cat) + ' · ' + esc(p.vendor) + '</div>'
      + '<div class="md-tags">' + trackTags + '</div></div></div>'
      + (p.summary && p.summary.length
        ? '<div class="md-summary">' + p.summary.map(function (s) {
          return '<div class="md-sblock"><div class="md-stag">' + esc(s[0]) + '</div>'
            + '<div class="md-stxt">' + md(s[1]) + '</div></div>';
        }).join('') + '</div>' : '')
      + '<div class="md-kpis">'
      + '<div class="md-kpi"><div class="n">' + p.recent + '</div><div class="l">近 60 天条目</div></div>'
      + '<div class="md-kpi"><div class="n">' + p.count + '</div><div class="l">累计条目</div></div>'
      + '<div class="md-kpi"><div class="n ' + momCls + '">' + momTxt + '</div><div class="l">动能</div></div>'
      + '<div class="md-kpi"><div class="n">' + Math.round(p.heat_index) + '</div><div class="l">热度指数</div></div>'
      + '</div>'
      + '<div class="md-sec"><h4>周提及分布</h4>'
      + '<div class="md-spark">' + sparkline(p.series, p.color) + '</div></div>'
      + (srcDots ? '<div class="md-sec"><h4>信息来源构成</h4><div class="md-terms">'
        + srcDots + '</div></div>' : '')
      + (termTags ? '<div class="md-sec"><h4>共现热词</h4><div class="md-terms">'
        + termTags + '</div></div>' : '')
      + '<div class="md-sec"><h4>相关情报（按热度）</h4><div class="md-news">'
      + (news || '<div class="empty">暂无</div>') + '</div></div>'
      + (p.items && p.items.length >= 6
        ? '<div class="md-sec"><button class="more-btn" id="mdFilterBtn">'
        + '在下方热点流中筛选「' + esc(p.name) + '」 →</button></div>' : '');

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var btn = document.getElementById('mdFilterBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        closeModal();
        F.products = [p.name]; F.range = 9999;
        document.getElementById('range').value = '9999';
        shown = PAGE; syncPills(); render();
        document.querySelector('.feed-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ---------------------------------------------------------- 营销趋势 */
  (function () {
    if (!D.market || !D.market.length) return;
    document.getElementById('mktSummary').innerHTML = D.market_summary.map(function (p) {
      return '<div class="s-block"><div class="s-tag">' + esc(p[0]) + '</div>'
        + '<div class="s-txt">' + md(p[1]) + '</div></div>';
    }).join('');
    var mx = Math.max.apply(null, D.market.map(function (m) { return m.now; }).concat([1]));
    document.getElementById('mktGrid').innerHTML = D.market.map(function (m) {
      var cls = Math.abs(m.delta) < 0.15 ? 'flat' : (m.delta > 0 ? 'up' : 'dn');
      var dt = (m.delta > 0 ? '+' : '') + Math.round(m.delta * 100) + '%';
      if (m.prev === 0 && m.now > 0) dt = '新起量';
      var samples = (m.samples || []).map(function (s) {
        return '<a class="mkt-s" href="' + esc(s.url) + '" target="_blank" rel="noopener">'
          + '<span class="d">' + esc(s.date) + '</span><span>' + esc(s.title) + '</span></a>';
      }).join('');
      return '<div class="mkt" style="--mc:' + m.color + '">'
        + '<div class="mkt-hd"><span class="mkt-n">' + esc(m.zh) + '</span>'
        + '<span class="mkt-d ' + cls + '">' + dt + '</span></div>'
        + '<div class="mkt-stats"><b>' + m.now + '</b> 条 · 前 30 天 ' + m.prev
        + ' 条 · 占近 30 天 ' + Math.round(m.share * 100) + '%</div>'
        + '<div class="mkt-bar"><i style="width:' + (m.now / mx * 100).toFixed(1) + '%"></i></div>'
        + '<div class="mkt-desc">' + esc(m.desc) + '</div>'
        + (samples ? '<div class="mkt-samples">' + samples + '</div>' : '')
        + '</div>';
    }).join('');
  })();

  /* ---------------------------------------------------------- 雷达图 */
  var radarBox = document.getElementById('radar');
  var rtip = document.getElementById('radarTip');

  function drawRadar() {
    var W = 480, H = 400, cx = 240, cy = 192, R = 118;
    var ts = D.TRACK_ORDER_DATA;
    var n = ts.length;
    var css = getComputedStyle(root);
    var cBorder = css.getPropertyValue('--border-2').trim() || '#d3d9e8';
    var cText = css.getPropertyValue('--text-2').trim() || '#565e73';
    var cText3 = css.getPropertyValue('--text-3').trim() || '#8b93a8';
    var acc = css.getPropertyValue('--accent').trim() || '#5b4dee';
    var cSurf = css.getPropertyValue('--surface').trim() || '#ffffff';

    function pt(i, r) {
      var a = (Math.PI * 2 * i / n) - Math.PI / 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="赛道热度雷达图">';
    // 网格
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      var pts = [];
      for (var i = 0; i < n; i++) pts.push(pt(i, R * k).map(function (v) { return v.toFixed(1); }).join(','));
      s += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="' + cBorder
        + '" stroke-width="1" stroke-opacity="' + (k === 1 ? .9 : .5) + '"/>';
    });
    for (var i = 0; i < n; i++) {
      var p = pt(i, R);
      s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1)
        + '" stroke="' + cBorder + '" stroke-width="1" stroke-opacity=".55"/>';
    }
    // 刻度
    [50, 100].forEach(function (v) {
      s += '<text x="' + (cx + 4) + '" y="' + (cy - R * v / 100 + 3) + '" font-size="9.5" fill="'
        + cText3 + '">' + v + '</text>';
    });
    // 数据面
    var poly = [];
    ts.forEach(function (t, i) {
      var r = R * Math.max(0.04, t.heat / 100);
      poly.push(pt(i, r).map(function (v) { return v.toFixed(1); }).join(','));
    });
    s += '<polygon points="' + poly.join(' ') + '" fill="' + alpha(acc, .16)
      + '" stroke="' + acc + '" stroke-width="2" stroke-linejoin="round"/>';
    // 数据点 + 标签
    ts.forEach(function (t, i) {
      var r = R * Math.max(0.04, t.heat / 100);
      var p = pt(i, r);
      s += '<circle class="rpt" data-i="' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1)
        + '" r="4.6" fill="' + t.color + '" stroke="' + cSurf + '" stroke-width="2"/>';
      var lp = pt(i, R + 22);
      var ang = (360 * i / n);
      var anchor = 'middle';
      if (ang > 12 && ang < 168) anchor = 'start';
      else if (ang > 192 && ang < 348) anchor = 'end';
      var dy = (ang > 168 && ang < 192) ? 12 : (ang < 12 || ang > 348 ? -6 : 4);
      s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + dy).toFixed(1)
        + '" font-size="11.5" text-anchor="' + anchor + '" fill="' + cText
        + '" font-weight="500">' + esc(shortName(t.zh)) + '</text>';
      s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + dy + 13).toFixed(1)
        + '" font-size="10" text-anchor="' + anchor + '" fill="' + t.color
        + '" font-weight="600">' + Math.round(t.heat) + '</text>';
    });
    s += '</svg>';
    radarBox.innerHTML = s;

    Array.prototype.forEach.call(radarBox.querySelectorAll('.rpt'), function (node) {
      node.style.cursor = 'pointer';
      node.addEventListener('mouseenter', function () {
        var t = ts[+node.dataset.i];
        var bb = node.getBoundingClientRect();
        var pb = radarBox.getBoundingClientRect();
        rtip.innerHTML = '<b>' + esc(t.zh) + '</b><br>热度指数 ' + Math.round(t.heat)
          + ' · 近 30 天 ' + t.recent + ' 条<br>累计 ' + t.count + ' 条 · 动能 '
          + (t.momentum >= 0 ? '+' : '') + Math.round(t.momentum * 100) + '%';
        rtip.hidden = false;
        rtip.style.left = (bb.left - pb.left + bb.width / 2) + 'px';
        rtip.style.top = (bb.top - pb.top) + 'px';
      });
      node.addEventListener('mouseleave', function () { rtip.hidden = true; });
      node.addEventListener('click', function () {
        var t = ts[+node.dataset.i];
        F.tracks = [t.key]; syncPills(); render();
        document.querySelector('.feed-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  D.TRACK_ORDER_DATA = D.tracks.slice();

  /* ---------------------------------------------------------- 动能 */
  (function () {
    var ms = D.tracks.slice().sort(function (a, b) { return b.momentum - a.momentum; });
    var mx = Math.max.apply(null, ms.map(function (t) { return Math.abs(t.momentum); }).concat([0.5]));
    document.getElementById('momentum').innerHTML = ms.map(function (t) {
      var w = Math.min(50, Math.abs(t.momentum) / mx * 50);
      var pos = t.momentum >= 0;
      var cls = Math.abs(t.momentum) < 0.05 ? 'flat' : (pos ? 'up' : 'dn');
      var col = Math.abs(t.momentum) < 0.05 ? 'var(--text-3)' : (pos ? 'var(--hot)' : 'var(--ok)');
      var style = pos
        ? 'left:50%;width:' + w + '%;background:' + col
        : 'left:' + (50 - w) + '%;width:' + w + '%;background:' + col;
      return '<div class="mom" title="' + esc(t.zh) + '：近 4 周平均 ' + t.recent + ' 条">'
        + '<div class="mom-n"><span style="display:inline-block;width:8px;height:8px;border-radius:3px;'
        + 'background:' + t.color + ';margin-right:6px"></span>' + esc(shortName(t.zh)) + '</div>'
        + '<div class="mom-bar"><span class="mid"></span><i style="' + style + '"></i></div>'
        + '<div class="mom-v ' + cls + '">' + (pos ? '+' : '') + Math.round(t.momentum * 100) + '%</div>'
        + '</div>';
    }).join('');
  })();

  /* ---------------------------------------------------------- 折线图 */
  var lineOn = {};
  D.tracks.slice().sort(function (a, b) { return b.heat - a.heat; })
    .forEach(function (t, i) { lineOn[t.key] = i < 4; });

  var lineBox = document.getElementById('line');
  var lineTipEl = null;

  function drawLine() {
    var W = 900, H = 320, PL = 40, PR = 16, PT = 16, PB = 36;
    var iw = W - PL - PR, ih = H - PT - PB;
    var labels = D.labels, n = labels.length;
    var css = getComputedStyle(root);
    var cBorder = css.getPropertyValue('--border').trim() || '#e2e6f0';
    var cText3 = css.getPropertyValue('--text-3').trim() || '#8b93a8';
    var cSurf = css.getPropertyValue('--surface').trim() || '#ffffff';

    var vis = D.tracks.filter(function (t) { return lineOn[t.key]; });
    var mx = 1;
    vis.forEach(function (t) {
      t.series.forEach(function (v) { if (v > mx) mx = v; });
    });
    mx = Math.ceil(mx / 5) * 5 || 5;

    function X(i) { return PL + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
    function Y(v) { return PT + ih - ih * v / mx; }

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="赛道趋势曲线">';
    for (var g = 0; g <= 4; g++) {
      var v = mx * g / 4, y = Y(v);
      s += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1)
        + '" stroke="' + cBorder + '" stroke-width="1"/>';
      s += '<text x="' + (PL - 8) + '" y="' + (y + 3.5).toFixed(1) + '" font-size="10.5" text-anchor="end" fill="'
        + cText3 + '">' + Math.round(v) + '</text>';
    }
    for (var i = 0; i < n; i++) {
      if (i % 2 === 0 || i === n - 1) {
        s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 14) + '" font-size="10.5" text-anchor="middle" fill="'
          + cText3 + '">' + esc(labels[i]) + '</text>';
      }
    }
    // 未走完的当前周：灰底标注
    if (D.partial_last_week && n > 1) {
      var xs = (X(n - 1) + X(n - 2)) / 2;
      s += '<rect x="' + xs.toFixed(1) + '" y="' + PT + '" width="' + (W - PR - xs).toFixed(1)
        + '" height="' + ih + '" fill="' + cText3 + '" fill-opacity=".07"/>';
      s += '<text x="' + (W - PR - 4) + '" y="' + (PT + 13) + '" font-size="9.5" text-anchor="end" fill="'
        + cText3 + '">本周未完</text>';
    }
    vis.forEach(function (t) {
      var pts = t.series.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
      s += '<polyline points="' + pts.slice(0, n - 1).join(' ') + '" fill="none" stroke="' + t.color
        + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
      s += '<polyline points="' + pts.slice(n - 2).join(' ') + '" fill="none" stroke="' + t.color
        + '" stroke-width="2.2" stroke-dasharray="4 3" stroke-linecap="round" stroke-opacity=".65"/>';
      t.series.forEach(function (v, i) {
        s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.9" fill="'
          + t.color + '" stroke="' + cSurf + '" stroke-width="1.4"/>';
      });
    });
    // 交互热区
    for (var k = 0; k < n; k++) {
      var half = iw / (n - 1) / 2;
      s += '<rect class="hz" data-i="' + k + '" x="' + (X(k) - half).toFixed(1) + '" y="' + PT
        + '" width="' + (half * 2).toFixed(1) + '" height="' + ih + '" fill="transparent"/>';
    }
    s += '</svg>';
    lineBox.innerHTML = s;

    if (!lineTipEl) {
      lineTipEl = el('<div class="rtip" hidden></div>');
      lineBox.style.position = 'relative';
      lineBox.appendChild(lineTipEl);
    } else {
      lineBox.appendChild(lineTipEl);
    }
    Array.prototype.forEach.call(lineBox.querySelectorAll('.hz'), function (r) {
      r.addEventListener('mouseenter', function () {
        var i = +r.dataset.i;
        var rows = vis.map(function (t) {
          return '<span style="color:' + t.color + '">●</span> ' + esc(shortName(t.zh)) + ' <b>'
            + t.series[i] + '</b>';
        }).join('<br>');
        lineTipEl.innerHTML = '<b>' + esc(labels[i]) + ' 起当周</b>'
          + (i === n - 1 && D.partial_last_week ? '（未走完）' : '') + '<br>' + rows;
        lineTipEl.hidden = false;
        var bb = r.getBoundingClientRect(), pb = lineBox.getBoundingClientRect();
        lineTipEl.style.left = Math.max(70, Math.min(pb.width - 70, bb.left - pb.left + bb.width / 2)) + 'px';
        lineTipEl.style.top = '58px';
      });
      r.addEventListener('mouseleave', function () { lineTipEl.hidden = true; });
    });
  }

  document.getElementById('lineLegend').innerHTML = D.tracks.map(function (t) {
    return '<span class="lg' + (lineOn[t.key] ? '' : ' off') + '" data-k="' + t.key + '">'
      + '<i class="sw" style="background:' + t.color + '"></i>' + esc(shortName(t.zh)) + '</span>';
  }).join('');
  document.getElementById('lineLegend').addEventListener('click', function (e) {
    var lg = e.target.closest('.lg'); if (!lg) return;
    var k = lg.dataset.k;
    var onCount = Object.keys(lineOn).filter(function (x) { return lineOn[x]; }).length;
    if (lineOn[k] && onCount <= 1) return;
    lineOn[k] = !lineOn[k];
    lg.classList.toggle('off', !lineOn[k]);
    drawLine();
  });

  /* ---------------------------------------------------------- 热词 */
  (function () {
    var mxc = Math.max.apply(null, D.terms.map(function (t) { return t.count; }));
    var mnc = Math.min.apply(null, D.terms.map(function (t) { return t.count; }));
    document.getElementById('cloud').innerHTML = D.terms.map(function (t) {
      var r = (t.count - mnc) / Math.max(1, mxc - mnc);
      var fs = (12.5 + r * 13).toFixed(1);
      var hot = t.count >= 4 && t.recent / t.count > 0.34;
      return '<span class="tag" data-t="' + esc(t.term) + '" title="累计 ' + t.count
        + ' 次 · 近 30 天 ' + t.recent + ' 次" style="font-size:' + fs + 'px;color:' + t.color
        + ';background:' + alpha(t.color, .1) + ';border-color:' + alpha(t.color, .22) + '">'
        + esc(t.term) + '<sup>' + t.count + '</sup>'
        + (hot ? '<span class="fire">▲</span>' : '') + '</span>';
    }).join('');
    document.getElementById('cloud').addEventListener('click', function (e) {
      var tag = e.target.closest('.tag'); if (!tag) return;
      var term = tag.dataset.t;
      F.term = (F.term === term) ? '' : term;
      Array.prototype.forEach.call(document.querySelectorAll('.tag'), function (x) {
        x.classList.toggle('on', x.dataset.t === F.term);
      });
      render();
      document.querySelector('.feed-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

  /* ---------------------------------------------------------- 信息构成 */
  (function () {
    var tot = D.type_mix.reduce(function (a, b) { return a + b.count; }, 0) || 1;
    document.getElementById('typeMix').innerHTML = D.type_mix.map(function (m) {
      var p = m.count / tot * 100;
      return '<div class="tm"><span>' + esc(m.label) + '</span>'
        + '<div class="tm-bar"><i style="width:' + p.toFixed(1) + '%;background:'
        + (TYPE_COLOR[m.type] || 'var(--accent)') + '"></i></div>'
        + '<span class="tm-v">' + m.count + ' · ' + Math.round(p) + '%</span></div>';
    }).join('');
    document.getElementById('srcMix').innerHTML = D.source_mix.map(function (s) {
      return '<span class="src">' + esc(s.source) + '<b>' + s.count + '</b></span>';
    }).join('');
  })();

  /* ---------------------------------------------------------- 筛选与列表 */
  var F = { tracks: [], types: [], products: [], q: '', range: 30, sort: 'heat', term: '' };
  var PAGE = 30, shown = PAGE;

  document.getElementById('trackPills').innerHTML = D.tracks.slice()
    .sort(function (a, b) { return b.heat - a.heat; }).map(function (t) {
      return '<span class="pill" data-k="' + t.key + '"><i class="sw" style="background:'
        + t.color + '"></i>' + esc(t.zh) + '<span class="c">' + t.count + '</span></span>';
    }).join('');
  document.getElementById('typePills').innerHTML = D.type_mix.map(function (m) {
    return '<span class="pill" data-t="' + m.type + '">' + esc(m.label)
      + '<span class="c">' + m.count + '</span></span>';
  }).join('');

  function syncPills() {
    Array.prototype.forEach.call(document.querySelectorAll('#trackPills .pill'), function (p) {
      var on = F.tracks.indexOf(p.dataset.k) >= 0;
      p.classList.toggle('on', on);
      p.style.background = on ? TRACKS[p.dataset.k].color : '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('#typePills .pill'), function (p) {
      var on = F.types.indexOf(p.dataset.t) >= 0;
      p.classList.toggle('on', on);
      p.style.background = on ? TYPE_COLOR[p.dataset.t] : '';
    });
  }
  document.getElementById('trackPills').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    var k = p.dataset.k, i = F.tracks.indexOf(k);
    if (i >= 0) F.tracks.splice(i, 1); else F.tracks.push(k);
    shown = PAGE; syncPills(); render();
  });
  document.getElementById('typePills').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    var t = p.dataset.t, i = F.types.indexOf(t);
    if (i >= 0) F.types.splice(i, 1); else F.types.push(t);
    shown = PAGE; syncPills(); render();
  });

  var qEl = document.getElementById('q'), tmr;
  qEl.addEventListener('input', function () {
    clearTimeout(tmr);
    tmr = setTimeout(function () { F.q = qEl.value.trim().toLowerCase(); shown = PAGE; render(); }, 180);
  });
  document.getElementById('range').addEventListener('change', function () {
    F.range = +this.value; shown = PAGE; render();
  });
  document.getElementById('sort').addEventListener('change', function () {
    F.sort = this.value; shown = PAGE; render();
  });
  document.getElementById('more').addEventListener('click', function () {
    shown += PAGE; render(true);
  });

  function filtered() {
    var out = D.items.filter(function (x) {
      if (x.days_ago > F.range) return false;
      if (F.tracks.length && !F.tracks.some(function (k) { return (x.tracks || []).indexOf(k) >= 0; })) return false;
      if (F.types.length && F.types.indexOf(x.source_type) < 0) return false;
      if (F.products.length
        && !F.products.some(function (p) { return (x.products || []).indexOf(p) >= 0; })) return false;
      if (F.term && (x.terms || []).indexOf(F.term) < 0) return false;
      if (F.q) {
        var hay = (x.title + ' ' + (x.summary || '') + ' ' + x.source + ' '
          + (x.terms || []).join(' ')).toLowerCase();
        if (hay.indexOf(F.q) < 0) return false;
      }
      return true;
    });
    if (F.sort === 'date') out.sort(function (a, b) { return a.days_ago - b.days_ago || b.heat - a.heat; });
    else if (F.sort === 'metric') out.sort(function (a, b) { return (b.metric || 0) - (a.metric || 0) || b.heat - a.heat; });
    else out.sort(function (a, b) { return b.heat - a.heat; });
    return out;
  }

  function metricText(x) {
    if (x.source_type === 'repo') return '★ ' + fmt(x.metric || 0);
    if (x.source_type === 'community') return x.metric ? (x.metric + ' 分') : '';
    if (x.source_type === 'paper' && x.metric) return '▲ ' + x.metric;
    return '';
  }

  function rowHTML(x) {
    var mt = metricText(x);
    var isNew = !D.first_build && x.first_seen === D.date;
    var tc = (x.tracks || []).map(function (k) {
      var t = TRACKS[k]; if (!t) return '';
      return '<span class="tc" data-k="' + k + '" style="color:' + t.color + ';background:'
        + alpha(t.color, .11) + '">' + esc(t.zh) + '</span>';
    }).join('');
    var terms = (x.terms || []).slice(0, 6);
    return '<article class="row">'
      + '<div class="hbox"><div class="hnum" style="color:' + (x.heat >= 60 ? 'var(--hot)' : 'var(--text-2)')
      + '">' + Math.round(x.heat) + '</div>'
      + '<div class="hbar"><i style="width:' + Math.min(100, x.heat) + '%;background:'
      + (x.heat >= 60 ? 'var(--hot)' : 'var(--accent)') + '"></i></div>'
      + '<div class="hlab">热度</div></div>'
      + '<div class="r-main">'
      + '<a class="r-title" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>'
      + '<div class="r-meta">'
      + '<span class="b-type" style="color:' + TYPE_COLOR[x.source_type] + ';background:'
      + alpha(TYPE_COLOR[x.source_type] || '#888', .12) + '">' + esc(TYPE_LABEL[x.source_type] || x.source_type) + '</span>'
      + '<span class="b-src">' + esc(x.source) + '</span>'
      + (isNew ? '<span class="b-new">今日新增</span>' : '')
      + '<span>' + esc(x.date) + '</span>'
      + (x.days_ago <= 2 ? '<span style="color:#d4483b">· 最新</span>' : '')
      + (mt ? '<span class="b-metric">· ' + esc(mt) + '</span>' : '')
      + ((x.also && x.also.length) ? '<span>· 另见 ' + esc(x.also.join('/')) + '</span>' : '')
      + '</div>'
      + (x.summary ? '<div class="r-sum">' + esc(x.summary) + '</div>' : '')
      + '<div class="r-tracks">' + tc + '</div>'
      + ((x.products || []).length ? '<div class="r-prods">' + (x.products || []).map(function (p) {
        var m = PROD[p];
        var col = m ? m.color : '#8b93a8';
        return '<span class="pd" data-p="' + esc(p) + '" style="color:' + col
          + ';background:' + alpha(col, .1) + ';border-color:' + alpha(col, .22) + '">'
          + esc(p) + '</span>';
      }).join('') + '</div>' : '')
      + (terms.length ? '<div class="r-terms">关键词：' + esc(terms.join(' · ')) + '</div>' : '')
      + '</div></article>';
  }

  function render(keepScroll) {
    var list = filtered();
    var feed = document.getElementById('feed');
    feed.innerHTML = list.length
      ? list.slice(0, shown).map(rowHTML).join('')
      : '<div class="empty">没有符合条件的条目，试着放宽时间范围或清空筛选。</div>';
    document.getElementById('more').hidden = list.length <= shown;
    document.getElementById('feedCount').textContent =
      '命中 ' + list.length + ' 条' + (list.length > shown ? '，已显示 ' + shown : '');

    var ar = document.getElementById('activeRow');
    var chips = [];
    F.tracks.forEach(function (k) { chips.push(['track', k, TRACKS[k].zh]); });
    F.types.forEach(function (t) { chips.push(['type', t, TYPE_LABEL[t]]); });
    F.products.forEach(function (p) { chips.push(['product', p, '产品：' + p]); });
    if (F.term) chips.push(['term', F.term, '热词：' + F.term]);
    if (F.q) chips.push(['q', F.q, '搜索：' + F.q]);
    if (chips.length) {
      ar.hidden = false;
      ar.innerHTML = '<span>已筛选：</span>' + chips.map(function (ch) {
        return '<span class="chip-x" data-kind="' + ch[0] + '" data-v="' + esc(ch[1]) + '">'
          + esc(ch[2]) + ' ✕</span>';
      }).join('') + '<span class="chip-x" data-kind="all">全部清除 ✕</span>';
    } else { ar.hidden = true; ar.innerHTML = ''; }

    Array.prototype.forEach.call(feed.querySelectorAll('.tc'), function (t) {
      t.addEventListener('click', function () {
        F.tracks = [t.dataset.k]; shown = PAGE; syncPills(); render();
        document.querySelector('.feed-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    Array.prototype.forEach.call(feed.querySelectorAll('.pd'), function (t) {
      t.addEventListener('click', function (e) {
        e.stopPropagation();
        openModal(t.dataset.p);
      });
    });
  }

  document.getElementById('activeRow').addEventListener('click', function (e) {
    var ch = e.target.closest('.chip-x'); if (!ch) return;
    var kind = ch.dataset.kind, v = ch.dataset.v;
    if (kind === 'all') {
      F.tracks = []; F.types = []; F.products = []; F.term = ''; F.q = ''; qEl.value = '';
      Array.prototype.forEach.call(document.querySelectorAll('.tag'), function (x) { x.classList.remove('on'); });
    } else if (kind === 'track') F.tracks.splice(F.tracks.indexOf(v), 1);
    else if (kind === 'type') F.types.splice(F.types.indexOf(v), 1);
    else if (kind === 'product') F.products.splice(F.products.indexOf(v), 1);
    else if (kind === 'term') {
      F.term = '';
      Array.prototype.forEach.call(document.querySelectorAll('.tag'), function (x) { x.classList.remove('on'); });
    } else if (kind === 'q') { F.q = ''; qEl.value = ''; }
    shown = PAGE; syncPills(); render();
  });

  /* ---------------------------------------------------------- 启动 */
  drawRadar();
  drawLine();
  syncPills();
  render();
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () { drawRadar(); drawLine(); }, 200);
  });
})();
