export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number;
  unknown_age_days: number; mult_floor: number; mult_cap: number;
  cat_min_samples: number; chain_weight: number; chain_cap: number;
}
export const MODEL: ModelConstants = {
  growth_weight: 0.5, growth_floor: -60, growth_cap: 120,
  maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095,
  unknown_age_days: 365, mult_floor: 0.05, mult_cap: 12,
  cat_min_samples: 8, chain_weight: 0.05, chain_cap: 4,
};
export const MODEL_VERSION = 'radar-2-calibrated';
export const EARLY_ROWS = 260;
export interface FarmStep { action: string; cost: string; time: string }
interface RowModel {
  model_version: string; category_multiple: number; category_sample: number;
  category_basis: string; low_multiple: number; high_multiple: number;
  growth_pct: number; growth_multiplier: number; maturity_multiplier: number;
  breadth_multiplier: number; age_days: number | null;
}
export interface BoardRow extends SnapshotProtocol {
  rank: number; implied_value_usd: number; farm_steps: string[];
  token_status: 'pre-token'; age_days: number | null;
  implied_low_usd: number; implied_high_usd: number; on_watchlist: boolean;
  confidence: 'high' | 'medium' | 'low'; model: RowModel;
}
interface CategoryStats {
  category: string; sample: number; median_multiple: number;
  p25_multiple: number; p75_multiple: number;
}
interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number; implied_low_usd: number;
  implied_high_usd: number; on_watchlist: boolean; confidence: BoardRow['confidence'];
  multiple: number; category_sample: number; category_basis: string;
  growth_pct: number; farm: FarmStep[];
}
interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
  multiple: number | null; listed_at: string | null; age_days: number | null;
  symbol: string | null;
}
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants;
  model_version: string; watchlist_size: number; board_size: number;
  early_size: number; live_size: number; universe_size: number; live_tokens: number;
  global_median_multiple: number; global_sample: number;
  categories: CategoryStats[]; rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SnapshotError('Snapshot is not valid JSON'); }
  if (!isRecord(value)) throw new SnapshotError('Snapshot must be an object');
  if (!validDay(value.as_of)) throw new SnapshotError('as_of must be a valid YYYY-MM-DD date');
  if (typeof value.source !== 'string' || !value.source.trim()) throw new SnapshotError('Missing source');
  if (!finite(value.floor_usd) || value.floor_usd <= 0) throw new SnapshotError('floor_usd must be positive');
  if (!Array.isArray(value.protocols) || !value.protocols.length) throw new SnapshotError('Empty protocols');
  if (!Array.isArray(value.watchlist) || !value.watchlist.length) throw new SnapshotError('Empty watchlist');
  const slugs = new Set<string>();
  for (const protocol of value.protocols) {
    if (!isRecord(protocol)) throw new SnapshotError('Protocol must be an object');
    if (typeof protocol.slug !== 'string' || !protocol.slug || /\s/.test(protocol.slug) || slugs.has(protocol.slug)) {
      throw new SnapshotError('Protocol slug is missing, duplicated or contains whitespace');
    }
    slugs.add(protocol.slug);
    if (typeof protocol.name !== 'string' || !protocol.name.trim()) throw new SnapshotError('Protocol name missing');
    if (!finite(protocol.tvl_usd) || protocol.tvl_usd < 0) throw new SnapshotError('Invalid protocol TVL');
    if (!nullableString(protocol.category) || !nullableString(protocol.listed_at) ||
        !nullableString(protocol.gecko_id) || !nullableString(protocol.symbol)) {
      throw new SnapshotError('Invalid nullable protocol field');
    }
    if (!Array.isArray(protocol.chains) || !protocol.chains.every((chain: unknown) => typeof chain === 'string')) {
      throw new SnapshotError('Protocol chains must be strings');
    }
    if (!(protocol.change_7d === null || finite(protocol.change_7d)) ||
        !(protocol.mcap_usd === null || finite(protocol.mcap_usd))) {
      throw new SnapshotError('Invalid change_7d or mcap_usd');
    }
  }
  const watched = new Set<string>();
  for (const slug of value.watchlist) {
    if (typeof slug !== 'string' || /\s/.test(slug) || !slugs.has(slug) || watched.has(slug)) {
      throw new SnapshotError('Watchlist slug is unknown, duplicated or malformed');
    }
    watched.add(slug);
  }
  return value as unknown as Snapshot;
}
function compareSlug(left: { slug: string }, right: { slug: string }): number {
  return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0;
}
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
function categoryName(protocol: SnapshotProtocol): string { return protocol.category ?? 'Uncategorised'; }
function preToken(protocol: SnapshotProtocol): boolean {
  return !protocol.mcap_usd && !protocol.gecko_id && !protocol.symbol;
}
function liveToken(protocol: SnapshotProtocol): boolean {
  return Boolean(protocol.gecko_id || protocol.symbol) && (protocol.mcap_usd ?? 0) > 0;
}
function ageDays(listed: string | null, asOf: string): number | null {
  if (!listed || !asOf) return null;
  const start = Date.parse(listed);
  const end = Date.parse(asOf);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86400000)) : null;
}

