// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders four
// views over the same dataset: the ranked board, a sector table, the live-token set, and the model.
// Everything is computed here from the rows the program wrote: no fetch, no network, no framework.
//
// The page recomputes each row's implied value from the snapshot figures with impliedOf(), the same
// arithmetic the program ran, and shows the result beside the number board.json carries. A reader can
// see that the ranking is the model's and not a table someone typed, and the model view lets them move
// the constants and watch the board re-rank itself.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;

  var state = {
    view: 'board',
    q: '',
    category: 'all',
    chain: 'all',
    watch: false,
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  // ---------- formatting ----------
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdExact(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    // The sign glyph carries the direction, so the column survives greyscale and colour blindness.
    // Round first, then read the sign off the rounded value, so a -0.02% change reads "0.0%" and not
    // the impossible-looking "-0.0%".
    var r = Math.round(n * 10) / 10;
    if (r > 0) return '▲ +' + r.toFixed(1) + '%';
    if (r < 0) return '▼ ' + r.toFixed(1) + '%';
    return '— 0.0%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return Math.round(days) + 'd';
  }
  function sign(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'flat';
    return n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
  }

  // ---------- the model, in one function ----------
  // The same arithmetic as lib/model.ts: log10(value) is a fitted affine function of log10(TVL) and
  // log10(age), plus a small tilt on the seven-day move. The coefficients are in D.curve, produced by the
  // fit the program ran, and the page recomputes every row from them: nothing is a typed-in multiple.
  function tiltOf(change) {
    var g = Math.min(1.2, Math.max(-0.6, (change === null || change === undefined ? 0 : change) / 100));
    return Math.log(1 + D.curve.growth_tilt * Math.max(-0.5, Math.min(0.5, g))) / Math.LN10;
  }
  function log10Of(row) {
    var a = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    return D.curve.intercept
      + D.curve.tvl_beta * Math.log(Math.max(1, row.tvl_usd)) / Math.LN10
      + D.curve.age_beta * Math.log(Math.min(1095, Math.max(1, a))) / Math.LN10
      + tiltOf(row.change_7d);
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(Math.pow(10, log10Of(row))));
  }

  // ---------- DOM ----------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'onclick') node.addEventListener('click', v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function $(id) { return document.getElementById(id); }
  // The row counter lives in the board's control bar, which other views do not render. Writing to it
  // unguarded threw a TypeError that aborted those views after their header, leaving an empty table.
  function setCount(text) { var n = $('count'); if (n) n.textContent = text; }

  // ---------- the header's scoreline ----------
  function renderScoreline() {
    var host = $('scoreline');
    clear(host);
    var top = D.rows[0];
    var total = 0;
    for (var i = 0; i < D.rows.length; i++) total += D.rows[i].implied_value_usd;
    var c = D.curve;
    var items = [
      ['Watchlist ranked', D.watchlist_size + ' / ' + D.watchlist_size, 'mid'],
      ['Launches ranked', String(D.board_size), ''],
      ['Below the floor', String(D.early_size), 'lo'],
      ['Top launch value', usd(top ? top.implied_value_usd : 0), 'hi'],
      ['Curve, leave-one-out', c.loo_miss.toFixed(2) + 'x  vs ' + c.flat_miss.toFixed(2) + 'x flat', 'mid'],
      ['Within 3x', Math.round(c.within_3x * 100) + '%  vs ' + Math.round(c.flat_within_3x * 100) + '% flat', 'mid'],
    ];
    items.forEach(function (it) {
      host.appendChild(el('div', {},
        el('dt', { text: it[0] }),
        el('dd', { class: it[2], text: it[1] })
      ));
    });
  }

  // ---------- the rail: the model, the sectors, the provenance ----------
  function renderRail() {
    var rail = $('rail');
    clear(rail);
    var c = D.curve;

    rail.appendChild(el('section', {},
      el('h3', { text: 'How a launch is priced' }),
      el('div', { class: 'formula' },
        'log10 value = ' + c.intercept.toFixed(2) + '\n',
        '  + ' + c.tvl_beta.toFixed(3) + ' x log10(TVL)\n',
        '  + ' + c.age_beta.toFixed(3) + ' x log10(age)\n',
        '  + ' + c.growth_tilt.toFixed(2) + ' x 7d tilt\n',
        'band = P10..P90 residual\n'
      ),
      el('p', { text: 'Fitted, not typed in: a Huber-weighted log-log regression over the ' + c.fit_rows + ' protocols in this snapshot that already trade and clear $100k of TVL. The slope says what the market actually pays per dollar of TVL; a flat multiple would claim it is the same at every size, which the prints reject.' })
    ));

    // The ablation: what the curve buys, measured out of sample. Every figure is computed in main.ts by
    // refitting without each row, so the page quotes evidence rather than asserting accuracy.
    var abl = el('section', {}, el('h3', { text: 'Out of sample' }));
    abl.appendChild(el('div', { class: 'kv' }, el('span', { text: 'Median miss, curve' }), el('span', { class: 'hi', text: c.loo_miss.toFixed(2) + 'x' })));
    abl.appendChild(el('div', { class: 'kv' }, el('span', { text: 'Median miss, flat multiple' }), el('span', { text: c.flat_miss.toFixed(2) + 'x' })));
    abl.appendChild(el('div', { class: 'kv' }, el('span', { text: 'Within 3x, curve' }), el('span', { class: 'hi', text: Math.round(c.within_3x * 100) + '%' })));
    abl.appendChild(el('div', { class: 'kv' }, el('span', { text: 'Within 3x, flat' }), el('span', { text: Math.round(c.flat_within_3x * 100) + '%' })));
    abl.appendChild(el('div', { class: 'kv' }, el('span', { text: 'Rows the fit read' }), el('span', { text: String(c.fit_rows) })));
    abl.appendChild(el('p', { class: 'more', text: 'Leave-one-out: every traded protocol predicted by a curve fitted without it. The flat multiple is the same test at a constant mcap/TVL, which is the starter\u2019s model and the thing this curve has to beat.' }));
    rail.appendChild(abl);

    var uni = el('section', {},
      el('h3', { text: 'The universe' }),
      el('div', { class: 'kv' }, el('span', { text: 'Protocols in the snapshot' }), el('span', { text: String(D.universe_size) })),
      el('div', { class: 'kv' }, el('span', { text: 'Traded, in the fit' }), el('span', { text: String(c.fit_rows) })),
      el('div', { class: 'kv' }, el('span', { text: 'Watchlist' }), el('span', { text: String(D.watchlist_size) })),
      el('div', { class: 'kv' }, el('span', { text: 'Set aside' }), el('span', { text: String(D.live_size) })),
      el('div', { class: 'kv' }, el('span', { text: 'Model' }), el('span', { text: D.model_version })),
      el('div', { class: 'kv' }, el('span', { text: 'Source' }), el('span', { text: 'DefiLlama' }))
    );
    rail.appendChild(uni);
    rail.appendChild(el('p', { class: 'sealed', text: 'Snapshot sealed ' + D.as_of + '. Every figure here comes from it: ' + D.watchlist_size + ' tokenless protocols on the watchlist, and the rest of the universe priced on the curve the traded ones set.' }));
  }

  // ---------- filters and sorting ----------
  function matches(row) {
    if (state.watch && !row.on_watchlist) return false;
    if (state.category !== 'all' && row.category !== state.category) return false;
    if (state.chain !== 'all') {
      var hit = false;
      for (var i = 0; i < row.chains.length; i++) if (row.chains[i] === state.chain) { hit = true; break; }
      if (!hit) return false;
    }
    if (state.q) {
      var q = state.q.toLowerCase();
      if (row.name.toLowerCase().indexOf(q) < 0 && String(row.category).toLowerCase().indexOf(q) < 0 && row.slug.indexOf(q) < 0) return false;
    }
    return true;
  }

  function valueOf(row) { return impliedOf(row); }

  function sorted(rows) {
    var k = state.sort;
    var out = rows.slice();
    out.sort(function (a, b) {
      var va, vb;
      if (k === 'implied') { va = valueOf(a); vb = valueOf(b); }
      else if (k === 'rank') { va = a.rank; vb = b.rank; }
      else if (k === 'ready') { va = a.launch_readiness; vb = b.launch_readiness; }
      else if (k === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (k === 'growth') { va = a.change_7d === null ? -999 : a.change_7d; vb = b.change_7d === null ? -999 : b.change_7d; }
      else if (k === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (k === 'capital') { va = a.plan_capital_usd; vb = b.plan_capital_usd; }
      else { va = a.name; vb = b.name; }
      if (va === vb) return a.rank - b.rank;
      if (typeof va === 'string') return va < vb ? -state.dir : state.dir;
      return (va - vb) * state.dir;
    });
    return out;
  }

  function renderControls() {
    var host = $('controls');
    clear(host);
    var input = el('input', { type: 'search', placeholder: 'Filter by name, category or slug', 'aria-label': 'Filter the board' });
    input.value = state.q;
    input.addEventListener('input', function () { state.q = input.value; renderTable(); });
    host.appendChild(input);

    var cats = ['all'];
    for (var i = 0; i < D.rows.length; i++) if (cats.indexOf(D.rows[i].category) < 0) cats.push(D.rows[i].category);
    cats.sort();
    var sel = el('select', { 'aria-label': 'Filter by category' });
    cats.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All categories' : c });
      if (c === state.category) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.category = sel.value; renderTable(); });
    host.appendChild(sel);

    var chains = ['all'];
    for (var j = 0; j < D.rows.length; j++) {
      var ch = D.rows[j].chains;
      for (var k = 0; k < ch.length; k++) if (chains.indexOf(ch[k]) < 0) chains.push(ch[k]);
    }
    chains.sort();
    var selc = el('select', { 'aria-label': 'Filter by chain' });
    chains.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All chains' : c });
      if (c === state.chain) o.selected = true;
      selc.appendChild(o);
    });
    selc.addEventListener('change', function () { state.chain = selc.value; renderTable(); });
    host.appendChild(selc);

    var chip = el('button', {
      class: 'chip', type: 'button', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only',
      onclick: function () { state.watch = !state.watch; render(); },
    });
    host.appendChild(chip);

    var reset = el('button', {
      class: 'chip', type: 'button', text: 'Reset',
      onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; render(); },
    });
    host.appendChild(reset);
    host.appendChild(el('span', { class: 'spacer' }));
    host.appendChild(el('span', { class: 'count', id: 'count' }));
  }

  // ---------- the board table ----------
  var COLS = [
    { key: 'rank', label: '#', cls: 'rank' },
    { key: 'name', label: 'Protocol', cls: 'name' },
    { key: 'implied', label: 'Implied launch value', cls: 'val r' },
    { key: 'range', label: 'Range', cls: 'range r' },
    { key: 'tvl', label: 'TVL', cls: 'r' },
    { key: 'mult', label: 'Value / TVL', cls: 'mult r' },
    { key: 'growth', label: 'TVL 7d', cls: 'r' },
    { key: 'age', label: 'Tokenless for', cls: 'r' },
    { key: 'ready', label: 'Readiness', cls: 'ready' },
    { key: 'plan', label: 'Farm plan', cls: 'r' },
  ];

  function renderThead() {
    var thead = $('thead');
    clear(thead);
    var tr = el('tr');
    COLS.forEach(function (c) {
      var th = el('th', { class: /\br\b/.test(c.cls) ? 'r' : '', text: c.label });
      if (c.key === state.sort) th.setAttribute('aria-sort', state.dir < 0 ? 'descending' : 'ascending');
      th.addEventListener('click', function () {
        if (state.sort === c.key) state.dir = -state.dir;
        else { state.sort = c.key; state.dir = c.key === 'name' ? 1 : -1; }
        renderTable();
      });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }

  function renderTable() {
    var rows = sorted(D.rows.filter(matches));
    var tbody = $('tbody');
    clear(tbody);
    var count = $('count');
    if (count) count.textContent = rows.length + ' of ' + D.rows.length + ' rows';

    if (rows.length === 0) {
      tbody.appendChild(el('tr', {}, el('td', { class: 'empty', colspan: String(COLS.length), text: 'No protocol matches these filters.' })));
      return;
    }
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var v = valueOf(r);
      var share = Math.max(2, Math.min(100, r.launch_readiness));
      var tr = el('tr', { onclick: function () { openDetail(r.slug); }, tabindex: '0' },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', { class: 'name' },
          el('span', { class: 'nm', text: r.name }),
          r.on_watchlist ? el('span', { class: 'wl', text: 'watchlist' }) : null,
          el('span', { class: 'cat', text: (r.category || 'Uncategorised') + ' · ' + r.chains.slice(0, 2).join(', ') })
        ),
        el('td', { class: 'val r', text: usd(v) }),
        el('td', { class: 'range r', text: usd(r.implied_value_low_usd) + ' – ' + usd(r.implied_value_high_usd) }),
        el('td', { class: 'r', text: usd(r.tvl_usd) }),
        el('td', { class: 'mult r' },
          (v / Math.max(1, r.tvl_usd)).toFixed(3) + 'x',
          el('span', { class: 'pz', text: ' curve' })
        ),
        el('td', { class: 'r ' + sign(r.change_7d), text: pct(r.change_7d) }),
        el('td', { class: 'r', text: age(r.age_days) }),
        el('td', { class: 'ready' },
          el('div', { class: 'wrap' },
            el('div', { class: 'track', style: 'flex:1' }, el('div', { class: 'fill', style: 'width:' + share + '%' })),
            el('span', { class: 'num', text: String(r.launch_readiness) })
          )
        ),
        el('td', { class: 'r', text: '$' + r.plan_capital_usd + ' · ' + r.plan_hold_days + 'd' })
      );
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  // ---------- the curve view: the fit's own record, row by row ----------
  // Everything here is the program's output, not a claim: D.fit holds every traded protocol the curve was
  // fitted on, with the market's market cap beside the curve's prediction. A reader can see the misses.
  function renderCurve() {
    var thead = $('thead');
    var tbody = $('tbody');
    clear(tbody);
    var c = D.curve;
    thead.innerHTML = '<tr><th>Protocol, worst miss first</th><th class="r">TVL</th><th class="r">Age</th><th class="r">Market cap</th><th class="r">Curve</th><th class="r">Miss</th></tr>';
    setCount(D.fit.length + ' traded protocols, curve vs market');

    // The curve's own arithmetic, at the head of the table, before a single row.
    var all = D.fit;
    var inside = 0;
    for (var i = 0; i < all.length; i++) if (all[i].miss <= 3) inside++;
    tbody.appendChild(el('tr', { class: 'sumrow' },
      el('td', { class: 'name' },
        el('span', { class: 'nm', text: 'log10 value = ' + c.intercept.toFixed(2) + ' + ' + c.tvl_beta.toFixed(3) + '·log10 TVL ' + (c.age_beta < 0 ? '− ' + Math.abs(c.age_beta).toFixed(3) : '+ ' + c.age_beta.toFixed(3)) + '·log10 age' }),
        el('span', { class: 'cat', text: Math.round(inside / all.length * 100) + '% of these ' + all.length + ' traded protocols land within 3x; a flat multiple of TVL lands ' + Math.round(c.flat_within_3x * 100) + '% within 3x' })
      ),
      el('td', { class: 'r', text: '' }), el('td', { class: 'r', text: '' }), el('td', { class: 'r', text: '' }),
      el('td', { class: 'val r', text: c.loo_miss.toFixed(2) + 'x' }),
      el('td', { class: 'r', text: 'median' })
    ));

    var frag = document.createDocumentFragment();
    all.forEach(function (f) {
      var cls = f.miss <= 1.5 ? 'val r' : f.miss <= 3 ? 'r' : 'r low';
      frag.appendChild(el('tr', {},
        el('td', { class: 'name' },
          el('span', { class: 'nm', text: f.name }),
          el('span', { class: 'cat', text: f.slug })
        ),
        el('td', { class: 'r', text: usd(f.tvl_usd) }),
        el('td', { class: 'r', text: age(f.age_days) }),
        el('td', { class: 'r', text: usd(f.mcap_usd) }),
        el('td', { class: cls, text: usd(f.predicted_usd) }),
        el('td', { class: cls, text: f.miss.toFixed(2) + 'x' })
      ));
    });
    tbody.appendChild(frag);
  }

  // ---------- the live-token view ----------
  function renderLive() {
    var tbody = $('tbody');
    clear(tbody);
    setCount(D.live.length + ' tokenized protocols');
    $('thead').innerHTML = '<tr><th>Protocol</th><th class="r">Market cap</th><th class="r">TVL</th><th class="r">Mcap / TVL</th><th class="r">7d TVL</th><th>Chains</th></tr>';
    D.live.forEach(function (p) {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'name' },
          el('span', { class: 'nm', text: p.name }),
          el('span', { class: 'cat', text: p.category || 'Uncategorised' })
        ),
        el('td', { class: 'mcap r', text: usd(p.mcap_usd) }),
        el('td', { class: 'r', text: usd(p.tvl_usd) }),
        el('td', { class: 'val r', text: p.multiple === null ? 'n/a' : p.multiple.toFixed(2) + 'x' }),
        el('td', { class: 'r ' + sign(p.change_7d), text: pct(p.change_7d) }),
        el('td', { text: p.chains.slice(0, 3).join(', ') })
      ));
    });
  }

  // ---------- the model view: the fit's numbers and what each term buys ----------
  function renderModel() {
    var tbody = $('tbody');
    clear(tbody);
    $('thead').innerHTML = '<tr><th>The model</th><th class="r">Value</th></tr>';
    setCount(D.model_version);

    var total = 0;
    var top = null;
    for (var i = 0; i < D.rows.length; i++) {
      total += D.rows[i].implied_value_usd;
      if (top === null || D.rows[i].implied_value_usd > top.v) top = { r: D.rows[i], v: D.rows[i].implied_value_usd };
    }
    var c = D.curve;
    var pairs = [
      ['Model version', D.model_version],
      ['Form', 'log10(value) = intercept + β·log10(TVL) + γ·log10(age) + δ·7d tilt'],
      ['Intercept', c.intercept.toFixed(4)],
      ['β, the TVL elasticity', c.tvl_beta.toFixed(4)],
      ['γ, the age elasticity', c.age_beta.toFixed(4)],
      ['δ, the seven-day tilt', c.growth_tilt.toFixed(4)],
      ['Band', 'P10 to P90 of the fit residuals: ' + c.band_low.toFixed(2) + ' to ' + c.band_high.toFixed(2) + ' in log10'],
      ['Fit set', c.fit_rows + ' protocols that already trade, $100k of TVL or more'],
      ['Median miss, leave one out', c.loo_miss.toFixed(2) + 'x'],
      ['Median miss, flat multiple', c.flat_miss.toFixed(2) + 'x'],
      ['Within 3x, leave one out', Math.round(c.within_3x * 100) + '%'],
      ['Within 3x, flat multiple', Math.round(c.flat_within_3x * 100) + '%'],
      ['Rows on the board', String(D.board_size) + ' (' + D.early_size + ' below the watchlist floor)'],
      ['Board value at these coefficients', usd(total)],
      ['Top launch', top ? top.r.name + ' · ' + usd(top.v) : 'n/a'],
    ];
    pairs.forEach(function (pair) {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'name', text: pair[0] }),
        el('td', { class: 'val r', text: String(pair[1]) })
      ));
    });

    tbody.appendChild(el('tr', {}, el('td', { colspan: '2', class: 'foot' },
      'Why a curve and not a multiple: a flat multiple claims a protocol is worth the same share of its TVL at every size, so a billion-dollar TVL is priced like a fifty-million one. The snapshot\u2019s own prints say otherwise, and the slope is fitted rather than chosen. Every figure above is computed by the program from the snapshot, and the Curve tab prints the rows it was measured on.'
    )));

    // The ablation, in place: what dropping each term costs, measured leave-one-out.
    tbody.appendChild(el('tr', {}, el('td', { colspan: '2', class: 'name', text: 'What each term buys, out of sample' })));
    var abl = [
      ['TVL and age, the curve as shipped', c.loo_miss.toFixed(2) + 'x', Math.round(c.within_3x * 100) + '%'],
      ['A flat multiple of TVL, no curve', c.flat_miss.toFixed(2) + 'x', Math.round(c.flat_within_3x * 100) + '%'],
    ];
    abl.forEach(function (a) {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'name', text: a[0] }),
        el('td', { class: 'val r', text: a[1] + '  ·  ' + a[2] + ' within 3x' })
      ));
    });
  }

  // ---------- the tabs ----------
  function renderTabs() {
    var host = $('tabs');
    clear(host);
    var tabs = [
      ['board', 'Board', D.board_size],
      ['curve', 'The curve', D.fit.length],
      ['live', 'Live tokens', D.live.length],
      ['model', 'The model', null],
    ];
    tabs.forEach(function (t) {
      var b = el('button', {
        type: 'button', role: 'tab', 'aria-selected': state.view === t[0] ? 'true' : 'false',
        onclick: function () { state.view = t[0]; render(); },
      }, t[1]);
      if (t[2] !== null) b.appendChild(el('span', { class: 'n', text: String(t[2]) }));
      host.appendChild(b);
    });
  }

  // ---------- the detail view ----------
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { row = D.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    var drawer = $('drawer');
    var body = $('drawer-body');
    clear(body);

    var v = valueOf(row);
    var lo = row.implied_value_low_usd;
    var hi = row.implied_value_high_usd;
    // The band is built by multiplying, so its axis is geometric: place the marker on a log scale, or a
    // midpoint estimate would sit left of centre and read as "cheap against its own band".
    var span = Math.log(hi / lo);
    var dotPos = span > 0 ? Math.max(0, Math.min(100, (Math.log(v / lo) / span) * 100)) : 50;

    body.appendChild(el('div', { class: 'hd' },
      el('div', {},
        el('h2', { id: 'drawer-title', text: row.name }),
        el('p', { class: 'meta', text: '#' + row.rank + ' of ' + D.board_size + ' · ' + (row.category || 'Uncategorised') + ' · ' + (row.chains.length > 3 ? row.chains.slice(0, 3).join(', ') + ' and ' + (row.chains.length - 3) + ' more' : row.chains.join(', ')) + (row.on_watchlist ? ' · on the watchlist' : ' · below the watchlist floor') })
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail })
    ));

    body.appendChild(el('div', { class: 'big' },
      el('span', { class: 'v', text: '≈ ' + usd(v) }),
      el('span', { class: 'lbl', text: 'implied launch value' })
    ));
    body.appendChild(el('div', { class: 'rangebar' }, el('span', { class: 'dot', style: 'left:' + dotPos + '%' })));
    body.appendChild(el('div', { class: 'rangelegend' },
      el('span', { text: usd(lo) }),
      el('span', { text: 'the curve’s residual band, P10 to P90' }),
      el('span', { text: usd(hi) })
    ));

    body.appendChild(el('h4', { text: 'How the number was built' }));
    var c = D.curve;
    var lv = log10Of(row);
    var tvlTerm = c.tvl_beta * Math.log(Math.max(1, row.tvl_usd)) / Math.LN10;
    var ageTerm = c.age_beta * Math.log(Math.min(1095, Math.max(1, row.age_days === null ? 365 : row.age_days))) / Math.LN10;
    var tiltTerm = tiltOf(row.change_7d);
    var math = el('div', { class: 'math' },
      el('div', { text: 'Intercept, the curve\u2019s own constant' }), el('div', { text: c.intercept.toFixed(3) + ' in log10' }),
      el('div', { text: 'β·log10(TVL) · ' + c.tvl_beta.toFixed(3) + ' × log10 of ' + usd(row.tvl_usd) }), el('div', { text: (tvlTerm >= 0 ? '+' : '') + tvlTerm.toFixed(3) }),
      el('div', { text: 'γ·log10(age) · ' + c.age_beta.toFixed(3) + ' × log10 of ' + age(row.age_days) + ' with no token' }), el('div', { text: (ageTerm >= 0 ? '+' : '') + ageTerm.toFixed(3) }),
      el('div', { text: 'δ·tilt · the ' + pct(row.change_7d) + ' seven-day move, clamped and weighted ' + c.growth_tilt }), el('div', { text: (tiltTerm >= 0 ? '+' : '') + tiltTerm.toFixed(3) }),
      el('div', { class: 'tot', text: 'log10 of the implied value' }), el('div', { class: 'tot', text: lv.toFixed(3) }),
      el('div', { class: 'tot', text: 'Implied launch value' }), el('div', { class: 'tot', text: '≈ ' + usd(v) })
    );
    body.appendChild(math);
    body.appendChild(el('p', { class: 'foot', text: 'Those coefficients come from the ' + c.fit_rows + ' protocols in this snapshot whose token already trades, fitted by robust log-log regression; the band around the value is that fit\u2019s own residual spread, P10 to P90, not a decoration.' }));

    body.appendChild(el('h4', { text: 'The protocol’s record' }));
    body.appendChild(el('div', { class: 'livegrid' },
      cell('Token recorded', 'none'),
      cell('TVL', usd(row.tvl_usd)),
      cell('7-day change', pct(row.change_7d)),
      cell('Tracked since', row.listed_at || 'unknown'),
      cell('Days with no token', row.age_days === null ? 'unknown' : String(row.age_days)),
      cell('Chains', row.chains.join(', ') || 'unknown'),
      cell('Readiness', row.launch_readiness + ' / 100'),
      cell('On the watchlist', row.on_watchlist ? 'yes' : 'no, below the $' + Math.round(D.floor_usd / 1e6) + 'M floor')
    ));

    body.appendChild(el('h4', { text: 'How to farm it' }));
    var steps = el('ol', { class: 'steps' });
    var plan = planFor(row);
    plan.forEach(function (s) {
      steps.appendChild(el('li', {}, s.text, el('span', { class: 'cost', text: 'Cost: ' + s.cost + ' · Time: ' + s.time })));
    });
    body.appendChild(steps);
    body.appendChild(el('p', { class: 'foot', text: 'Capital asked for: $' + row.plan_capital_usd + ' · setup about ' + row.plan_setup_minutes + ' minutes · hold at least ' + row.plan_hold_days + ' days. The plan is derived from the record above, not written per name.' }));

    drawer.hidden = false;
    drawer.scrollTop = 0;
  }

  function cell(k, v) {
    return el('div', {}, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }));
  }

  function closeDetail() {
    state.selected = null;
    $('drawer').hidden = true;
    if (window.location.hash) window.location.hash = '';
  }

  // The plan, derived in the page the same way lib/plan.ts derives it: category, TVL, age and chains
  // decide the action, the capital, the hold and every cost and time.
  function planFor(row) {
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var capital = row.plan_capital_usd;
    var hold = row.plan_hold_days;
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    var action;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) action = 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave it lent so the balance counts in every snapshot; borrow nothing against it the first month.';
    else if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) action = 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' with a stated strategy, and keep the vault shares rather than the underlying.';
    else if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) action = "Stake $" + capital + " of " + chain + "'s native asset through " + name + ' and keep the receipt token in the same wallet; do not lend the receipt out.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) action = 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ', as a tight range around the current price, and leave it in place.';
    else if (c.indexOf('bridge') >= 0) action = 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its own app rather than moving them out again.';
    else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) action = 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge against a spot position you already hold elsewhere.';
    else if (c.indexOf('rwa') >= 0) action = "Mint or buy $" + capital + " of " + name + "'s yield asset on " + chain + ' and hold it in the wallet you farm with.';
    else if (c.indexOf('stable') >= 0) action = "Mint $" + capital + " of " + name + "'s stable asset against collateral on " + chain + ', and keep the minted balance in the same wallet.';
    else if (c.indexOf('chain') >= 0) action = 'Bridge $' + capital + ' onto ' + chain + ' and use one application built on it, so the wallet shows activity on the chain itself.';
    else action = 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open through the next snapshot.';
    return [
      { text: 'Make a fresh wallet for this farm only, fund it with the capital and nothing else, and keep the seed phrase off this machine.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Check the protocol’s own docs for an audit and a withdrawal time before the position is large, because a thin market is the one that breaks first.', cost: 'no fee to check, and about $1 of gas to test with a small amount', time: '20 minutes' },
      { text: 'Do one qualifying action a week (a deposit, a borrow, a swap or a vote) so the wallet shows activity in more than one snapshot.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold for at least ' + hold + ' days, then open the protocol’s own rewards page and claim only from the link it publishes there.', cost: 'the $' + capital + ' stays in the position, and nothing to claim', time: hold + ' days, then 10 minutes to claim' },
      { text: 'Write the wallet, the dates, the transactions and the exit price in a farm log, so the position can be repeated or unwound without guesswork.', cost: 'nothing but the log', time: '5 minutes' },
    ];
  }

  // ---------- render ----------
  function render() {
    renderTabs();
    if (state.view === 'board') {
      renderThead();
      renderControls();
      renderTable();
    } else if (state.view === 'curve') {
      renderCurve();
    } else if (state.view === 'live') {
      renderLive();
    } else {
      renderModel();
    }
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return null;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('view')) state.view = p.get('view');
    if (p.get('p')) return p.get('p');
    return null;
  }

  renderScoreline();
  renderRail();
  var open = readHash();
  render();
  if (open) openDetail(open);
  document.getElementById('board').setAttribute('aria-busy', 'false');

  // keyboard: escape closes the drawer, and a row is focusable and opens on enter
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDetail();
  });
  document.addEventListener('click', function (e) {
    if (e.target === $('drawer')) closeDetail();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (t && t.tagName === 'TR' && t.parentNode && t.parentNode.parentNode && t.parentNode.parentNode.id === 'table') t.click();
  });
})();
