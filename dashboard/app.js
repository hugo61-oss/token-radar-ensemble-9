// Ensemble Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail view with the ensemble's five signals and the protocol's farm plan,
// a live-token comparison, and a model sandbox that re-ranks the board under
// weights the reader chooses. No network: every byte it shows is in data.js.
//
// The farm plan is re-derived here from the same figures main.ts used
// (category, chains, TVL, age, momentum, purity flag), so the page's plan and
// board.json's plan are the same derivation, not two copies of a list.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = {
    q: '', category: 'all', chain: 'all', minScore: 0,
    watchOnly: false, hideWrapped: false,
    tab: 'board', sort: 'rank', dir: 1, selected: null, detailOnly: false,
    weights: { size: DATA.weights.size, momentum: DATA.weights.momentum, longevity: DATA.weights.longevity, breadth: DATA.weights.breadth, heat: DATA.weights.heat },
  };
  var SHIPPED = DATA.weights;

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var parts = h.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) { state.selected = v; state.detailOnly = true; }
      if (k === 'filter' && v) state.category = v;
      if (k === 'tab' && (v === 'live' || v === 'method')) state.tab = v;
    }
  }
  parseHash();

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The ensemble, in the page, from the row's own signals: the same arithmetic
  // main.ts ran, so a sandbox weight change re-ranks the board live.
  function rescore(row, w) {
    var s = row.signals;
    var score = (w.size * s.size + w.momentum * s.momentum + w.longevity * s.longevity + w.breadth * s.breadth + w.heat * s.heat) * s.purity;
    var multiple = 0.04 + 0.56 * Math.pow(score, 1.5);
    return { score: score, implied: Math.max(1, Math.round(row.tvl_usd * multiple)) };
  }
  function weightsChanged() {
    return ['size', 'momentum', 'longevity', 'breadth', 'heat'].some(function (k) { return Math.abs(state.weights[k] - SHIPPED[k]) > 0.001; });
  }

  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  var DERIVED = { Bridge: 1, 'Canonical Bridge': 1, 'Liquid Staking': 1, 'Liquid Restaking': 1, 'Restaked BTC': 1, CEX: 1 };
  function purityFlag(row) {
    if (WRAPPED_WORD.test(row.name) || VERSIONED.test(row.name) || EXCHANGE_PREFIX.test(row.name)) return 'wrapped, staked or exchange product';
    if (row.category && DERIVED[row.category]) return 'a ' + row.category + ' product of a token that already trades';
    return null;
  }
  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function momentumLine(row) {
    var g = row.change_7d;
    if (g === null || g === undefined) return 'No seven-day TVL change is reported, so farm on the position\'s own merits and re-check the move next week.';
    if (g >= 10) return 'TVL rose ' + g.toFixed(1) + '% in seven days, so the crowd is arriving now: start this week, while the move is fresh.';
    if (g >= 0) return 'TVL rose ' + g.toFixed(1) + '% in seven days, a steady climb rather than a spike: farm at a normal pace.';
    if (g >= -10) return 'TVL fell ' + Math.abs(g).toFixed(1) + '% in seven days, a soft week: farm small now and add if the move turns.';
    return 'TVL fell ' + Math.abs(g).toFixed(1) + '% in seven days, a sharp pullback: farm the minimum first and only add once it steadies.';
  }
  // The farm plan, derived from the row's own figures — the same seven steps
  // board.json carries for this protocol.
  function farmSteps(row) {
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var flag = purityFlag(row);
    var score = rescore(row, state.weights).score;
    function step(text, cost, time) { return { text: text, cost: cost, time: time }; }
    return [
      step('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      step(actionFor(row, capital, chain), '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'),
      step(momentumLine(row), 'nothing to read, the position already costs what step 2 says', '5 minutes to check'),
      step('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and vary it so the activity reads as real use.', 'about $2 of gas a week', '10 minutes a week'),
      step('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'),
      step(flag === null ? 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.' : 'This one is flagged as ' + flag + ', so check first whether a token already trades elsewhere before you farm it as a launch.', 'no fee to check, and never pay to claim', '10 minutes'),
      step('Write the wallet, the dates, every transaction and the ensemble score (' + score.toFixed(2) + ') in a farm log, then unwind in reverse: withdraw, bridge back, close the log.', 'nothing but the log', '5 minutes to log, 15 minutes to unwind'),
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function sigBars(s) {
    var keys = [['size', 's-size'], ['momentum', 's-mom'], ['longevity', 's-long'], ['breadth', 's-breadth'], ['heat', 's-heat']];
    var wrap = el('span', { class: 'sigbars', title: 'Signals: size ' + s.size + ', momentum ' + s.momentum + ', longevity ' + s.longevity + ', breadth ' + s.breadth + ', heat ' + s.heat + ', purity x' + s.purity });
    keys.forEach(function (pair) {
      var v = s[pair[0]];
      var bar = el('i', { class: pair[1] + (v < 0.25 ? ' low' : '') });
      bar.style.height = Math.max(3, Math.round(v * 18)) + 'px';
      wrap.appendChild(bar);
    });
    return wrap;
  }

  function filteredRows() {
    var rows = DATA.rows.map(function (r) {
      var rc = rescore(r, state.weights);
      return { row: r, score: rc.score, implied: rc.implied };
    });
    if (weightsChanged()) {
      rows.sort(function (a, b) { return b.implied - a.implied || b.score - a.score; });
      rows.forEach(function (x, i) { x.rankShown = i + 1; });
    } else {
      rows.forEach(function (x) { x.rankShown = x.row.rank; });
    }
    var q = state.q.trim().toLowerCase();
    rows = rows.filter(function (x) {
      var r = x.row;
      if (state.watchOnly && !r.watchlist) return false;
      if (state.hideWrapped && r.signals.purity < 1) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (x.score < state.minScore) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rankShown; bv = b.rankShown; }
      else if (key === 'implied') { av = a.implied; bv = b.implied; }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -999 : a.row.change_7d; bv = b.row.change_7d === null ? -999 : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? -1 : a.row.age_days; bv = b.row.age_days === null ? -1 : b.row.age_days; }
      else { av = a.score; bv = b.score; }
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
    return rows;
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('button', {
      text: label + arrow,
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
        render();
      },
    });
  }

  function renderBoard() {
    var wrap = el('section');
    var ctrls = el('div', { class: 'panel controls' });
    var q = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function () { state.q = q.value; render(); });
    ctrls.appendChild(el('label', null, 'Search', q));
    var cats = ['all'].concat(DATA.categories.map(function (c) { return c.name; }));
    var catSel = el('select', { 'aria-label': 'Category' });
    cats.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All categories' : c });
      if (state.category === c) o.selected = true;
      catSel.appendChild(o);
    });
    catSel.addEventListener('change', function () { state.category = catSel.value; render(); });
    ctrls.appendChild(el('label', null, 'Category', catSel));
    var chainSet = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { chainSet[c] = 1; }); });
    var chains = ['all'].concat(Object.keys(chainSet).sort());
    var chainSel = el('select', { 'aria-label': 'Chain' });
    chains.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All chains' : c });
      if (state.chain === c) o.selected = true;
      chainSel.appendChild(o);
    });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); });
    ctrls.appendChild(el('label', null, 'Chain', chainSel));
    var minScore = el('input', { type: 'range', min: '0', max: '0.8', step: '0.05', value: String(state.minScore), 'aria-label': 'Minimum ensemble score' });
    minScore.addEventListener('input', function () { state.minScore = parseFloat(minScore.value); render(); });
    ctrls.appendChild(el('label', null, 'Min score ' + state.minScore.toFixed(2), minScore));
    var wOnly = el('input', { type: 'checkbox' });
    wOnly.checked = state.watchOnly;
    wOnly.addEventListener('change', function () { state.watchOnly = wOnly.checked; render(); });
    ctrls.appendChild(el('label', { class: 'check' }, wOnly, 'Watchlist only'));
    var hideW = el('input', { type: 'checkbox' });
    hideW.checked = state.hideWrapped;
    hideW.addEventListener('change', function () { state.hideWrapped = hideW.checked; render(); });
    ctrls.appendChild(el('label', { class: 'check' }, hideW, 'Hide wrapped / staked products'));
    wrap.appendChild(ctrls);

    var rows = filteredRows();
    wrap.appendChild(el('p', { class: 'count-line', text: rows.length + ' of ' + DATA.rows.length + ' pre-token protocols shown' + (weightsChanged() ? ' — sandbox weights active, ranks re-derived live' : '') + '. Click a row for its signals and farm plan.' }));

    var table = el('table', { class: 'board' });
    var head = el('tr');
    [['Rank', 'rank'], ['Protocol', null], ['Signals', null], ['Score', 'score'], ['TVL', 'tvl'], ['7d', 'growth'], ['Age', 'age'], ['Implied value', 'implied']].forEach(function (col) {
      var th = el('th', { class: col[0] === 'Score' || col[0] === 'TVL' || col[0] === '7d' || col[0] === 'Age' || col[0] === 'Implied value' ? 'num' : '' });
      if (col[1]) th.appendChild(sortButton(col[0], col[1]));
      else th.textContent = col[0];
      head.appendChild(th);
    });
    table.appendChild(el('thead', null, head));
    var body = el('tbody');
    rows.slice(0, 120).forEach(function (x) {
      var r = x.row;
      var tr = el('tr', { class: state.selected === r.slug ? 'sel' : '', onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(); } });
      tr.appendChild(el('td', { class: 'num mono', text: '#' + x.rankShown }));
      var nameCell = el('td');
      nameCell.appendChild(el('span', { class: 'name', text: r.name }));
      nameCell.appendChild(document.createTextNode(' '));
      if (r.watchlist) nameCell.appendChild(el('span', { class: 'tag watch', text: 'watchlist' }));
      var flag = purityFlag(r);
      if (flag) nameCell.appendChild(el('span', { class: 'tag flag', text: 'wrapped / derived' }));
      nameCell.appendChild(el('div', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.slice(0, 3).join(', ') || 'no chain listed') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }));
      tr.appendChild(nameCell);
      var sigCell = el('td');
      sigCell.appendChild(sigBars(r.signals));
      tr.appendChild(sigCell);
      tr.appendChild(el('td', { class: 'num mono score-num', text: x.score.toFixed(2) }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtUsd(r.tvl_usd) }));
      var g = el('td', { class: 'num mono ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'gain' : 'loss'), text: fmtPct(r.change_7d) });
      tr.appendChild(g);
      tr.appendChild(el('td', { class: 'num mono', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtUsd(x.implied) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    if (rows.length > 120) wrap.appendChild(el('p', { class: 'count-line', text: 'Showing the first 120 of ' + rows.length + ' matches — narrow the filters to see the rest.' }));
    wrap.appendChild(el('div', { class: 'legend' },
      el('span', { html: '<i style="background:#f5b942"></i>size' }),
      el('span', { html: '<i style="background:#3fce8f"></i>momentum' }),
      el('span', { html: '<i style="background:#a78bfa"></i>longevity' }),
      el('span', { html: '<i style="background:#39c2d7"></i>breadth' }),
      el('span', { html: '<i style="background:#f2707a"></i>category heat' }),
      el('span', { text: 'Bars are the five signals, 0 to 1. The score is their weighted sum times purity.' })));
    var ex = el('details', { class: 'panel' });
    ex.appendChild(el('summary', { text: 'Set aside: ' + DATA.excluded_size + ' wrapped, staked or bridge products (not launches — their token already trades)' }));
    DATA.excluded.slice(0, 30).forEach(function (x) {
      ex.appendChild(el('p', { class: 'small', text: x.name + ' — ' + x.flag + ' · TVL ' + fmtUsd(x.tvl_usd) + ' · ensemble score ' + x.score.toFixed(2) + ' (purity-weighted).' }));
    });
    if (DATA.excluded.length > 30) ex.appendChild(el('p', { class: 'small muted', text: 'Showing the 30 largest of ' + DATA.excluded.length + ' set aside.' }));
    wrap.appendChild(ex);
    if (state.selected) wrap.appendChild(renderDetail(state.selected));
    return wrap;
  }

  function renderDetail(slug) {
    var found = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!found) return el('p', { class: 'muted', text: 'No protocol with that slug on this board.' });
    var rc = rescore(found, state.weights);
    var s = found.signals;
    var flag = purityFlag(found);
    var panel = el('section', { class: 'panel detail', id: 'detail' });
    panel.appendChild(el('h2', { text: '#' + found.rank + ' · ' + found.name }));
    panel.appendChild(el('p', { class: 'muted small', text: (found.category || 'Uncategorised') + ' · ' + (found.chains.join(', ') || 'no chain listed') + ' · TVL ' + fmtUsd(found.tvl_usd) + ' · 7d ' + fmtPct(found.change_7d) + ' · listed ' + (found.age_days === null ? 'date unknown' : fmtAge(found.age_days) + ' ago') }));
    if (flag) panel.appendChild(el('p', null, el('span', { class: 'tag flag', text: 'Flagged: ' + flag })));
    if (found.watchlist) panel.appendChild(el('p', null, el('span', { class: 'tag watch', text: 'On the snapshot watchlist' })));
    var grid = el('div', { class: 'grid' });
    var left = el('div');
    left.appendChild(el('h3', { text: 'Ensemble signals' }));
    [['Size — log TVL', s.size, 's-size'], ['Momentum — 7d change', s.momentum, 's-mom'], ['Longevity — days listed', s.longevity, 's-long'], ['Breadth — chains', s.breadth, 's-breadth'], ['Category heat', s.heat, 's-heat']].forEach(function (row) {
      var line = el('div', { class: 'sigrow' });
      line.appendChild(el('span', { text: row[0] }));
      var bar = el('span', { class: 'bar' });
      var fill = el('i', { class: row[2] });
      fill.style.width = Math.round(row[1] * 100) + '%';
      bar.appendChild(fill);
      line.appendChild(bar);
      line.appendChild(el('span', { class: 'mono', text: row[1].toFixed(2) }));
      left.appendChild(line);
    });
    left.appendChild(el('p', { class: 'small', text: 'Purity ×' + s.purity.toFixed(2) + ' · ensemble score ' + rc.score.toFixed(2) + ' · multiple ' + (0.04 + 0.56 * Math.pow(rc.score, 1.5)).toFixed(2) + '× TVL · implied value ' + fmtUsd(rc.implied) + '.' }));
    left.appendChild(el('p', { class: 'small muted', text: 'Implied value is this entry\u2019s own claim from the snapshot\u2019s figures, never a promise a token launches or what it will trade at. The protocol records no token; that is not proof it has none.' }));
    var comps = DATA.live.filter(function (l) { return l.category === found.category; }).slice(0, 3);
    if (comps.length) {
      left.appendChild(el('h3', { text: 'Live-token neighbours in ' + (found.category || 'this category') }));
      comps.forEach(function (l) {
        left.appendChild(el('p', { class: 'small', text: l.name + ' — market cap ' + fmtUsd(l.mcap_usd) + ' on TVL ' + fmtUsd(l.tvl_usd) + ' (' + (l.mcap_usd && l.tvl_usd ? (l.mcap_usd / l.tvl_usd).toFixed(2) + '× TVL' : 'no ratio') + ').' }));
      });
    }
    grid.appendChild(left);
    var right = el('div');
    right.appendChild(el('h3', { text: 'Farm plan — 7 steps' }));
    var ol = el('ol', { class: 'farm' });
    farmSteps(found).forEach(function (st) {
      var li = el('li');
      li.appendChild(document.createTextNode(st.text + ' '));
      li.appendChild(el('span', { class: 'cost', text: 'Cost: ' + st.cost + ' Time: ' + st.time + '.' }));
      ol.appendChild(li);
    });
    right.appendChild(ol);
    grid.appendChild(right);
    panel.appendChild(grid);
    return panel;
  }

  function renderLive() {
    var wrap = el('section', { class: 'panel' });
    wrap.appendChild(el('h2', { text: 'Live tokens — already trading, kept apart' }));
    wrap.appendChild(el('p', { class: 'muted', text: 'These protocols already have a token, so the board never ranks them by implied value. They are here so a reader can compare: what multiple does the market actually pay for a live protocol in each category?' }));
    var table = el('table', { class: 'board' });
    table.appendChild(el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }),
      el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }))));
    var body = el('tbody');
    DATA.live.forEach(function (l) {
      var tr = el('tr');
      tr.appendChild(el('td', null, el('span', { class: 'name', text: l.name }), ' ', el('span', { class: 'tag live', text: 'live' })));
      tr.appendChild(el('td', { text: l.category || 'Uncategorised' }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtUsd(l.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtUsd(l.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: l.mcap_usd && l.tvl_usd ? (l.mcap_usd / l.tvl_usd).toFixed(2) + '×' : 'n/a' }));
      tr.appendChild(el('td', { class: 'num mono ' + (l.change_7d === null ? '' : l.change_7d >= 0 ? 'gain' : 'loss'), text: fmtPct(l.change_7d) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function renderMethod() {
    var wrap = el('section');
    var p1 = el('div', { class: 'panel' });
    p1.appendChild(el('h2', { text: 'How the ensemble ranks' }));
    p1.appendChild(el('p', { text: 'Five signals, each 0 to 1, all from the sealed snapshot\u2019s own figures. No protocol name is special-cased anywhere: the same arithmetic scores every row.' }));
    p1.appendChild(el('div', { class: 'formula', html: 'score = (0.28 × size + 0.22 × momentum + 0.15 × longevity + 0.10 × breadth + 0.25 × category heat) × purity<br>multiple = 0.04 + 0.56 × score<sup>1.5</sup> &nbsp;·&nbsp; implied value = TVL × multiple' }));
    p1.appendChild(el('p', { class: 'small muted', text: 'Size is log TVL between the $5M floor and the largest TVL. Momentum is the 7-day TVL change clamped to −50%…+100%. Longevity saturates with days listed (1 − e^(−age/540)). Breadth saturates with chain count. Category heat blends the category\u2019s median 7-day momentum among pre-token peers with its share of pre-token TVL. Purity is 1, or 0.70 for a bridge / liquid-staking product, or 0.45 for a wrapped, staked or exchange product — and a protocol the purity flag names is set aside from the board entirely, scored and listed below it, because its token already trades elsewhere.' }));
    wrap.appendChild(p1);
    var p2 = el('div', { class: 'panel sandbox' });
    p2.appendChild(el('h2', { text: 'Model sandbox — re-rank the board yourself' }));
    p2.appendChild(el('p', { class: 'small muted', text: 'Move a weight and the board re-ranks live from the same signals. The shipped weights are the ones board.json was built with.' }));
    ['size', 'momentum', 'longevity', 'breadth', 'heat'].forEach(function (k) {
      var lab = el('label');
      lab.appendChild(el('span', { text: k.charAt(0).toUpperCase() + k.slice(1) }));
      var range = el('input', { type: 'range', min: '0', max: '0.6', step: '0.01', value: String(state.weights[k]), 'aria-label': k + ' weight' });
      range.addEventListener('input', function () {
        state.weights[k] = parseFloat(range.value);
        state.tab = 'board';
        render();
      });
      lab.appendChild(range);
      lab.appendChild(el('span', { class: 'mono', text: state.weights[k].toFixed(2) }));
      p2.appendChild(lab);
    });
    if (weightsChanged()) {
      p2.appendChild(el('p', { class: 'note', text: 'Sandbox weights active — the board above is re-ranked under your weights, not the shipped ones.' }));
      var reset = el('button', { text: 'Reset to shipped weights', onclick: function () { state.weights = { size: SHIPPED.size, momentum: SHIPPED.momentum, longevity: SHIPPED.longevity, breadth: SHIPPED.breadth, heat: SHIPPED.heat }; render(); } });
      p2.appendChild(reset);
    }
    wrap.appendChild(p2);
    var p3 = el('div', { class: 'panel' });
    p3.appendChild(el('h2', { text: 'Hottest categories in this snapshot' }));
    DATA.categories.slice(0, 8).forEach(function (c) {
      p3.appendChild(el('p', { class: 'small', text: c.name + ' — heat ' + c.heat.toFixed(2) + ' · ' + c.count + ' pre-token protocols on the board.' }));
    });
    wrap.appendChild(p3);
    return wrap;
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var hero = el('header', { class: 'hero' });
    hero.appendChild(el('div', { class: 'kicker', text: 'Ensemble Radar · multi-signal · model ensemble-9' }));
    hero.appendChild(el('h1', { text: 'Which pre-token protocol is worth farming next?' }));
    hero.appendChild(el('p', { class: 'lede', text: 'A radar over ' + DATA.board_size + ' pre-token protocols, ranked by an implied value built from five signals — size, momentum, longevity, breadth and category heat — times a purity check. Every row carries a seven-step farm plan with what it costs and how long it takes. ' + DATA.excluded_size + ' wrapped, staked or bridge products are scored, flagged and set aside below the board — they record no token, but their token already trades elsewhere. Snapshot as of ' + esc(DATA.as_of) + '; the watchlist (' + DATA.watchlist_size + ' protocols at or above ' + fmtUsd(DATA.floor_usd) + ' TVL with no token recorded) is the floor, never the ceiling.' }));
    var stats = el('div', { class: 'stats' });
    [['Protocols ranked', String(DATA.board_size)], ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size], ['Top implied value', fmtUsd(DATA.rows[0].implied_value_usd)], ['Live tokens compared', String(DATA.live_size)]].forEach(function (s) {
      var d = el('div', { class: 'stat' });
      d.appendChild(el('b', { text: s[1] }));
      d.appendChild(el('span', { text: s[0] }));
      stats.appendChild(d);
    });
    hero.appendChild(stats);
    app.appendChild(hero);

    var tabs = el('div', { class: 'tabs' });
    [['board', 'Board'], ['live', 'Live tokens'], ['method', 'Method & sandbox']].forEach(function (t) {
      tabs.appendChild(el('button', {
        text: t[1], 'aria-pressed': state.tab === t[0] ? 'true' : 'false',
        onclick: function () { state.tab = t[0]; render(); },
      }));
    });
    app.appendChild(tabs);
    if (state.detailOnly && state.selected) {
      app.appendChild(renderDetail(state.selected));
      var footD = el('footer');
      footD.appendChild(el('p', { text: 'Detail view for ' + state.selected + ' — the board tab lists all ' + DATA.board_size + ' ranked protocols. Source: ' + DATA.source + '.' }));
      app.appendChild(footD);
      return;
    }
    if (state.tab === 'board') app.appendChild(renderBoard());
    else if (state.tab === 'live') app.appendChild(renderLive());
    else app.appendChild(renderMethod());
    var foot = el('footer');
    foot.appendChild(el('p', { text: 'Source: ' + DATA.source + '. “Records no token” means DefiLlama records none — never proof a protocol has none. Implied values are this radar\u2019s own claims, not prices, and nothing here is financial advice. Built by an AI agent for make.fun\u2019s token launch radar bounty; the agent worked with an uncensored model via superbot.gg.' }));
    app.appendChild(foot);
  }

  window.addEventListener('hashchange', function () { parseHash(); render(); });
  render();
})();