// Live-token ratios calibrate the valuation to this snapshot, not an assumed industry multiple.
function calibrate(protocols: SnapshotProtocol[], model: ModelConstants) {
  const live = protocols.filter(liveToken);
  const groups = new Map<string, number[]>();
  const multiples: number[] = [];
  for (const protocol of live) {
    if (protocol.tvl_usd <= 0) continue;
    const multiple = protocol.mcap_usd! / protocol.tvl_usd;
    multiples.push(multiple);
    const category = categoryName(protocol);
    const group = groups.get(category) ?? [];
    group.push(multiple);
    groups.set(category, group);
  }
  if (!multiples.length) throw new SnapshotError('No positive-TVL live-token comparators for calibration');
  multiples.sort((left, right) => left - right);
  const bounded = (value: number) => clamp(value, model.mult_floor, model.mult_cap);
  const categories = new Map<string, CategoryStats>();
  for (const [category, group] of groups) {
    group.sort((left, right) => left - right);
    if (group.length >= model.cat_min_samples) categories.set(category, {
      category, sample: group.length, median_multiple: bounded(median(group)),
      p25_multiple: bounded(percentile(group, 0.25)), p75_multiple: bounded(percentile(group, 0.75)),
    });
  }
  return { live, groups, categories, global: bounded(median(multiples)), sample: multiples.length };
}

