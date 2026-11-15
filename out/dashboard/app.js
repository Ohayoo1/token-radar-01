// The radar's page. One data object (window.RADAR, written by main.ts), no network, no framework:
// a filterable board, a detail drawer with the arithmetic and the farm plan, the live-token evidence
// behind the multiples, and the method the numbers come from.

const R = window.RADAR;

/* ---------- formatting ---------- */
const money = (n) => {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
};
const pct = (n) => (n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
const mult = (n) => (n >= 1 ? `${n.toFixed(2)}×` : `${n.toFixed(3)}×`);
const age = (d) => (d === null ? 'unrecorded' : d >= 730 ? `${(d / 365).toFixed(1)} yr` : `${d.toLocaleString('en-US')} d`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- chrome ---------- */
const $ = (id) => document.getElementById(id);
document.title = `Token Launch Radar — ${R.board_size} protocols, ranked by implied value`;

const fetched = (R.source.match(/fetched\s+([^\n]+)$/) ?? [])[1] ?? '';
$('snapshot-meta').innerHTML =
  `snapshot <b>${esc(R.as_of)}</b> · floor <b>${money(R.floor_usd)}</b><br>DefiLlama · fetched ${esc(fetched.replace(/\.\d+Z$/, 'Z'))}`;
$('model-chip').textContent = R.model_version;
$('lede').textContent =
  `${R.universe_size.toLocaleString('en-US')} protocols in the snapshot, ${R.live_tokens} with a token that already trades. ` +
  `The board prices the other ${R.board_size} — every one of the ${R.watchlist_size} on the watchlist and ${R.early_size} below its floor — ` +
  `off the multiples the market itself pays in their category, and gives each a farm plan with what it costs and how long it takes.`;

$('stats').innerHTML = [
  ['On the watchlist', R.watchlist_size, 'no token recorded'],
  ['Rows on the board', R.board_size, `${R.early_size} below the floor`],
  ['Live-token comparators', R.global_sample, 'used to calibrate'],
  ['Median MC / TVL', mult(R.global_median_multiple), 'the market\'s own price'],
]
  .map(([k, v, s]) => `<div class="stat"><dt>${k}</dt><dd>${v}<small>${s}</small></dd></div>`)
  .join('');
$('foot-left').textContent = `Token Launch Radar · ${R.model_version} · snapshot ${R.as_of}`;

/* ---------- state ---------- */
const state = { q: '', category: '', chain: '', sort: 'implied', watch: false, open: null };

const categories = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort((a, b) => (a < b ? -1 : 1));
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort((a, b) => (a < b ? -1 : 1));
$('f-category').insertAdjacentHTML('beforeend', categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(''));
$('f-chain').insertAdjacentHTML('beforeend', chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(''));

/* ---------- the board ---------- */
function filtered() {
  const q = state.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (state.watch && !r.on_watchlist) return false;
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.slug.includes(q) ||
      (r.category ?? '').toLowerCase().includes(q) ||
      r.chains.join(' ').toLowerCase().includes(q)
    );
  });
  const key = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -999) - (a.change_7d ?? -999),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[state.sort];
  return rows.sort(key);
}

