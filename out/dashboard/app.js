(() => {
  'use strict';
  const radar = window.RADAR;
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = (value) => {
    if (!Number.isFinite(value)) return '—';
    const unit = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']].find(([scale]) => Math.abs(value) >= scale);
    return `$${Number((value / (unit?.[0] ?? 1)).toFixed(unit?.[1] === 'B' ? 2 : 1))}${unit?.[1] ?? ''}`;
  };
  const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
  const days = (value) => Number.isFinite(value) ? value >= 365 ? `${(value / 365).toFixed(1)}y` : `${Math.round(value)}d` : 'unrecorded';
  const mult = (value) => Number.isFinite(value) ? `${value.toFixed(3)}×` : '—';
  const text = (id, value) => { byId(id).textContent = value; };
  const model = radar.model;
  const settings = {
    samples: model.samples_needed ?? model.cat_min_samples,
    low: model.clamp_low ?? model.mult_floor, high: model.clamp_high ?? model.mult_cap,
    step: model.breadth_step ?? model.chain_weight, cap: model.breadth_cap ?? model.chain_cap,
    maturityRange: model.maturity_range ?? (1 - model.maturity_floor),
  };
  const source = String(radar.source ?? '').replace(/(?:https?:\/\/|www\.)\S+/gi, '').replace(/\s+/g, ' ').trim();
  text('model-version', radar.model_version);
  text('snap-line', `snapshot ${radar.as_of} · floor ${money(radar.floor_usd)}${source ? ` · ${source}` : ''}`);
  text('lede', `${radar.universe_size} protocols in the universe; ${radar.global_sample} live-token protocols calibrated the board. The board prices ${radar.board_size} rows, and every row carries a farm plan with cost and time.`);
  for (const [key, value, note] of [
    ['watch', radar.watchlist_size, 'no token recorded'], ['rows', radar.board_size, `${radar.early_size} below the floor`],
    ['live', radar.global_sample, 'used to calibrate'], ['mult', mult(radar.global_median_multiple), 'median market cap / TVL'],
  ]) { text(`stat-${key}`, value); text(`stat-${key}-n`, note); }
  text('foot-line', `Token Launch Radar · ${radar.model_version} · snapshot ${radar.as_of} · Estimates, not a token launch forecast or investment advice.`);
  const defaults = { q: '', category: '', chain: '', sort: 'implied', watch: false };
  const state = { ...defaults, open: null };
  const sorts = { implied: ['Implied value', 'implied_value_usd'], tvl: ['TVL', 'tvl_usd'], growth: ['7-day growth', 'change_7d'], age: ['Age', 'age_days'] };
  for (const [id, values] of [['f-category', radar.rows.map((row) => row.category).filter(Boolean)], ['f-chain', radar.rows.flatMap((row) => row.chains)]]) {
    for (const value of [...new Set(values)].sort((left, right) => left.localeCompare(right))) byId(id).add(new Option(value, value));
  }
  const metadata = (row) => `${row.category ?? 'Uncategorised'} · ${row.chains.slice(0, 3).join(', ')}${row.chains.length > 3 ? ` +${row.chains.length - 3}` : ''}`;
  function render() {
    const query = state.q.trim().toLowerCase();
    const rows = radar.rows.filter((row) => (!state.watch || row.on_watchlist) && (!state.category || row.category === state.category) && (!state.chain || row.chains.includes(state.chain)) && [row.name, row.slug, row.category, ...row.chains].join(' ').toLowerCase().includes(query));
    const [label, key] = sorts[state.sort];
    rows.sort((left, right) => (right[key] ?? -Infinity) - (left[key] ?? -Infinity) || left.rank - right.rank);
    const largest = Math.max(1, ...rows.map((row) => row.implied_value_usd));
    byId('rows').innerHTML = rows.map((row) => `<li class="row${state.open === row.slug ? ' is-open' : ''}" tabindex="0" role="button" data-slug="${esc(row.slug)}" aria-haspopup="dialog">
      <span class="c-rank">${row.rank}</span><span class="c-name"><b class="p-name">${esc(row.name)}</b>${row.on_watchlist ? ' <em class="tag flag">watchlist</em>' : ''}<small class="p-meta" style="display:block">${esc(metadata(row))}</small></span>
      <span class="c-num c-tvl tvl-col">${money(row.tvl_usd)}</span><span class="c-num c-chg growth-col ${row.change_7d == null ? 'faint' : row.change_7d >= 0 ? 'up pos' : 'down neg'}">${pct(row.change_7d)}</span>
      <span class="c-num c-age age-col">${days(row.age_days)}</span><span class="c-num c-mult mult-col">${mult(row.multiple)}</span>
      <span class="c-val value"><b>${money(row.implied_value_usd)}</b><span class="bar" style="width:${100 * row.implied_value_usd / largest}%"><i style="width:100%"></i></span><span class="band" style="display:block">${money(row.implied_low_usd)}–${money(row.implied_high_usd)}</span></span></li>`).join('');
    text('count', `${rows.length} of ${radar.rows.length} rows · sorted by ${label}`);
    byId('empty').hidden = rows.length !== 0;
  }
  let previousFocus = null;
  function open(slug) {
    const row = radar.rows.find((item) => item.slug === slug);
    if (!row) return;
    if (byId('drawer').hidden) previousFocus = document.activeElement;
    state.open = slug;
    const growth = 1 + row.growth_pct / 100 * model.growth_weight;
    const maturity = model.maturity_floor + Math.min(row.age_days ?? model.unknown_age_days ?? 365, model.maturity_days) / model.maturity_days * settings.maturityRange;
    const breadth = 1 + settings.step * Math.min(Math.max(row.chains.length - 1, 0), settings.cap);
    const record = [['TVL', money(row.tvl_usd)], ['7-day', pct(row.change_7d)], ['Category', row.category ?? 'Uncategorised'], ['Chains', row.chains.join(', ')], ['Listed at', row.listed_at ?? 'unrecorded'], ['Age', days(row.age_days)], ['No token for', days(row.age_days)]];
    byId('d-body').innerHTML = `<p class="eyebrow">Rank #${row.rank} · ${esc(row.slug)}</p><h2 id="d-name">${esc(row.name)}</h2><div class="big-value">${money(row.implied_value_usd)}</div><p class="band">${money(row.implied_low_usd)}–${money(row.implied_high_usd)}</p><p class="note">${esc(row.confidence)} confidence · ${row.category_sample} calibration samples</p>
      <h3>The record</h3><dl class="facts">${record.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
      <h3>The arithmetic</h3><div class="formula">${[
        ['Base', `${money(row.tvl_usd)} × category multiple ${mult(row.multiple)} = ${money(row.tvl_usd * row.multiple)}`],
        ['Growth', `${pct(row.growth_pct)} × weight ${model.growth_weight}: ${mult(growth)}`],
        ['Maturity', mult(maturity)], ['Breadth', mult(breadth)], ['Implied', `${money(row.tvl_usd * row.multiple)} × ${mult(growth)} × ${mult(maturity)} × ${mult(breadth)} = ${money(row.implied_value_usd)}`],
      ].map(([label, value]) => `<div class="formula-line"><span class="k">${label}</span><span class="eq">=</span><span class="v">${esc(value)}</span></div>`).join('')}</div>
      <h3>Farm plan</h3><ol class="steps">${row.farm.map((step) => `<li>${esc(step.action)}<span class="cost"><b>Cost:</b> ${esc(step.cost)} · <b>Time:</b> ${esc(step.time)}</span></li>`).join('')}</ol>`;
    render();
    byId('drawer').hidden = false;
    byId('drawer').setAttribute('aria-hidden', 'false');
    byId('drawer-close').focus();
  }
  function close() {
    if (byId('drawer').hidden) return;
    const slug = state.open;
    state.open = null;
    byId('drawer').hidden = true;
    byId('drawer').setAttribute('aria-hidden', 'true');
    render();
    const row = [...byId('rows').children].find((item) => item.dataset.slug === slug);
    (previousFocus?.isConnected ? previousFocus : row)?.focus();
  }
  function filter(values = {}) {
    for (const key of Object.keys(defaults)) if (Object.hasOwn(values, key)) state[key] = key === 'watch' ? Boolean(values[key]) : String(values[key] ?? '');
    if (!Object.hasOwn(sorts, state.sort)) state.sort = defaults.sort;
    for (const [key, id] of [['q', 'q'], ['category', 'f-category'], ['chain', 'f-chain'], ['sort', 'f-sort']]) byId(id).value = state[key];
    byId('f-watch').checked = state.watch;
    render();
  }
  byId('rows').addEventListener('click', (event) => { const row = event.target.closest('[data-slug]'); if (row) open(row.dataset.slug); });
  byId('rows').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { const row = event.target.closest('[data-slug]'); if (row) { event.preventDefault(); open(row.dataset.slug); } } });
  byId('drawer-close').addEventListener('click', close);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  document.addEventListener('click', (event) => { if (!byId('drawer').contains(event.target) && !event.target.closest('#rows [data-slug]')) close(); });
  byId('q').addEventListener('input', () => filter({ q: byId('q').value }));
  for (const [key, id] of [['category', 'f-category'], ['chain', 'f-chain'], ['sort', 'f-sort']]) byId(id).addEventListener('change', () => filter({ [key]: byId(id).value }));
  byId('f-watch').addEventListener('change', () => filter({ watch: byId('f-watch').checked }));
  byId('reset').addEventListener('click', () => filter(defaults));
  for (const tab of document.querySelectorAll('[data-view]')) tab.addEventListener('click', () => {
    close();
    for (const button of document.querySelectorAll('[data-view]')) { const selected = button === tab; button.setAttribute('aria-selected', String(selected)); byId(`view-${button.dataset.view}`).hidden = !selected; }
  });
  byId('live').innerHTML = radar.live.map((row) => `<li class="row live"><span class="c-name"><b class="p-name">${esc(row.name)}</b><small class="p-meta" style="display:block">${esc(row.category ?? 'Uncategorised')}</small></span><span class="c-num" aria-label="TVL">${money(row.tvl_usd)}</span><span class="c-num" aria-label="Market cap">${money(row.mcap_usd)}</span><span class="c-num" aria-label="Multiple">${mult(row.multiple)}</span><span class="c-num" aria-label="Age">${days(row.age_days)}</span></li>`).join('');
  byId('method-body').innerHTML = `<div class="formula"><div class="formula-line strong"><span class="k">Implied</span><span class="eq">=</span><span class="v">TVL × category multiple × growth × maturity × breadth</span></div></div><p class="note">Live-token market cap / TVL provides category medians and quartiles. Categories need ${esc(settings.samples)} samples; thinner categories use the global median, ${mult(radar.global_median_multiple)}, from ${radar.global_sample} samples. Multiples are clamped to ${mult(settings.low)}–${mult(settings.high)}.${model.category_weight != null ? ` Category weight is ${esc(model.category_weight)}.` : ''}</p>
    <ul class="limits"><li>Growth = 1 + growth percentage / 100 × ${esc(model.growth_weight)}.${model.growth_floor != null ? ` Weekly growth is clamped to ${pct(model.growth_floor)}–${pct(model.growth_cap)}.` : ''}</li><li>Maturity = ${esc(model.maturity_floor)} + min(age, ${esc(model.maturity_days)}) / ${esc(model.maturity_days)} × ${esc(settings.maturityRange)}. Missing listing dates use ${esc(model.unknown_age_days ?? 365)} days.</li><li>Breadth = 1 + ${esc(settings.step)} × min(extra chains, ${esc(settings.cap)}).</li><li>The low–high band uses category quartiles with the same adjustments. Estimates hold today's record fixed; they do not predict token issuance, supply or a launch price.</li></ul><h3>Category calibration</h3>`;
  byId('category-table').innerHTML = `<caption>Live-token category multiples</caption><thead><tr><th scope="col">Category</th><th scope="col">Samples</th><th scope="col">Median</th><th scope="col">25th percentile</th><th scope="col">75th percentile</th></tr></thead><tbody>${radar.categories.map((category) => `<tr><th scope="row">${esc(category.category)}</th><td>${category.sample}</td><td>${mult(category.median_multiple)}</td><td>${mult(category.p25_multiple)}</td><td>${mult(category.p75_multiple)}</td></tr>`).join('')}</tbody>`;
  window.RADAR_UI = { open, close, filter };
  render();
})();
