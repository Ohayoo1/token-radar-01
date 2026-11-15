export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: SnapshotProtocol[]; watchlist: string[] }
export const MODEL = { growth_weight: 0.5, growth_floor: -60, growth_cap: 120, maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095, unknown_age_days: 365, mult_floor: 0.05, mult_cap: 12, cat_min_samples: 8, chain_weight: 0.05, chain_cap: 4 };
export type ModelConstants = typeof MODEL;
export type BoardRow = SnapshotProtocol & { rank: number; implied_value_usd: number; farm_steps: string[]; [key: string]: any };
export interface RadarData { [key: string]: any }
export class SnapshotError extends Error {}
const category = (p: SnapshotProtocol) => p.category ?? 'Uncategorised';
const pre = (p: SnapshotProtocol) => !p.mcap_usd && !p.gecko_id && !p.symbol;
const live = (p: SnapshotProtocol) => !!(p.gecko_id || p.symbol) && (p.mcap_usd ?? 0) > 0;
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function ageDays(p: SnapshotProtocol, asof: string): number | null {
  const a = p.listed_at ? Date.parse(p.listed_at) : NaN, b = Date.parse(asof);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b-a)/86400000)) : null;
}
export function parseSnapshot(text: string): Snapshot {
  const fail = (s: string): never => { throw new SnapshotError(s); };
  let s: any;
  try { s = JSON.parse(text); } catch { fail('Invalid JSON'); }
  if (!s || typeof s.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.as_of) || !Number.isFinite(Date.parse(s.as_of)) || new Date(s.as_of).toISOString().slice(0,10) !== s.as_of) fail('Invalid as_of');
  if (typeof s.source !== 'string' || !s.source.trim() || !Number.isFinite(s.floor_usd) || s.floor_usd <= 0) fail('Invalid source or floor');
  if (!Array.isArray(s.protocols) || !s.protocols.length || !Array.isArray(s.watchlist) || !s.watchlist.length) fail('Empty protocols or watchlist');
  const slugs = new Set<string>();
  for (const p of s.protocols) {
    if (!p || typeof p.slug !== 'string' || !p.slug || /\s/.test(p.slug) || slugs.has(p.slug)) fail('Invalid or duplicate slug');
    slugs.add(p.slug);
    if (typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.tvl_usd) || p.tvl_usd < 0 || !Array.isArray(p.chains) || p.chains.some((c: any) => typeof c !== 'string')) fail('Invalid protocol');
    for (const k of ['category','listed_at','gecko_id','symbol']) if (p[k] !== null && typeof p[k] !== 'string') fail('Invalid '+k);
    for (const k of ['change_7d','mcap_usd']) if (p[k] !== null && !Number.isFinite(p[k])) fail('Invalid '+k);
  }
  if (s.watchlist.some((v: any) => typeof v !== 'string' || !slugs.has(v))) fail('Unknown watchlist slug');
  return s;
}
export interface FarmStep { action: string; cost: string; time: string }
export function farmPlan(p: SnapshotProtocol, age: number | null, onWatchlist: boolean): FarmStep[] {
  const capital = Math.max(25, Math.round(Math.sqrt(p.tvl_usd)/45));
  const gas = Math.max(1, Math.round(Math.log10(1+p.tvl_usd) * (p.chains.includes('Ethereum') ? 1.7 : 0.3)));
  const hold = Math.round(21 + Math.log10(1+p.tvl_usd)*3 + Math.min(age ?? 365,1095)/55);
  const c = category(p).toLowerCase();
  const activity = /dex|amm/.test(c) ? 'Swap a small amount weekly and supply a balanced liquidity pair; track impermanent loss' : /perp|derivative/.test(c) ? 'Place a small unlevered trade weekly; monitor funding and liquidation distance' : /lend|cdp/.test(c) ? 'Supply collateral and borrow a small amount weekly; maintain a conservative health factor' : /yield|vault/.test(c) ? 'Deposit into a transparent vault and review harvests and withdrawal liquidity weekly' : /rwa/.test(c) ? 'Check eligibility and redemption terms, then supply an eligible asset and review issuer reports weekly' : /staking|restaking/.test(c) ? 'Stake a small position and review validator health, slashing exposure and exit queues weekly' : /bridge/.test(c) ? 'Bridge a small amount to a supported destination weekly and verify final settlement' : /launchpad/.test(c) ? 'Review a launch allocation weekly and participate only after checking vesting terms' : /nft|gaming|prediction/.test(c) ? 'Use one market or game weekly with a small budget; record fees and outcomes' : 'Supply a supported asset or perform a small native transaction weekly; review receipts';
  return [
    { action: `Fund one wallet on ${p.chains[0] ?? 'a supported chain'} for ${p.name}`, cost: `$${capital}–$${Math.round(capital*1.8)} capital; reserve $${gas}–$${gas*3} gas`, time: 'Before starting' },
    { action: 'Verify official contracts, supported assets and withdrawal terms; test a small deposit and withdrawal', cost: `$${gas} estimated gas`, time: 'First session' },
    { action: activity, cost: `$${Math.max(5,Math.round(capital*.1))} working amount plus fees`, time: 'Once per week' },
    { action: 'Keep the core position open and inspect balances and rewards without unnecessary turnover', cost: `$${capital} remains exposed to protocol risk`, time: `Hold for ${hold} days` },
    { action: 'Watch TVL changes, audits, admin permissions, asset pegs and exit liquidity; reduce exposure if conditions deteriorate', cost: 'Monitoring time; exit gas if needed', time: 'Review weekly and after alerts' },
    { action: 'Use one consistent wallet and one economically meaningful position; avoid circular transfers or duplicate accounts', cost: 'No extra capital', time: 'Throughout participation' },
    { action: `Record deposits, fees and exits; ${onWatchlist ? 'review this watchlist position' : 'reassess this early protocol'} before renewing`, cost: `$${gas}–$${gas*3} exit reserve`, time: `After ${hold} days; participation never guarantees a token` }
  ];
}
export function stepText(s: FarmStep): string { return `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.slice(0,600).padEnd(20,' '); }
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  // Observed live-token ratios calibrate valuations instead of assuming a universal multiple.
  const peers = snapshot.protocols.filter(p => live(p) && p.tvl_usd > 0);
  const groups = new Map<string, number[]>();
  for (const p of peers) { const k = category(p); groups.set(k, [...(groups.get(k) ?? []), p.mcap_usd! / p.tvl_usd]); }
  const quantile = (xs: number[], q: number) => clamp(xs.length ? [...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*q)-1)] : model.mult_floor, model.mult_floor, model.mult_cap);
  const all = peers.map(p => p.mcap_usd!/p.tvl_usd), global = quantile(all,.5);
  const categories = [...groups].map(([category,x]) => ({ category, sample:x.length, median_multiple:quantile(x,.5), p25_multiple:quantile(x,.25), p75_multiple:quantile(x,.75) })).sort((a,b)=>b.sample-a.sample || cmp(a.category,b.category));
  const watch = new Set(snapshot.watchlist);
  const early = snapshot.protocols.filter(p=>!watch.has(p.slug) && pre(p) && p.tvl_usd < snapshot.floor_usd && p.category !== 'CEX' && !/\s(?:v?\d+(?:\.\d+)*)$/i.test(p.name)).sort((a,b)=>b.tvl_usd-a.tvl_usd || cmp(a.slug,b.slug)).slice(0,260);
  const selected = [...snapshot.protocols.filter(p=>watch.has(p.slug)), ...early];
  const board: BoardRow[] = selected.map(p => {
    const stats = categories.find(c=>c.category===category(p)), sample = stats?.sample ?? 0;
    const qualified = sample >= model.cat_min_samples;
    const multiple = qualified ? stats!.median_multiple : global;
    const low = qualified ? stats!.p25_multiple : global*.6, high = qualified ? stats!.p75_multiple : global*1.6;
    const age = ageDays(p,snapshot.as_of), growth = clamp(p.change_7d ?? 0,model.growth_floor,model.growth_cap);
    // Growth adjusts recent momentum; maturity discounts short histories; breadth rewards chain coverage.
    const gm = 1+growth/100*model.growth_weight;
    const mm = model.maturity_floor+Math.min(age ?? model.unknown_age_days,model.maturity_days)/model.maturity_days*model.maturity_range;
    const bm = 1+model.chain_weight*Math.min(Math.max(p.chains.length-1,0),model.chain_cap);
    const value = (m: number) => Math.max(1,Math.round(p.tvl_usd*m*gm*mm*bm));
    return { ...p, rank:0, token_status:'pre-token', age_days:age, implied_value_usd:value(multiple), implied_low_usd:value(low), implied_high_usd:value(high), on_watchlist:watch.has(p.slug), confidence:sample>=40 && age!==null ? 'high' : sample>=15 ? 'medium' : 'low', farm_steps:farmPlan(p,age,watch.has(p.slug)).map(stepText), model:{ model_version:'radar-2-calibrated', category_multiple:multiple, category_sample:sample, category_basis:qualified ? `live ${category(p)} protocols` : 'live-token protocols across the snapshot', low_multiple:low, high_multiple:high, growth_pct:growth, growth_multiplier:gm, maturity_multiplier:mm, breadth_multiplier:bm, age_days:age } };
  }).sort((a,b)=>b.implied_value_usd-a.implied_value_usd || cmp(a.slug,b.slug));
  board.forEach((r,i)=>r.rank=i+1);
  const liveRows = snapshot.protocols.filter(live).sort((a,b)=>b.mcap_usd!-a.mcap_usd! || cmp(a.slug,b.slug));
  const radar = { as_of:snapshot.as_of, source:snapshot.source, floor_usd:snapshot.floor_usd, model, model_version:'radar-2-calibrated', watchlist_size:watch.size, board_size:board.length, early_size:early.length, live_size:liveRows.length, universe_size:snapshot.protocols.length, live_tokens:liveRows.length, global_median_multiple:global, global_sample:all.length, categories:categories.slice(0,20), rows:board.map(r=>({ ...r, multiple:r.model.category_multiple, category_sample:r.model.category_sample, category_basis:r.model.category_basis, growth_pct:r.model.growth_pct, farm:farmPlan(r,r.age_days,r.on_watchlist) })), live:liveRows.slice(0,40).map(p=>({...p, multiple:p.tvl_usd>0?p.mcap_usd!/p.tvl_usd:0, age_days:ageDays(p,snapshot.as_of)})) };
  return { board, radar };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length<100 || board.length>4000) return 'Row count out of bounds';
  const known = new Set(snapshot.protocols.map(p=>p.slug)), seen = new Set<string>();
  for (let i=0;i<board.length;i++) {
    const r=board[i];
    if (r.rank!==i+1) return 'Rank out of order';
    if (!known.has(r.slug)) return 'Unknown slug';
    if (seen.has(r.slug)) return 'Duplicate slug';
    seen.add(r.slug);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd<=0 || r.implied_value_usd>1e14) return 'Invalid implied value';
    if (i && r.implied_value_usd>board[i-1].implied_value_usd) return 'Values rise';
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length<3 || r.farm_steps.length>12) return 'Invalid farm steps';
    if (r.farm_steps.some(s=>typeof s!=='string' || s.length<20 || s.length>600)) return 'Invalid step length';
  }
  if (snapshot.watchlist.some(s=>!seen.has(s))) return 'Missing watchlist slug';
  if (new Set(board.map(r=>r.implied_value_usd)).size===1) return 'Identical values';
  return null;
}
export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
export function describeModel(): string { return `Calibrated live-token multiples with constants ${JSON.stringify(MODEL)} adjust TVL for growth, maturity and chain breadth.`; }