function render() {
  const rows = filtered();
  const top = Math.max(...rows.map((r) => r.implied_value_usd), 1);
  $('rows').innerHTML = rows
    .map((r) => {
      const w = Math.max(1, Math.round((r.implied_value_usd / top) * 100));
      const g = r.change_7d === null ? 'c-num growth-col faint' : r.change_7d >= 0 ? 'c-num growth-col pos' : 'c-num growth-col neg';
      return `<li><button class="row${state.open === r.slug ? ' is-open' : ''}" data-slug="${esc(r.slug)}" type="button">
        <span class="c-rank">${r.rank}</span>
        <span class="c-name">
          <span class="p-name">${esc(r.name)}${r.on_watchlist ? '<span class="flag">watchlist</span>' : '<span class="flag early">early</span>'}</span>
          <span class="p-meta">${esc(r.category ?? 'uncategorised')} · ${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</span>
        </span>
        <span class="c-num tvl-col">${money(r.tvl_usd)}</span>
        <span class="${g}">${pct(r.change_7d)}</span>
        <span class="c-num age-col faint">${age(r.age_days)}</span>
        <span class="c-num mult-col faint">${mult(r.multiple)}</span>
        <span class="value">
          <b>${money(r.implied_value_usd)}</b>
          <span class="bar"><i style="width:${w}%"></i></span>
          <span class="band">${money(r.implied_low_usd)} – ${money(r.implied_high_usd)}</span>
        </span>
      </button></li>`;
    })
    .join('');
  $('empty').hidden = rows.length > 0;
  $('count').textContent = `${rows.length} of ${R.board_size} rows · sorted by ${$('f-sort').selectedOptions[0].textContent.toLowerCase()}`;
}

/* ---------- the detail drawer ---------- */
function drawer(r) {
  const p = [
    ['TVL', money(r.tvl_usd)],
    ['7-day change', pct(r.change_7d)],
    ['Category', r.category ?? 'uncategorised'],
    ['Chains', r.chains.slice(0, 6).join(', ') + (r.chains.length > 6 ? ` +${r.chains.length - 6}` : '') || '—'],
    ['Recorded since', r.listed_at ?? 'unrecorded'],
    ['No token for', age(r.age_days)],
  ];
  $('drawer-in').innerHTML = `
    <button class="drawer-close" type="button" aria-label="Close">×</button>
    <div class="d-eyebrow">Rank ${r.rank} of ${R.board_size} · ${r.on_watchlist ? 'on the watchlist' : 'early, below the floor'}</div>
    <h2 class="d-title">${esc(r.name)}</h2>
    <div class="d-sub">${esc(r.category ?? 'uncategorised')} · ${esc(r.chains.slice(0, 6).join(' · ') || 'chains unrecorded')}${r.chains.length > 6 ? ` +${r.chains.length - 6}` : ''}</div>
    <div class="d-value">${money(r.implied_value_usd)}</div>
    <div class="d-band">implied value · likely ${money(r.implied_low_usd)} to ${money(r.implied_high_usd)}<br>${r.confidence} confidence · ${r.category_sample} ${esc(r.category_basis)}</div>

    <div class="d-block">
      <h3>The record</h3>
      <dl class="d-grid">${p.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>

    <div class="d-block">
      <h3>The arithmetic</h3>
      <dl class="d-grid">
        <dt>TVL × category multiple</dt><dd><b>${money(r.tvl_usd)}</b> × <b>${mult(r.multiple)}</b></dd>
        <dt>7-day growth, damped</dt><dd><b>${pct(r.growth_pct)}</b> → ${(1 + (r.growth_pct / 100) * R.model.growth_weight).toFixed(3)}×</dd>
        <dt>Maturity</dt><dd>${age(r.age_days)} → ${(R.model.maturity_floor + (Math.min(Math.max(r.age_days ?? R.model.unknown_age_days, 0), R.model.maturity_days) / R.model.maturity_days) * R.model.maturity_range).toFixed(3)}×</dd>
        <dt>Chain breadth</dt><dd>${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} → ${(1 + R.model.chain_weight * Math.min(Math.max(r.chains.length - 1, 0), R.model.chain_cap)).toFixed(3)}×</dd>
        <dt>Implied value</dt><dd><b>${money(r.implied_value_usd)}</b></dd>
      </dl>
    </div>

    <div class="d-block">
      <h3>How to farm it</h3>
      <ol class="steps">${r.farm
        .map((s) => `<li>${esc(s.action)}<span class="cost"><b>Cost</b> ${esc(s.cost)} · <b>Time</b> ${esc(s.time)}</span></li>`)
        .join('')}</ol>
    </div>`;
  $('drawer').hidden = false;
  $('drawer-in').querySelector('.drawer-close').addEventListener('click', close);
  $('drawer').scrollTop = 0;
}
function open(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.open = slug;
  render();
  drawer(r);
}
function close() {
  state.open = null;
  $('drawer').hidden = true;
  render();
}

