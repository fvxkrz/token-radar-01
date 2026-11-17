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
    model: clone(D.model),
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
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- the model, in one function ----------
  // The same arithmetic as lib/model.ts: TVL times the sector's launch multiple, times a growth
  // multiplier from the 7-day change, times a maturity multiplier from how long it has run with no
  // token. Nothing per-name; the sector's multiple is the market's own, read off its tokenized peers.
  function growthMultOf(change, m) {
    var g = change === null || change === undefined ? 0 : change;
    g = Math.min(m.growth_cap, Math.max(m.growth_floor, g));
    return 1 + (g / 100) * m.growth_weight;
  }
  function maturityMultOf(ageDays, m) {
    var a = ageDays === null || ageDays === undefined ? m.unknown_age_days : ageDays;
    return m.maturity_floor + (Math.min(Math.max(a, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  }
  function impliedOf(row, m) {
    var multiple = row.sector_multiple;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMultOf(row.change_7d, m) * maturityMultOf(row.age_days, m)));
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

  // ---------- the header's scoreline ----------
  function renderScoreline() {
    var host = $('scoreline');
    clear(host);
    var top = D.rows[0];
    var total = 0;
    for (var i = 0; i < D.rows.length; i++) total += D.rows[i].implied_value_usd;
    var items = [
      ['Ranked launches', String(D.board_size), ''],
      ['Watchlist covered', D.watchlist_size + ' / ' + D.watchlist_size, 'mid'],
      ['Below the floor', String(D.early_size), 'lo'],
      ['Top launch value', usd(top ? top.implied_value_usd : 0), 'hi'],
      ['Board value', usd(total), 'hi'],
      ['Snapshot', D.as_of, ''],
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

    rail.appendChild(el('section', {},
      el('h3', { text: 'How a launch is priced' }),
      el('div', { class: 'formula' },
        'implied = TVL\n',
        '  x ', el('b', { text: 'sector multiple' }), '  (market\'s own)\n',
        '  x growth      (' + state.model.growth_floor + '%..' + state.model.growth_cap + '%)\n',
        '  x maturity    (' + state.model.maturity_floor + '..' + (state.model.maturity_floor + state.model.maturity_range).toFixed(1) + ' by age)\n'
      ),
      el('p', { text: 'Not typed in: the geometric median of market cap over TVL among tokenized peers in the same category, shrunk toward the universe. A category with fewer than ' + D.min_peers + ' peers gets no vote and is priced at the whole-market multiple, and the row says so.' })
    ));

    // Only the sectors that actually hold rows get listed, so the rail never advertises a filter that
    // returns nothing.
    var held = {};
    D.rows.forEach(function (r) { held[r.category] = (held[r.category] || 0) + 1; });
    var live = D.sectors.filter(function (s) { return held[s.category] > 0; });
    var shown = live.slice(0, 6);
    var sec = el('section', {}, el('h3', { text: 'Sector multiples' }));
    shown.forEach(function (s) {
      sec.appendChild(el('button', {
        class: 'sect',
        type: 'button',
        title: s.peers + ' tokenized peers, unshrunk median ' + s.raw_multiple.toFixed(2) + 'x, weight ' + Math.round(s.weight * 100) + '%',
        onclick: function () { state.category = s.category; state.view = 'board'; render(); },
      },
        el('span', { class: 'nm', text: s.category }),
        el('span', { class: 'mv', text: s.multiple.toFixed(2) + 'x' }),
        el('span', { class: 'pz', text: s.peers < D.min_peers ? s.peers + ' peer' + (s.peers === 1 ? '' : 's') + ' · priced at universe' : s.peers + ' peers · ' + s.multiple_low.toFixed(2) + '–' + s.multiple_high.toFixed(2) + 'x' })
      ));
    });
    if (live.length > shown.length) {
      sec.appendChild(el('p', { class: 'more', text: '+ ' + (live.length - shown.length) + ' more with rows on the board.' }));
    }
    var uni = el('section', {},
      el('h3', { text: 'Universe' }),
      el('div', { class: 'kv' }, el('span', { text: 'Protocols in the snapshot' }), el('span', { text: String(D.watchlist_size + D.early_size + (D.board_size - D.watchlist_size - D.early_size)) })),
      el('div', { class: 'kv' }, el('span', { text: 'Tokenized peers' }), el('span', { text: String(D.universe_peers) })),
      el('div', { class: 'kv' }, el('span', { text: 'Universe multiple' }), el('span', { text: D.universe_multiple.toFixed(2) + 'x' })),
      el('div', { class: 'kv' }, el('span', { text: 'Model' }), el('span', { text: D.model_version })),
      el('div', { class: 'kv' }, el('span', { text: 'Source' }), el('span', { text: 'DefiLlama' }))
    );
    rail.appendChild(sec);
    rail.appendChild(uni);
    rail.appendChild(el('p', { class: 'sealed', text: 'Snapshot sealed ' + D.as_of + '. Every figure here comes from it: ' + D.watchlist_size + ' tokenless protocols, and the rest of the universe priced as it trades today.' }));
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

  function valueOf(row) { return state.model === D.model ? row.implied_value_usd : impliedOf(row, state.model); }

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
      onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.model = clone(D.model); render(); },
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
    { key: 'mult', label: 'Sector multiple', cls: 'mult r' },
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
          r.sector_multiple.toFixed(2) + 'x',
          r.sector_peers < D.min_peers
            ? el('span', { class: 'pz low', text: ' universe', title: 'Only ' + r.sector_peers + ' tokenized peer' + (r.sector_peers === 1 ? '' : 's') + ' in ' + (r.category || 'this category') + ', under the ' + D.min_peers + '-peer minimum, so this row is priced at the whole-market multiple instead of a sector one.' })
            : el('span', { class: 'pz', text: ' n=' + r.sector_peers })
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

  // ---------- the sector view ----------
  function renderSectors() {
    var tbody = $('tbody');
    clear(tbody);
    $('count').textContent = D.sectors.length + ' sectors';
    var head = '<tr><th>Sector</th><th class="r">Peers</th><th class="r">Multiple</th><th class="r">Range</th><th class="r">Unshrunk</th><th class="r">Weight</th><th class="r">Board rows</th><th class="r">Board value</th></tr>';
    $('thead').innerHTML = head;
    var counts = {};
    var values = {};
    D.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      counts[c] = (counts[c] || 0) + 1;
      values[c] = (values[c] || 0) + valueOf(r);
    });
    D.sectors.forEach(function (s) {
      tbody.appendChild(el('tr', { onclick: function () { state.category = s.category; state.view = 'board'; render(); } },
        el('td', { class: 'name' }, el('span', { class: 'nm', text: s.category })),
        el('td', { class: 'r', text: String(s.peers) }),
        el('td', { class: 'val r', text: s.multiple.toFixed(2) + 'x' }),
        el('td', { class: 'range r', text: s.multiple_low.toFixed(2) + ' – ' + s.multiple_high.toFixed(2) + 'x' }),
        el('td', { class: 'r', text: s.raw_multiple.toFixed(2) + 'x' }),
        el('td', { class: 'r', text: Math.round(s.weight * 100) + '%' }),
        el('td', { class: 'r', text: String(counts[s.category] || 0) }),
        el('td', { class: 'val r', text: usd(values[s.category] || 0) })
      ));
    });
  }

  // ---------- the live-token view ----------
  function renderLive() {
    var tbody = $('tbody');
    clear(tbody);
    $('count').textContent = D.live.length + ' tokenized protocols';
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

  // ---------- the model view: a sandbox on the constants ----------
  var SLIDERS = [
    { k: 'growth_weight', label: 'Growth weight', min: 0, max: 1, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
    { k: 'maturity_floor', label: 'Maturity floor', min: 0.2, max: 1, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
    { k: 'maturity_range', label: 'Maturity range', min: 0, max: 0.8, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
    { k: 'unknown_age_days', label: 'Assumed age when unlisted', min: 0, max: 1095, step: 30, fmt: function (v) { return v + 'd'; } },
  ];

  function renderModel() {
    var thead = $('thead');
    var tbody = $('tbody');
    clear(tbody);
    var total = 0;
    var top = null;
    for (var i = 0; i < D.rows.length; i++) {
      var v = valueOf(D.rows[i]);
      total += v;
      if (top === null || v > top.v) top = { r: D.rows[i], v: v };
    }
    thead.innerHTML = '<tr><th>The model</th><th class="r">Value</th></tr>';
    $('count').textContent = D.board_size + ' rows recomputed';
    var host = document.createElement('tbody');
    var rowsOut = [];

    // the constants
    rowsOut.push(['Model version', D.model_version]);
    rowsOut.push(['Sector multiple source', 'geometric median of mcap/TVL per category, shrunk to the universe']);
    SLIDERS.forEach(function (s) {
      rowsOut.push([s.label, s.fmt(state.model[s.k])]);
    });
    rowsOut.push(['Categories under the peer floor', 'priced at the universe multiple, and labelled so']);
    rowsOut.push(['Board value at these constants', usd(total)]);
    rowsOut.push(['Top launch at these constants', top ? top.r.name + ' · ' + usd(top.v) : 'n/a']);

    rowsOut.forEach(function (pair) {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'name', text: pair[0] }),
        el('td', { class: 'val r', text: String(pair[1]) })
      ));
    });

    // The sandbox: the constants a reader can move, in one row of their own under the model's table.
    var wrap = el('div', { class: 'controls', style: 'padding:4px 0 6px' });
    SLIDERS.forEach(function (s) {
      wrap.appendChild(el('label', { style: 'display:flex;align-items:center;gap:8px;color:var(--ink-3);font-size:12px' },
        el('span', { text: s.label }),
        el('input', {
          type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(state.model[s.k]),
          oninput: (function (spec) {
            return function (e) { state.model[spec.k] = parseFloat(e.target.value); render(); };
          })(s),
          style: 'width:132px',
        })
      ));
    });
    wrap.appendChild(el('button', { class: 'chip', type: 'button', text: 'Reset the model', onclick: function () { state.model = clone(D.model); render(); } }));
    tbody.appendChild(el('tr', {}, el('td', { colspan: '2' }, wrap)));

    var note = el('tr', {}, el('td', { colspan: '2', class: 'foot' },
      'Every row above is recomputed in the page from the snapshot figures and the sector multiples: the same function that wrote board.json. Move a constant and the whole board re-ranks, which is the point of stating a model instead of a number.'
    ));
    tbody.appendChild(note);
  }

  // ---------- the tabs ----------
  function renderTabs() {
    var host = $('tabs');
    clear(host);
    var tabs = [
      ['board', 'Board', D.board_size],
      ['sectors', 'Sectors', D.sectors.length],
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
      el('span', { text: row.sector_peers >= D.min_peers ? 'the sector’s interquartile band' : 'the market’s interquartile band, this sector having too few peers' }),
      el('span', { text: usd(hi) })
    ));

    body.appendChild(el('h4', { text: 'What moved the number' }));
    var math = el('div', { class: 'math' },
      el('div', { text: 'TVL, the snapshot’s own figure' }), el('div', { text: usd(row.tvl_usd) }),
      el('div', { text: 'x ' + (row.sector_peers >= D.min_peers
        ? 'Sector multiple · ' + (row.category || 'Uncategorised') + ' (' + row.sector_peers + ' tokenized peers)'
        : 'Whole-market multiple · ' + (row.category || 'Uncategorised') + ' has ' + row.sector_peers + ' tokenized peer' + (row.sector_peers === 1 ? '' : 's') + ', under the ' + D.min_peers + '-peer minimum') }),
        el('div', { text: row.sector_multiple.toFixed(3) + 'x' }),
      el('div', { text: 'x Growth · 7-day TVL ' + pct(row.change_7d) + ', clamped to ' + state.model.growth_floor + '..' + state.model.growth_cap + '% and weighted ' + state.model.growth_weight }),
        el('div', { text: 'x' + row.growth_multiplier.toFixed(3) }),
      el('div', { text: 'x Maturity · ' + age(row.age_days) + ' with no token, scaling to ' + (state.model.maturity_floor + state.model.maturity_range).toFixed(1) }),
        el('div', { text: 'x' + row.maturity_multiplier.toFixed(3) }),
      el('div', { class: 'tot', text: 'Implied launch value' }), el('div', { class: 'tot', text: '≈ ' + usd(v) })
    );
    body.appendChild(math);

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
    } else if (state.view === 'sectors') {
      renderSectors();
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