// Capital, gas and holding time vary continuously with the protocol's TVL, breadth and age.
export function farmPlan(protocol: SnapshotProtocol, age: number | null, onWatchlist: boolean): FarmStep[] {
  const scale = Math.log10(1 + protocol.tvl_usd);
  const breadth = Math.max(1, protocol.chains.length);
  const capitalLow = Math.round(35 + scale * scale * 4.7);
  const capitalHigh = Math.round(capitalLow * (1.65 + breadth * 0.035));
  const gasLow = (0.3 + scale * 0.19 + breadth * 0.11).toFixed(2);
  const gasHigh = (Number(gasLow) * (2 + Math.min(age ?? 365, 1095) / 1095)).toFixed(2);
  const hold = Math.round(21 + scale * 3 + Math.min(age ?? 365, 1095) / 35 + breadth);
  const weekly = Math.max(1, Math.round(capitalLow * (0.06 + scale / 100)));
  const chain = protocol.chains[0] ?? 'the protocol’s documented supported chain';
  const capital = `$${capitalLow}–$${capitalHigh} of capital at risk`;
  const gas = `$${gasLow}–$${gasHigh} estimated gas per interaction; verify wallet quote`;
  const category = (protocol.category ?? '').toLowerCase();
  let enter: string;
  let maintain: string;
  if (/perp|derivative|options/.test(category)) {
    enter = `Deposit collateral on ${chain}; open one small, fully collateralised hedge on ${protocol.name}, avoiding leverage.`;
    maintain = `Review funding and liquidation buffers weekly; trade about $${weekly} only when a real hedge is needed, never wash trade.`;
  } else if (/dex|amm|exchange/.test(category)) {
    enter = `Swap about $${weekly} between liquid assets on ${protocol.name}, then supply a balanced pair on ${chain}.`;
    maintain = `Review liquidity and impermanent loss weekly; make at most one useful $${weekly} swap, not circular volume.`;
  } else if (/lend|cdp|borrow/.test(category)) {
    enter = `Supply a liquid collateral asset to ${protocol.name} on ${chain}; avoid borrowing until collateral and oracle risks are clear.`;
    maintain = `Review utilisation and collateral health weekly; add around $${weekly} of genuine savings rather than cycling loans.`;
  } else if (/restak|staking|liquid stak/.test(category)) {
    enter = `Stake a supported asset through ${protocol.name} on ${chain}; check validator, slashing and withdrawal conditions first.`;
    maintain = `Review validator performance and withdrawal queues weekly; add about $${weekly} only if the staking risk remains acceptable.`;
  } else if (/rwa|real.world/.test(category)) {
    enter = `Check jurisdiction, identity requirements and redemption rights before supplying an eligible asset to ${protocol.name} on ${chain}.`;
    maintain = `Review issuer disclosures and backing weekly; add about $${weekly} only if eligible and redemption liquidity remains sound.`;
  } else if (/yield|vault|farm|aggregator/.test(category)) {
    enter = `Supply a supported asset to one transparent ${protocol.name} vault on ${chain}; read its strategy and withdrawal terms.`;
    maintain = `Review strategy exposure and net yield weekly; supply about $${weekly} of new savings only if fees do not erase returns.`;
  } else if (/bridge|cross.chain/.test(category)) {
    enter = `Bridge about $${weekly} to ${chain} through ${protocol.name} for a real destination use; verify asset and destination addresses.`;
    maintain = `Check message finality and bridge liquidity weekly; bridge another $${weekly} only for a genuine transfer, not a round trip.`;
  } else if (/launchpad|launch/.test(category)) {
    enter = `Check eligibility and allocation terms on ${protocol.name}; reserve capital on ${chain} for one eligible launch, never an unverified sale.`;
    maintain = `Review vesting, refund and launch rules weekly; cap any eligible subscription near $${weekly} and skip unsuitable offerings.`;
  } else if (/nft|gaming|game|prediction/.test(category)) {
    enter = `Use one real game, collectible or prediction market on ${protocol.name} on ${chain}, with spending capped near $${weekly}.`;
    maintain = `Return weekly for genuine play or research-backed participation; cap additional spending at $${weekly} and avoid self-trading.`;
  } else {
    enter = `Read ${protocol.name}'s documentation and supply a supported liquid asset to its core product on ${chain}.`;
    maintain = `Review product usage and withdrawals weekly; supply or transact about $${weekly} only for a genuine economic purpose.`;
  }
  return [
    { action: `Verify ${protocol.name}'s official app, contracts, audits and withdrawal route; ${onWatchlist ? 'watchlist inclusion' : 'early-stage inclusion'} is not a token promise.`, cost: 'No capital; research only', time: 'Before funding, 30–45 minutes' },
    { action: `Fund one established wallet on ${chain} with ${capital}; retain native gas and test a small withdrawal before scaling.`, cost: `${capital}; ${gas}`, time: 'Once, before the first position' },
    { action: enter, cost: `${capital}; ${gas}; product fees may apply`, time: 'One initial session, 15–30 minutes' },
    { action: maintain, cost: `Up to $${weekly} additional capital; ${gas}`, time: `Weekly throughout ${hold} days` },
    { action: `Keep the core position for ${hold} days if safe; monitor contract changes, depegs, oracle failures and withdrawal liquidity; exit on material risk.`, cost: 'Capital remains exposed; possible loss and exit fees', time: `${hold} days; review alerts daily` },
    { action: 'Use one wallet and one coherent position history; retain transaction notes, avoid duplicate accounts, wash volume and artificial referrals.', cost: 'No extra capital or manufactured volume', time: 'Every interaction; five-minute weekly record' },
    { action: `Recheck ${protocol.name}'s official eligibility and withdrawal rules; unwind on ${chain} if risk or fees exceed utility. No issuance or reward is assumed.`, cost: `${gas}; any withdrawal fees`, time: `At day ${hold}, or immediately on a risk alert` },
  ];
}
export function stepText(step: FarmStep): string {
  return `${step.action} Cost: ${step.cost}. Time: ${step.time}.`.slice(0, 600).padEnd(20, ' ');
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot.protocols, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = snapshot.protocols.filter(protocol => !watchlist.has(protocol.slug) &&
    protocol.tvl_usd < snapshot.floor_usd && preToken(protocol) && protocol.category !== 'CEX' &&
    !/\s+v?\d+(?:\.\d+)*(?:\s*)$/i.test(protocol.name))
    .sort((left, right) => right.tvl_usd - left.tvl_usd || compareSlug(left, right)).slice(0, EARLY_ROWS);
  const selected = [...snapshot.protocols.filter(protocol => watchlist.has(protocol.slug)), ...early];
  const board: BoardRow[] = selected.map(protocol => {
    const category = categoryName(protocol);
    const stats = calibration.categories.get(category);
    const sample = calibration.groups.get(category)?.length ?? 0;
    const multiple = stats?.median_multiple ?? calibration.global;
    const low = stats?.p25_multiple ?? calibration.global * 0.6;
    const high = stats?.p75_multiple ?? calibration.global * 1.6;
    const age = ageDays(protocol.listed_at, snapshot.as_of);
    // Growth tempers the weekly change; maturity discounts short histories; breadth rewards deployments modestly.
    const growthPct = clamp(protocol.change_7d ?? 0, model.growth_floor, model.growth_cap);
    const growthMult = 1 + growthPct / 100 * model.growth_weight;
    const maturityMult = model.maturity_floor + Math.min(age ?? model.unknown_age_days, model.maturity_days) /
      model.maturity_days * model.maturity_range;
    const breadthMult = 1 + model.chain_weight * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
    const value = (ratio: number) => Math.max(1, Math.round(protocol.tvl_usd * ratio * growthMult * maturityMult * breadthMult));
    const onWatchlist = watchlist.has(protocol.slug);
    return {
      ...protocol, rank: 0, token_status: 'pre-token', age_days: age,
      implied_value_usd: value(multiple), implied_low_usd: value(low), implied_high_usd: value(high),
      on_watchlist: onWatchlist, confidence: sample >= 40 && age !== null ? 'high' : sample >= 15 ? 'medium' : 'low',
      farm_steps: farmPlan(protocol, age, onWatchlist).map(stepText),
      model: {
        model_version: MODEL_VERSION, category_multiple: multiple, category_sample: sample,
        category_basis: stats ? `live ${category} protocols` : 'live-token protocols across the snapshot',
        low_multiple: low, high_multiple: high, growth_pct: growthPct, growth_multiplier: growthMult,
        maturity_multiplier: maturityMult, breadth_multiplier: breadthMult, age_days: age,
      },
    };
  });
  board.sort((left, right) => right.implied_value_usd - left.implied_value_usd || compareSlug(left, right));
  board.forEach((row, index) => { row.rank = index + 1; });
  const rows: RadarRow[] = board.map(row => ({
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, listed_at: row.listed_at, age_days: row.age_days,
    implied_value_usd: row.implied_value_usd, implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd, on_watchlist: row.on_watchlist, confidence: row.confidence,
    multiple: row.model.category_multiple, category_sample: row.model.category_sample,
    category_basis: row.model.category_basis, growth_pct: row.model.growth_pct,
    farm: farmPlan(row, row.age_days, row.on_watchlist),
  }));
  const live: LiveRow[] = [...calibration.live]
    .sort((left, right) => right.mcap_usd! - left.mcap_usd! || compareSlug(left, right)).slice(0, 40)
    .map(protocol => ({
      slug: protocol.slug, name: protocol.name, category: protocol.category, chains: protocol.chains,
      tvl_usd: protocol.tvl_usd, mcap_usd: protocol.mcap_usd, change_7d: protocol.change_7d,
      multiple: protocol.tvl_usd > 0 ? protocol.mcap_usd! / protocol.tvl_usd : null,
      listed_at: protocol.listed_at, age_days: ageDays(protocol.listed_at, snapshot.as_of), symbol: protocol.symbol,
    }));
  return { board, radar: {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model: { ...model }, model_version: MODEL_VERSION, watchlist_size: watchlist.size,
    board_size: board.length, early_size: early.length, live_size: calibration.live.length,
    universe_size: snapshot.protocols.length, live_tokens: calibration.live.length,
    global_median_multiple: calibration.global, global_sample: calibration.sample,
    categories: [...calibration.categories.values()].sort((left, right) => right.sample - left.sample ||
      (left.category < right.category ? -1 : left.category > right.category ? 1 : 0)).slice(0, 20),
    rows, live,
  } };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return 'Board must contain 100..4000 rows';
  const known = new Set(snapshot.protocols.map(protocol => protocol.slug));
  const seen = new Set<string>();
  let previous = Infinity;
  for (const [index, row] of board.entries()) {
    if (row.rank !== index + 1) return 'Rank out of order';
    if (!known.has(row.slug)) return `Unknown slug: ${row.slug}`;
    if (seen.has(row.slug)) return `Duplicate slug: ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 1e14) {
      return `Invalid implied value: ${row.slug}`;
    }
    if (row.implied_value_usd > previous) return 'Implied values rise with rank';
    previous = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) return 'Invalid farm step count';
    if (row.farm_steps.some(step => typeof step !== 'string' || step.length < 20 || step.length > 600)) return 'Invalid farm step length';
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `Missing watchlist slug: ${slug}`;
  if (board.every(row => row.implied_value_usd === board[0]!.implied_value_usd)) return 'Every implied value is identical';
  return null;
}
export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
export function describeModel(): string {
  return `${MODEL_VERSION} calibrates category medians and nearest-rank quartiles from at least ${MODEL.cat_min_samples} live samples, clamps multiples to ${MODEL.mult_floor}–${MODEL.mult_cap}, weights growth ${MODEL.growth_weight} within ${MODEL.growth_floor}..${MODEL.growth_cap}%, applies maturity ${MODEL.maturity_floor}+${MODEL.maturity_range} over ${MODEL.maturity_days} days (unknown ${MODEL.unknown_age_days}), and adds ${MODEL.chain_weight} per extra chain up to ${MODEL.chain_cap}.`;
}
