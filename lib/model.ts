// The token launch radar's model: one sealed snapshot in, one ranked board out.
//
// What it answers: if a protocol's record stayed as it is, what would a token be worth, and what
// should a reader do to farm the protocol before or after it issues one. It never predicts whether
// or when a token is issued.
//
// The value model is calibrated from the snapshot itself, not from a hardcoded list of names:
//
//   multiple  = median(mcap_usd / tvl_usd) over the snapshot's LIVE-token protocols in the same
//               category (at least CAT_MIN_SAMPLES of them), else the whole live set's median,
//               clamped to [MULT_FLOOR, MULT_CAP]. The protocols whose token already trades are
//               the market's own answer to "what is this category worth per dollar of TVL", so a
//               pre-token protocol in that category is priced off its peers, not off a constant.
//   growth    = 1 + clamp(change_7d, -60, 120) / 100 x GROWTH_WEIGHT   (momentum, damped)
//   maturity  = 0.6 + min(age_days, 1095) / 1095 x 0.4                 (a protocol that has run
//               longer with no token has accumulated more usage a token would capture; a protocol
//               the snapshot gives no listing date falls back to UNKNOWN_AGE_DAYS)
//   breadth   = 1 + 0.05 x min(chains - 1, 4)                          (extra chains, extra flow)
//   implied   = max(1, round(tvl_usd x multiple x growth x maturity x breadth))
//
// The band (implied_low_usd, implied_high_usd) is the same formula with the category's 25th and
// 75th percentile multiple: the range the peers of that category actually price, so the board
// states its own uncertainty instead of one bare number.
//
// Every row also carries the arithmetic that produced it (base, multiple, growth, maturity,
// breadth, sample size), so the dashboard can show its work and a reader can redo the sum.