/* ---------- the live-token evidence ---------- */
const liveTop = Math.max(...R.live.map((l) => l.multiple), 1);
$('live-rows').innerHTML = R.live
  .map((l) => {
    const g = l.change_7d === null ? 'c-num faint' : l.change_7d >= 0 ? 'c-num pos' : 'c-num neg';
    return `<li><div class="row live">
      <span class="c-name">
        <span class="p-name">${esc(l.name)}</span>
        <span class="p-meta">${esc(l.category ?? 'uncategorised')} · ${esc(l.symbol ?? 'no ticker')} · ${esc(l.chains.slice(0, 2).join(', '))}</span>
      </span>
      <span class="c-num">${money(l.tvl_usd)}</span>
      <span class="c-num">${money(l.mcap_usd)}</span>
      <span class="${g}">${pct(l.change_7d)}</span>
      <span class="value"><b>${mult(l.multiple)}</b><span class="bar"><i style="width:${Math.max(2, Math.round((l.multiple / liveTop) * 100))}%"></i></span></span>
    </div></li>`;
  })
  .join('');

/* ---------- the method ---------- */
const w = R.model;
$('w-growth').textContent = w.growth_weight;
$('w-matfloor').textContent = w.maturity_floor;
$('w-matrange').textContent = w.maturity_range;
$('w-matdays').textContent = w.maturity_days.toLocaleString('en-US');
$('w-matdays2').textContent = w.maturity_days.toLocaleString('en-US');
$('w-chain').textContent = w.chain_weight;
$('w-chaincap').textContent = w.chain_cap;
$('method-note').textContent =
  `The multiple is the only input the snapshot does not give directly, so it is read from the snapshot's own live-token protocols: ` +
  `${R.global_sample} of them record both a market cap and a TVL today, and their median is ${mult(R.global_median_multiple)}. ` +
  `A category with at least ${w.cat_min_samples} of them uses its own median, clamped to ${mult(w.mult_floor)}–${mult(w.mult_cap)}; ` +
  `anything thinner falls back to the whole live set. A protocol the snapshot gives no listing date is treated as ${w.unknown_age_days} days old.`;
$('cat-rows').innerHTML = R.categories
  .map((c) => `<li><div class="row cat">
      <span class="c-name">${esc(c.category)}</span>
      <span class="c-num">${c.sample}</span>
      <span class="c-num faint">${mult(c.p25_multiple)}</span>
      <span class="c-num"><b>${mult(c.median_multiple)}</b></span>
      <span class="c-num faint">${mult(c.p75_multiple)}</span>
    </div></li>`)
  .join('');

/* ---------- wiring ---------- */
$('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('.row');
  if (btn) open(btn.dataset.slug);
});
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('f-category').addEventListener('change', (e) => { state.category = e.target.value; render(); });
$('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('f-watch').addEventListener('change', (e) => { state.watch = e.target.checked; render(); });
$('reset').addEventListener('click', () => {
  state.q = ''; state.category = ''; state.chain = ''; state.sort = 'implied'; state.watch = false;
  $('q').value = ''; $('f-category').value = ''; $('f-chain').value = ''; $('f-sort').value = 'implied'; $('f-watch').checked = false;
  close(); render();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t === tab));
  for (const v of ['board', 'live', 'method']) $(`view-${v}`).hidden = v !== tab.dataset.view;
});

render();
window.RADAR_UI = { open, close, filter: (f) => { Object.assign(state, f); sync(); render(); } };

/** Push the state's values back into the controls, so a filtered board and its controls agree. */
function sync() {
  $('q').value = state.q;
  $('f-category').value = state.category;
  $('f-chain').value = state.chain;
  $('f-sort').value = state.sort;
  $('f-watch').checked = state.watch;
}
