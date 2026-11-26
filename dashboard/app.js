// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the board, the filters, the live-token view, the
// model sandbox and one detail page per protocol. No network: every byte
// it shows is in data.js, and the farm plan is the same derivation
// board.json carries, regenerated here from the row's own record.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = {
    view: 'board', q: '', category: 'all', chain: 'all',
    minTvl: 0, minImplied: 0, watchlistOnly: false, earlyOnly: false,
    sort: 'implied', dir: -1, selected: null,
    sbBase: null, sbGrowth: null,
  };
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
  function fmtDate(iso) {
    if (!iso) return 'unknown';
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? 'unknown' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // The model, as the page runs it: the same four factors board.json
  // carries, so the sandbox re-ranks on identical arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_per_chain * Math.min((row.chains || []).length, model.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth));
  }
  function sandboxModel() {
    if (state.sbBase === null && state.sbGrowth === null) return null;
    var m = Object.assign({}, DATA.model);
    if (state.sbBase !== null) m.base_multiple = state.sbBase;
    if (state.sbGrowth !== null) m.growth_weight = state.sbGrowth;
    return m;
  }
  function valueOf(row) {
    var m = sandboxModel();
    return m ? impliedOf(row, m) : row.implied_value_usd;
  }

  // --- Farm plan: the same derivation as lib/model.ts, in the page. ---
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the supply open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and hold the position.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep it staked.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's native asset through " + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one small position in an active market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Allocate $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Keep the position and check the protocol's own page before you move it.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action every week, such as a deposit, a swap, a borrow or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days, so the activity lands in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ];
    if (p.chains && p.chains.length >= 2) {
      steps.splice(3, 0, {
        text: 'Repeat a smaller position on ' + p.chains[1] + ', the protocol\'s second chain, so the activity shows on two networks.',
        cost: '$' + Math.round(capital / 2) + ' of capital and about $3 of gas', time: '20 minutes',
      });
    }
    return steps.map(stepText);
  }

  // --- Small DOM helper: text only, never raw HTML from data. ---
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- Hash routing: #board | #live | #model | #/protocol/<slug> | #k=v&k=v ---
  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw || raw === 'board') { state.view = 'board'; state.selected = null; return; }
    if (raw === 'live') { state.view = 'live'; state.selected = null; return; }
    if (raw === 'model') { state.view = 'model'; state.selected = null; return; }
    if (raw.indexOf('/protocol/') === 0) {
      state.view = 'detail'; state.selected = decodeURIComponent(raw.slice(10)); return;
    }
    var params = new URLSearchParams(raw);
    state.view = 'board'; state.selected = null;
    if (params.get('q') !== null) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = parseInt(params.get('minTvl'), 10) || 0;
    if (params.get('minImplied')) state.minImplied = parseInt(params.get('minImplied'), 10) || 0;
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('early') === '1') state.earlyOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    if (state.view === 'detail' && state.selected) {
      window.history.replaceState(null, '', '#/protocol/' + encodeURIComponent(state.selected));
      return;
    }
    var params = new URLSearchParams();
    if (state.view === 'live') { window.history.replaceState(null, '', '#live'); return; }
    if (state.view === 'model') { window.history.replaceState(null, '', '#model'); return; }
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.minImplied) params.set('minImplied', String(state.minImplied));
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.earlyOnly) params.set('early', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : '#board');
  }

  // --- Filtering and sorting. ---
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (valueOf(r) < state.minImplied) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.earlyOnly && r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = valueOf(a); bv = valueOf(b); }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // --- Static regions, filled once. ---
  function fillStats() {
    var values = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var total = values.reduce(function (s, v) { return s + v; }, 0);
    var median = values[Math.floor(values.length / 2)];
    var stats = document.getElementById('stats');
    var defs = [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'every slug on the floor'],
      ['Board rows', String(DATA.board_size), DATA.early_size + ' early, below the floor'],
      ['Total implied value', fmtUsd(total), 'sum of all 200 rows'],
      ['Median implied value', fmtUsd(median), 'the middle protocol'],
      ['Top implied value', fmtUsd(values[values.length - 1]), DATA.rows[0].name],
      ['Live tokens set aside', String(DATA.live_size), 'priced by the market, not the model'],
    ];
    defs.forEach(function (d) {
      var box = h('div', null, h('dt', { text: d[0] }), h('dd', null, d[1], h('small', { text: d[2] })));
      stats.appendChild(box);
    });
    document.getElementById('snapshot-note').textContent = 'Snapshot ' + DATA.as_of + ' · model ' + DATA.model_version;
    document.getElementById('as-of').textContent = fmtDate(DATA.as_of);
    var m = DATA.model;
    document.getElementById('formula').textContent =
      'implied = round( tvl_usd × ' + m.base_multiple + ' × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (1 + 0.02 × min(chains, 5)) )';
  }
  function fillFilters() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = document.getElementById('category');
    catSel.appendChild(h('option', { value: 'all', text: 'All categories' }));
    cats.forEach(function (c) { catSel.appendChild(h('option', { value: c, text: c })); });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = document.getElementById('chain');
    chainSel.appendChild(h('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(h('option', { value: c, text: c })); });
  }

  // --- Board table. ---
  function boardTable() {
    var list = sortedRows(filteredRows());
    var box = document.getElementById('board');
    box.textContent = '';
    var panel = h('div', { class: 'panel' });
    if (list.length === 0) {
      panel.appendChild(h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or loosen a filter to see the board again.' }),
        h('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { clearFilters(); } })
      ));
      box.appendChild(panel);
      return;
    }
    var max = Math.max.apply(null, list.map(function (r) { return valueOf(r); })) || 1;
    var sb = sandboxModel();
    var thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col', class: 'num', text: 'Rank' }),
      h('th', { scope: 'col', text: 'Protocol' }),
      h('th', { scope: 'col', class: 'num', text: 'TVL' }),
      h('th', { scope: 'col', class: 'num', text: '7d' }),
      h('th', { scope: 'col', class: 'num', text: 'Age' }),
      h('th', { scope: 'col', class: 'num', text: 'Implied value' }),
      h('th', { scope: 'col', class: 'num', text: 'Per $1 TVL' })
    ));
    var tbody = h('tbody');
    list.forEach(function (r, i) {
      var val = valueOf(r);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankShown = sb ? String(i + 1) : String(r.rank);
      var rankNote = sb && r.rank !== i + 1 ? ' (board #' + r.rank + ')' : '';
      var tr = h('tr', {
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        h('td', { class: 'num rank' + (r.rank <= 3 && !sb ? ' top3' : ''), text: rankShown + rankNote }),
        h('td', null, h('div', { class: 'name' },
          h('b', null, r.name, h('span', { class: 'tag ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'WATCHLIST' : 'EARLY' })),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'no chain listed') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: fmtAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((val / max) * 100)) + '%' })),
          h('span', { class: 'num', text: fmtUsd(val) })
        )),
        h('td', { class: 'num', text: (r.tvl_usd ? val / r.tvl_usd : 0).toFixed(2) + '×' })
      );
      tbody.appendChild(tr);
    });
    panel.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
        thead, tbody
      )
    ));
    panel.appendChild(h('p', { class: 'board-foot', text: sb
      ? 'Re-ranked with your sandbox settings — board.json keeps the radar-2 defaults.'
      : 'Ranked by implied value under model ' + DATA.model_version + '. The last column is implied value per $1 of TVL.' }));
    box.appendChild(panel);
  }

  // --- Live-token view. ---
  function liveTable() {
    var box = document.getElementById('live-view');
    box.textContent = '';
    var panel = h('div', { class: 'panel' });
    var tbody = h('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(h('tr', null,
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'no chain listed') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        h('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        h('td', null, h('span', { class: 'tag early', text: 'ALREADY TRADES' }))
      ));
    });
    panel.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('caption', { text: 'Largest live-token protocols by market cap. Their token already trades, so the market cap is a fact, not a model — they are set aside from the pre-token ranking.' }),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', text: 'Protocol' }),
          h('th', { scope: 'col', class: 'num', text: 'TVL' }),
          h('th', { scope: 'col', class: 'num', text: '7d' }),
          h('th', { scope: 'col', class: 'num', text: 'Market cap' }),
          h('th', { scope: 'col', text: 'Token' })
        )),
        tbody
      )
    ));
    panel.appendChild(h('p', { class: 'live-note', text: 'A live token is the end of a launch story, not the start of one. Compare these market caps with the board\u2019s implied values to sense-check the model: the biggest pre-token implied values sit below the biggest live market caps.' }));
    box.appendChild(panel);
  }

  // --- Detail page for one protocol. ---
  function detailView() {
    var box = document.getElementById('detail');
    box.textContent = '';
    var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
    if (!row) {
      box.appendChild(h('div', { class: 'panel empty' },
        h('h2', { text: 'No such protocol on this board' }),
        h('p', { text: 'The link names a protocol the snapshot does not rank.' }),
        h('a', { class: 'button', href: '#board', text: 'Back to the board' })
      ));
      return;
    }
    var m = DATA.model;
    var base = Math.round(row.tvl_usd * m.base_multiple);
    var steps = farmSteps(row);
    var panel = h('div', { class: 'panel' });
    panel.appendChild(h('div', { class: 'detail-head' },
      h('a', { class: 'crumb', href: '#board', text: '← Back to the board' }),
      h('h2', null, 'Rank ' + row.rank + ' · ' + row.name),
      h('p', { class: 'meta', text: (row.category || 'Other') + ' · first listed ' + fmtDate(row.listed_at) + ' · ' + fmtAge(row.age_days) + ' with no token on record' }),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, 'TVL ', h('b', { text: fmtUsd(row.tvl_usd) })),
        h('span', { class: 'chip' }, '7-day ', h('b', { text: fmtPct(row.change_7d) })),
        h('span', { class: 'chip' }, 'Chains ', h('b', { text: String((row.chains || []).length) })),
        h('span', { class: 'chip' }, 'Set ', h('b', { text: row.on_watchlist ? 'Watchlist' : 'Early radar' }))
      )
    ));
    panel.appendChild(h('div', { class: 'equation' },
      h('div', null, h('span', { text: 'Base · TVL × 0.25' }), h('b', { text: fmtUsd(base) })),
      h('div', null, h('span', { text: 'Growth ×' }), h('b', { text: String(row.growth_multiplier) })),
      h('div', null, h('span', { text: 'Maturity ×' }), h('b', { text: String(row.maturity_multiplier) })),
      h('div', null, h('span', { text: 'Breadth ×' }), h('b', { text: String(row.breadth_multiplier) })),
      h('div', { class: 'equals' }, h('span', { text: 'Implied value' }), h('b', { text: fmtUsd(row.implied_value_usd) }))
    ));
    var list = h('ol', { class: 'steps' });
    steps.forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      list.appendChild(h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail })));
    });
    panel.appendChild(h('div', { class: 'detail-section' },
      h('h3', { text: 'Farm plan — ' + steps.length + ' steps' }),
      list
    ));
    panel.appendChild(h('p', { class: 'note', text: 'This protocol records no token in the snapshot. That is a record, not proof: it may hold a token the record does not carry. The farm plan costs real money and the implied value is a model, not a price — never pay anyone to claim a launch.' }));
    box.appendChild(panel);
  }

  // --- Filters, count line, tabs. ---
  function syncFilterInputs() {
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('min-tvl').value = String(state.minTvl);
    document.getElementById('min-implied').value = String(state.minImplied);
    document.getElementById('watchlist-only').checked = state.watchlistOnly;
    document.getElementById('early-only').checked = state.earlyOnly;
    document.getElementById('sort').value = state.sort;
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all';
    state.minTvl = 0; state.minImplied = 0;
    state.watchlistOnly = false; state.earlyOnly = false; state.sort = 'implied';
    syncFilterInputs(); writeHash(); renderBoard();
  }
  function bindFilters() {
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderBoard(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderBoard(); });
    document.getElementById('min-tvl').addEventListener('change', function (e) { state.minTvl = parseInt(e.target.value, 10) || 0; writeHash(); renderBoard(); });
    document.getElementById('min-implied').addEventListener('change', function (e) { state.minImplied = parseInt(e.target.value, 10) || 0; writeHash(); renderBoard(); });
    document.getElementById('watchlist-only').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; if (e.target.checked) state.earlyOnly = false; syncFilterInputs(); writeHash(); renderBoard(); });
    document.getElementById('early-only').addEventListener('change', function (e) { state.earlyOnly = e.target.checked; if (e.target.checked) state.watchlistOnly = false; syncFilterInputs(); writeHash(); renderBoard(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = -1; writeHash(); renderBoard(); });
  }
  function renderBoard() {
    var shown = filteredRows().length;
    document.getElementById('row-count').textContent = shown + ' of ' + DATA.board_size + ' rows shown';
    boardTable();
  }
  function setTab(name) {
    document.querySelectorAll('.tabs a').forEach(function (a) {
      if (a.getAttribute('data-tab') === name) a.classList.add('active');
      else a.classList.remove('active');
    });
  }
  function openDetail(slug) {
    state.view = 'detail'; state.selected = slug;
    writeHash(); render();
  }

  // --- Sandbox. ---
  function bindSandbox() {
    var base = document.getElementById('sb-base');
    var growth = document.getElementById('sb-growth');
    var note = document.getElementById('sb-note');
    function apply() {
      var b = parseFloat(base.value);
      var g = parseFloat(growth.value);
      document.getElementById('sb-base-out').textContent = b.toFixed(2);
      document.getElementById('sb-growth-out').textContent = g.toFixed(2);
      state.sbBase = Math.abs(b - DATA.model.base_multiple) < 0.005 ? null : b;
      state.sbGrowth = Math.abs(g - DATA.model.growth_weight) < 0.005 ? null : g;
      note.textContent = sandboxModel()
        ? 'Sandbox on: base multiple ' + b.toFixed(2) + ', growth weight ' + g.toFixed(2) + ' — the board above is re-ranked on these settings.'
        : 'Sandbox off: the board shows the radar-2 defaults.';
      if (state.view === 'board') renderBoard();
    }
    base.addEventListener('input', apply);
    growth.addEventListener('input', apply);
    document.getElementById('sb-reset').addEventListener('click', function () {
      base.value = String(DATA.model.base_multiple);
      growth.value = String(DATA.model.growth_weight);
      apply();
    });
    apply();
  }

  // --- Render the current view. ---
  function render() {
    var hero = document.getElementById('hero');
    var filters = document.getElementById('filters');
    var board = document.getElementById('board');
    var detail = document.getElementById('detail');
    var live = document.getElementById('live-view');
    var model = document.getElementById('model');
    hero.hidden = state.view === 'detail';
    filters.hidden = state.view !== 'board';
    board.hidden = state.view !== 'board';
    detail.hidden = state.view !== 'detail';
    live.hidden = state.view !== 'live';
    model.hidden = state.view === 'detail';
    setTab(state.view === 'detail' ? 'board' : state.view);
    if (state.view === 'board') renderBoard();
    if (state.view === 'detail') detailView();
    if (state.view === 'live') liveTable();
    if (state.view === 'model') model.scrollIntoView();
    app.setAttribute('aria-busy', 'false');
  }

  fillStats();
  fillFilters();
  syncFilterInputs();
  bindFilters();
  bindSandbox();
  readHash();
  syncFilterInputs();
  render();
  window.addEventListener('hashchange', function () { readHash(); syncFilterInputs(); render(); });
})();