/** The snapshot's protocol entry: the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the dashboard prints them and the page's sandbox can change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  mult_floor: number;
  mult_cap: number;
  cat_min_samples: number;
  chain_weight: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  mult_floor: 0.05,
  mult_cap: 12,
  cat_min_samples: 8,
  chain_weight: 0.05,
  chain_cap: 4,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'radar-2-calibrated';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: what to do, what it costs, and how long it takes. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the arithmetic behind its value. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  on_watchlist: boolean;
  confidence: 'high' | 'medium' | 'low';
  model: {
    model_version: string;
    category_multiple: number;
    category_sample: number;
    category_basis: string;
    low_multiple: number;
    high_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the same figures, with its farm plan as steps. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  on_watchlist: boolean;
  confidence: 'high' | 'medium' | 'low';
  multiple: number;
  category_sample: number;
  category_basis: string;
  growth_pct: number;
  farm: FarmStep[];
}

/** A live-token protocol: its token trades, so the snapshot's own market value is the evidence. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  multiple: number;
  listed_at: string | null;
  age_days: number | null;
  symbol: string | null;
}

/** The category evidence the model calibrated from, stated on the page. */
export interface CategoryStat {
  category: string;
  sample: number;
  median_multiple: number;
  p25_multiple: number;
  p75_multiple: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  universe_size: number;
  live_tokens: number;
  global_median_multiple: number;
  global_sample: number;
  categories: CategoryStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The middle of a sorted-number list (the mean of the two middles when it is even). */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The value at `q` of a sorted list, nearest-rank, clamped into the list. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[at]!;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol records a token that trades, with a market cap to price it by. */
export function isLiveToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null ? p.mcap_usd !== null && p.mcap_usd > 0 : false;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One live-token protocol's market multiple: its market cap over its TVL. */
function liveMultiple(p: SnapshotProtocol): number | null {
  if (!isLiveToken(p) || p.tvl_usd <= 0 || p.mcap_usd === null) return null;
  const m = p.mcap_usd / p.tvl_usd;
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** The calibration: per-category multiples observed among the snapshot's live-token protocols. */
export interface Calibration {
  byCategory: Map<string, { median: number; p25: number; p75: number; sample: number }>;
  globalMedian: number;
  globalSample: number;
  stats: CategoryStat[];
}

/**
 * Read every live-token protocol's mcap/TVL multiple, group it by category, and keep the median
 * and the interquartile range of each group with enough members. This is the model's only source
 * of multiples: the market's own pricing inside the same snapshot, never a constant.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    const m = liveMultiple(p);
    if (m === null) continue;
    all.push(m);
    const key = p.category ?? 'Uncategorised';
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [m]);
    else list.push(m);
  }
  all.sort((a, b) => a - b);
  const byCategory = new Map<string, { median: number; p25: number; p75: number; sample: number }>();
  const stats: CategoryStat[] = [];
  for (const [category, list] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a - b);
    if (list.length < model.cat_min_samples) continue;
    const entry = {
      median: clamp(median(list), model.mult_floor, model.mult_cap),
      p25: clamp(quantile(list, 0.25), model.mult_floor, model.mult_cap),
      p75: clamp(quantile(list, 0.75), model.mult_floor, model.mult_cap),
      sample: list.length,
    };
    byCategory.set(category, entry);
    stats.push({ category, sample: entry.sample, median_multiple: round4(entry.median), p25_multiple: round4(entry.p25), p75_multiple: round4(entry.p75) });
  }
  return {
    byCategory,
    globalMedian: clamp(median(all), model.mult_floor, model.mult_cap),
    globalSample: all.length,
    stats,
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The multipliers and the implied value one pre-token protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  lowMultiple: number;
  highMultiple: number;
  sample: number;
  basis: string;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const cat = protocol.category === null ? null : calibration.byCategory.get(protocol.category);
  const multiple = cat?.median ?? calibration.globalMedian;
  const lowMultiple = cat?.p25 ?? calibration.globalMedian * 0.6;
  const highMultiple = cat?.p75 ?? calibration.globalMedian * 1.6;
  const sample = cat?.sample ?? calibration.globalSample;
  const basis = cat === undefined ? 'live-token protocols across the snapshot' : `live ${protocol.category ?? 'Uncategorised'} protocols`;

  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;

  const breadthMult = 1 + model.chain_weight * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);

  const value = (m: number): number =>
    Math.max(1, Math.round(protocol.tvl_usd * m * growthMult * maturityMult * breadthMult));

  return {
    implied: value(multiple),
    low: value(lowMultiple),
    high: value(highMultiple),
    multiple,
    lowMultiple,
    highMultiple,
    sample,
    basis,
    growthPct,
    growthMult,
    maturityMult,
    breadthMult,
    age,
  };
}

/** The headline sentence's figures. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..n. The watchlist is the floor and
 * is covered whole; the early radar adds pre-token protocols below the floor, which is where a
 * launch is cheapest to farm.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, calibration: Calibration = calibrate(snapshot, model)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model, calibration) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watch = new Set(snapshot.watchlist);
  return scored.map((s, i) => {
    const v = s.v;
    const confidence: 'high' | 'medium' | 'low' =
      v.sample >= 40 && v.age !== null ? 'high' : v.sample >= 15 ? 'medium' : 'low';
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: v.age,
      implied_value_usd: v.implied,
      implied_low_usd: v.low,
      implied_high_usd: v.high,
      on_watchlist: watch.has(s.p.slug),
      confidence,
      model: {
        model_version: MODEL_VERSION,
        category_multiple: round4(v.multiple),
        category_sample: v.sample,
        category_basis: v.basis,
        low_multiple: round4(v.lowMultiple),
        high_multiple: round4(v.highMultiple),
        growth_pct: round4(v.growthPct),
        growth_multiplier: round4(v.growthMult),
        maturity_multiplier: round4(v.maturityMult),
        breadth_multiplier: round4(v.breadthMult),
        age_days: v.age,
      },
      farm_steps: farmPlan(s.p, v.age, watch.has(s.p.slug)).map(stepText),
    };
  });
}

/** A step as one string: the action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A dollar figure as a reader reads it: $1.2M, $840K, $12. */
function usd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** A gas band for the protocol's chains: a cheap chain costs a few dollars, a busy one more. */
function gasBand(p: SnapshotProtocol): string {
  const cheap = p.chains.some((c) => /Base|Arbitrum|Optimism|Polygon|Solana|BSC|Avalanche|Sonic|Blast|Linea|Scroll|Mantle/.test(c));
  return cheap ? '$2-5 in gas per transaction' : '$8-20 in gas per transaction';
}

/** The capital a reader would need to earn a meaningful share of a protocol's incentives. */
function capitalBand(tvl: number): { text: string; size: number } {
  const size = tvl >= 2_000_000_000 ? 5_000 : tvl >= 500_000_000 ? 2_000 : tvl >= 100_000_000 ? 1_000 : 300;
  return { text: `$${size.toLocaleString('en-US')}-$${(size * 2).toLocaleString('en-US')} of capital`, size };
}

/** How long a position has to sit to count for most points programmes. */
function holdBand(ageDays_: number | null): string {
  if (ageDays_ === null) return '4-8 weeks';
  return ageDays_ > 730 ? '3-6 months' : '4-8 weeks';
}

/** Category-specific actions: what a reader actually does inside this kind of protocol. */
function categoryActions(category: string | null): { lend: string; trade: string; extra: string } {
  const c = (category ?? '').toLowerCase();
  if (/dex|amm|decentralized exchange/.test(c)) {
    return {
      lend: 'supply both sides of the deepest pool so the position earns swap fees as well as any points',
      trade: 'swap a small size back and forth each week so the wallet shows real volume, not one round trip',
      extra: 'keep a second wallet-free position in the pool instead of splitting across many addresses, which points programmes filter as sybil',
    };
  }
  if (/perp|derivative|options/.test(c)) {
    return {
      lend: 'deposit margin collateral and keep it there so the account carries open interest across weeks',
      trade: 'open and close a small position each week in the deepest market, sizing so the round trip loses under 1% to fees and funding',
      extra: 'leave a small open position running rather than flat, since volume-only accounts score lower than accounts with open interest',
    };
  }
  if (/lending|cdp|money market/.test(c)) {
    return {
      lend: 'supply a stablecoin into the deepest market and borrow a small share back against it to show both sides of the book',
      trade: 'keep the borrow above zero but well under the liquidation line, and repay nothing until the campaign ends',
      extra: 'avoid recursive looping beyond two rounds, which most lending points programmes discount and liquidation risks',
    };
  }
  if (/yield|vault|aggregator|farming/.test(c)) {
    return {
      lend: 'deposit into the flagship vault whose strategy you can read, not the highest advertised APY',
      trade: 'compound the position weekly rather than daily, so gas stays a small share of the yield',
      extra: 'check the vaults are the protocol’s own and not a third-party strategy it merely lists',
    };
  }
  if (/rwa|real world|treasur/.test(c)) {
    return {
      lend: 'complete the protocol’s eligibility check first, since tokenised credit usually needs an accredited or non-US attestation',
      trade: 'mint or subscribe the smallest permitted size and hold it, because these programmes score holdings rather than volume',
      extra: 'keep the paperwork the protocol issues, which is what its own snapshot of holders will be built from',
    };
  }
  if (/liquid staking|restaking|staking/.test(c)) {
    return {
      lend: 'stake the native token through the protocol’s own contract rather than a third-party wrapper, so the receipt counts',
      trade: 'hold the receipt token instead of selling it, since the points follow the staked balance and its age',
      extra: 'restake only if the protocol names the operator set, and check the unbonding period before committing size',
    };
  }
  if (/bridge|cross-chain/.test(c)) {
    return {
      lend: 'bridge a stablecoin both ways once so both sides of the route show a balance',
      trade: 'leave the balance on the destination chain for weeks rather than round-tripping the same day',
      extra: 'use the protocol’s own route, not an aggregator, so the volume is attributed to it',
    };
  }
  if (/launchpad|incubator|ido/.test(c)) {
    return {
      lend: 'stake the platform token the launchpad requires for allocation tiers, if it records one',
      trade: 'keep the stake through the allocation snapshot rather than entering on the day of a sale',
      extra: 'track the platform’s own queue, since allocation is usually first-come and time-weighted',
    };
  }
  if (/nft|marketplace|gaming|social|prediction/.test(c)) {
    return {
      lend: 'use the product weekly with a small budget rather than one large transaction',
      trade: 'repeat the action a programme counts, such as a trade, a market or a game, at a steady weekly size',
      extra: 'read the programme’s own rules on which actions count before spending, since most exclude wash activity',
    };
  }
  return {
    lend: 'supply a stablecoin or the chain’s native asset into the protocol’s deepest market and keep it there',
    trade: 'use the protocol once a week at a small, steady size so the wallet shows habit rather than one deposit',
    extra: 'check the protocol records your position on chain, since a programme can only score what it can see',
  };
}

/**
 * The farm plan for one protocol: concrete steps, each with what it costs and how long it takes.
 * It follows the protocol's own record (category, chains, TVL, how long it has run with no token),
 * never a name.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, onWatchlist: boolean): FarmStep[] {
  const acts = categoryActions(p.category);
  const cap = capitalBand(p.tvl_usd);
  const gas = gasBand(p);
  const chain = firstChain(p);
  const hold = holdBand(age);
  const size = cap.size;
  const steps: FarmStep[] = [];

  steps.push({
    action: `Open the protocol's own page and its docs and confirm today that it records no token${p.symbol === null ? ' and no ticker' : ''}; write down the claim route it names, because ${onWatchlist ? 'it is on the watchlist at' : 'it sits below the watchlist floor at'} ${usd(p.tvl_usd)} of TVL and the plan changes if a token is announced.`,
    cost: 'no cost',
    time: '15-20 minutes, once',
  });
  steps.push({
    action: `Fund a fresh wallet on ${chain} with the gas asset and ${cap.text}; keep it separate from wallets you use elsewhere so one position is not split across addresses a points programme reads as sybil.`,
    cost: `${gas}, plus the capital you are willing to lock`,
    time: '20-30 minutes, once',
  });
  steps.push({
    action: `Then ${acts.lend}, sized at ${usd(size)} to ${usd(size * 2)} so the position is meaningful against ${usd(p.tvl_usd)} of protocol TVL without being the liquidity.`,
    cost: `${usd(size)}-${usd(size * 2)} locked, plus ${gas}`,
    time: '30-60 minutes, once',
  });
  steps.push({
    action: `After that ${acts.trade}; a ${usd(Math.max(50, Math.round(size / 10)))} weekly size is enough to register and small enough that fees do not eat the position.`,
    cost: `${usd(Math.max(50, Math.round(size / 10)))} per week plus ${gas}`,
    time: '10-20 minutes, weekly',
  });
  steps.push({
    action: `Hold the position for ${hold}${age === null ? ' (the snapshot records no listing date, so treat the protocol as young)' : ` (the snapshot has tracked it ${age.toLocaleString('en-US')} days)`}, and do not withdraw to chase a second campaign; the age of the balance is what most programmes weight.`,
    cost: 'no extra cost, capital stays locked',
    time: hold,
  });
  steps.push({
    action: `Watch for the protocol's own announcement of a token or points programme and re-read its terms the day it lands; ${p.category === null ? 'the snapshot records no category for it' : `it is filed as ${p.category}`}, so copy the qualification rules from its own docs rather than a third-party thread.`,
    cost: 'no cost, 10 minutes a week',
    time: '10 minutes, weekly',
  });
  steps.push({
    action: `Finally ${acts.extra}, and record what you did and when in one place: if the protocol opens a claim, its snapshot of holders decides who is paid.`,
    cost: 'no cost beyond the position',
    time: '15 minutes, once',
  });
  return steps;
}

/** The compact rows the dashboard renders, in board order. */
export function radarRows(board: BoardRow[], snapshot: Snapshot): RadarRow[] {
  const index = bySlug(snapshot.protocols);
  return board.map((r) => {
    const p = index.get(r.slug)!;
    return {
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      implied_low_usd: r.implied_low_usd,
      implied_high_usd: r.implied_high_usd,
      on_watchlist: r.on_watchlist,
      confidence: r.confidence,
      multiple: r.model.category_multiple,
      category_sample: r.model.category_sample,
      category_basis: r.model.category_basis,
      growth_pct: r.model.growth_pct,
      farm: farmPlan(p, r.age_days, r.on_watchlist),
    };
  });
}

/** The live-token protocols, strongest market cap first: the market's own side of the board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => liveMultiple(p) !== null && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
      change_7d: p.change_7d,
      multiple: round4(liveMultiple(p) ?? 0),
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      symbol: p.symbol,
    }));
}

/** The board and the dashboard's data, from one snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, model, calibration);
  const live = liveRows(snapshot);
  const rows = radarRows(board, snapshot);
  const watch = new Set(snapshot.watchlist);
  const liveTokens = snapshot.protocols.filter((p) => isLiveToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: rows.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    universe_size: snapshot.protocols.length,
    live_tokens: liveTokens,
    global_median_multiple: round4(calibration.globalMedian),
    global_sample: calibration.globalSample,
    categories: calibration.stats.slice(0, 20),
    rows,
    live,
  };
  return { board, radar };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** Why a board the model wrote would fail the gate, or null when it would pass. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  if (board.length > 4000) return `the board holds ${board.length} rows, over the gate's 4000`;
  const listed = new Set(snapshot.protocols.map((p) => p.slug));
  const watch = new Set(snapshot.watchlist);
  const seen = new Set<string>();
  const values = new Set<number>();
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `${r.slug} is at ${i + 1} with rank ${r.rank}`;
    if (!listed.has(r.slug)) return `${r.slug} is not a protocol the snapshot lists`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    values.add(r.implied_value_usd);
    if (i > 0 && board[i - 1]!.implied_value_usd < r.implied_value_usd) return `${r.slug} rises above the row before it`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} is past the gate's value cap`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  for (const slug of watch) if (!seen.has(slug)) return `the watchlist's ${slug} is missing`;
  if (values.size === 1) return 'every row has the same implied value, so the board ranks nothing';
  return null;
}

/**
 * The snapshot out of a file's text, refused unless it is the shape the model scores. A field the
 * snapshot must carry is kept strict: a board built on a misread protocol is worse than no board.
 */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('the snapshot is not JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('the snapshot is not an object');
  const doc = raw as Record<string, unknown>;
  const asOf = doc.as_of;
  const source = doc.source;
  const floor = doc.floor_usd;
  const protocols = doc.protocols;
  const watchlist = doc.watchlist;
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new SnapshotError('as_of is not a UTC day');
  if (typeof source !== 'string' || source.length === 0) throw new SnapshotError('source is missing');
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0) throw new SnapshotError('floor_usd is not a number');
  if (!Array.isArray(protocols) || protocols.length === 0) throw new SnapshotError('protocols is not a non-empty array');
  if (!Array.isArray(watchlist) || watchlist.length === 0) throw new SnapshotError('watchlist is not a non-empty array');

  const out: SnapshotProtocol[] = [];
  const seen = new Set<string>();
  for (const entry of protocols) {
    if (typeof entry !== 'object' || entry === null) throw new SnapshotError('a protocol is not an object');
    const p = entry as Record<string, unknown>;
    const slug = p.slug;
    const name = p.name;
    const tvl = p.tvl_usd;
    if (typeof slug !== 'string' || slug.length === 0 || /\s/.test(slug)) throw new SnapshotError(`a protocol has slug ${String(slug)}`);
    if (seen.has(slug)) throw new SnapshotError(`${slug} appears twice`);
    seen.add(slug);
    if (typeof name !== 'string' || name.length === 0) throw new SnapshotError(`${slug} has no name`);
    if (typeof tvl !== 'number' || !Number.isFinite(tvl) || tvl < 0) throw new SnapshotError(`${slug} has tvl_usd ${String(tvl)}`);
    const chains = Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [];
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
    out.push({
      slug,
      name,
      category: str(p.category),
      chains,
      tvl_usd: tvl,
      change_7d: num(p.change_7d),
      mcap_usd: num(p.mcap_usd),
      listed_at: str(p.listed_at),
      gecko_id: str(p.gecko_id),
      symbol: str(p.symbol),
    });
  }
  const watch = watchlist.filter((s): s is string => typeof s === 'string');
  for (const slug of watch) if (!seen.has(slug)) throw new SnapshotError(`the watchlist names ${slug}, which protocols does not carry`);
  return { as_of: asOf, source, floor_usd: floor, protocols: out, watchlist: watch };
}
