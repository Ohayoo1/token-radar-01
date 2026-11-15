export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: SnapshotProtocol[]; watchlist: string[] }
export interface ModelConstants {
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number; unknown_age_days: number;
  mult_floor: number; mult_cap: number; cat_min_samples: number; chain_weight: number; chain_cap: number;
}
export const MODEL: ModelConstants = { growth_weight: 0.5, growth_floor: -60, growth_cap: 120, maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095, unknown_age_days: 365, mult_floor: 0.05, mult_cap: 12, cat_min_samples: 8, chain_weight: 0.05, chain_cap: 4 };
export class SnapshotError extends Error {}
type FarmStep = { action: string; cost: string; time: string };
export interface BoardRow {
  slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[];
  category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null; token_status: 'pre-token'; age_days: number | null;
  implied_low_usd: number; implied_high_usd: number; on_watchlist: boolean; confidence: string;
  model: Record<string, unknown>;
}
export interface RadarData { [key: string]: any }
const day = 86400000;
const dateOK = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const median = (a: number[]) => quantile(a, 0.5);
function quantile(values: number[], q: number): number { const a = [...values].sort((x, y) => x - y); return a[Math.max(0, Math.ceil(q * a.length) - 1)]!; }
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const category = (p: SnapshotProtocol) => p.category ?? 'Uncategorised';
function ageDays(listed: string | null, asOf: string): number | null { if (!listed || !dateOK(listed) || !dateOK(asOf)) return null; return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listed}T00:00:00Z`)) / day)); }
function preToken(p: SnapshotProtocol): boolean { return p.mcap_usd == null && p.gecko_id == null && p.symbol == null; }
function liveToken(p: SnapshotProtocol): boolean { return (p.gecko_id != null || p.symbol != null) && (p.mcap_usd ?? 0) > 0; }

/** A market multiple is calibrated from this sealed snapshot's traded peers, not assumed from a category label. */
export function parseSnapshot(text: string): Snapshot {
  let raw: any; try { raw = JSON.parse(text); } catch { throw new SnapshotError('input is not valid JSON'); }
  if (!raw || typeof raw !== 'object' || !dateOK(raw.as_of)) throw new SnapshotError('as_of must be a valid YYYY-MM-DD date');
  if (typeof raw.source !== 'string' || !raw.source.trim()) throw new SnapshotError('source is required');
  if (!(typeof raw.floor_usd === 'number' && raw.floor_usd > 0)) throw new SnapshotError('floor_usd must be positive');
  if (!Array.isArray(raw.protocols) || raw.protocols.length === 0 || !Array.isArray(raw.watchlist) || raw.watchlist.length === 0) throw new SnapshotError('protocols and watchlist must be non-empty');
  const seen = new Set<string>();
  for (const p of raw.protocols) {
    if (!p || typeof p.slug !== 'string' || !p.slug || /\s/.test(p.slug) || seen.has(p.slug)) throw new SnapshotError('protocol slugs must be unique and contain no whitespace');
    seen.add(p.slug);
    if (typeof p.name !== 'string' || !p.name.trim() || !(typeof p.tvl_usd === 'number') || p.tvl_usd < 0) throw new SnapshotError(`invalid protocol ${p.slug}`);
  }
  for (const s of raw.watchlist) if (typeof s !== 'string' || !seen.has(s)) throw new SnapshotError(`watchlist slug missing from protocols: ${s}`);
  return raw as Snapshot;
}

function family(c: string): string {
  const x = c.toLowerCase();
  if (/dex|amm|exchange/.test(x)) return 'DEX/AMM'; if (/perp|derivative/.test(x)) return 'perps/derivatives';
  if (/lend|cdp|借/.test(x)) return 'lending/CDP'; if (/yield|vault/.test(x)) return 'yield/vaults';
  if (/rwa|real world/.test(x)) return 'RWA'; if (/restak|staking/.test(x)) return 'staking/restaking';
  if (/bridge/.test(x)) return 'bridge'; if (/launchpad/.test(x)) return 'launchpad';
  if (/nft|gaming|prediction/.test(x)) return 'NFT/gaming/prediction'; return 'generic';
}
export function farmPlan(p: SnapshotProtocol, age: number | null, onWatchlist: boolean): FarmStep[] {
  const usd = Math.max(100, Math.round(Math.sqrt(Math.max(p.tvl_usd, 1)) * 2));
  const gas = Math.max(2, Math.round(Math.log10(Math.max(p.tvl_usd, 10))));
  const chain = p.chains[0] ?? 'a low-fee chain';
  const hold = Math.max(4, Math.min(16, Math.round((age ?? 365) / 90)));
  const plans: Record<string, string[]> = {
    'DEX/AMM': ['Fund a wallet on {chain} and make a small swap.', 'Add {usd} of two-sided liquidity to the deepest pool.', 'Make a second swap in a different pair and record the receipt.'],
    'perps/derivatives': ['Fund {chain} with collateral and open a small, low-leverage position.', 'Keep {usd} collateral posted and trade once each week.', 'Close and reopen a different market while tracking fees.'],
    'lending/CDP': ['Fund {chain} and supply {usd} of a liquid asset.', 'Borrow a conservative amount against the supply, then repay part.', 'Keep health factor well clear of liquidation and claim any position activity.'],
    'yield/vaults': ['Fund {chain} and deposit {usd} into a live vault.', 'Keep the position deposited through weekly yield checks.', 'Withdraw a portion, then redeposit after reviewing fees.'],
    RWA: ['Fund {chain} and complete the vault eligibility checks.', 'Allocate {usd} only after reviewing redemption and transfer terms.', 'Keep a single documented position and check issuer notices weekly.'],
    'staking/restaking': ['Fund {chain} and stake a modest amount of its supported asset.', 'Keep {usd} staked and monitor validator or withdrawal status.', 'Claim or restake rewards once, recording the transaction.'],
    bridge: ['Fund the source chain {chain} and bridge a small test amount.', 'Bridge {usd} across on separate weeks and retain both receipts.', 'Test the return route and monitor finality before increasing size.'],
    launchpad: ['Fund {chain} and complete one eligible profile action.', 'Commit {usd} only to an active, reviewed sale or pool.', 'Check allocation and claim status weekly; avoid repeated wallets.'],
    'NFT/gaming/prediction': ['Fund {chain} and make one genuine in-app action.', 'Spend up to {usd} across distinct weekly activities.', 'Return to the same account and record gameplay or market outcomes.'],
    generic: ['Fund {chain} with a modest amount and connect one wallet.', 'Use the core product with {usd} of working capital each week.', 'Review fees and position state before making a second product action.'],
  };
  const familySteps = plans[family(p.category ?? '')]!;
  const actions = [`Choose one wallet and keep a dated record; avoid spreading activity across wallets.`, ...familySteps, `Budget about $${gas} for gas on ${chain}; do not transact if fees exceed the position.`, `Keep the same position for ${hold} weeks and check it weekly for changes.`, onWatchlist ? 'Track official project updates and any token or points terms; no issuance date is assumed.' : 'Review official project updates monthly; no token issuance date is assumed.'];
  return actions.map((action, i) => ({ action: action.replaceAll('{chain}', chain).replaceAll('{usd}', String(usd)), cost: i === 0 ? '$0' : i === 4 ? `about $${gas} gas` : i === 5 ? `$${usd} capital at risk` : 'variable; check fees first', time: i === 0 ? 'once' : i === 5 ? `${hold} weeks` : 'weekly' }));
}
export function stepText(s: FarmStep): string { return `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.slice(0, 600).padEnd(20, ' '); }
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const protocols = snapshot.protocols, watch = new Set(snapshot.watchlist), live = protocols.filter(p => liveToken(p) && p.tvl_usd > 0).map(p => ({ p, m: p.mcap_usd! / p.tvl_usd }));
  const global = median(live.map(x => x.m)), groups = new Map<string, number[]>();
  for (const x of live) { const c = category(x.p); groups.set(c, [...(groups.get(c) ?? []), x.m]); }
  const stats = new Map<string, { n: number; med: number; lo: number; hi: number }>();
  for (const [c, vals] of groups) if (vals.length >= model.cat_min_samples) stats.set(c, { n: vals.length, med: clamp(median(vals), model.mult_floor, model.mult_cap), lo: clamp(quantile(vals, .25), model.mult_floor, model.mult_cap), hi: clamp(quantile(vals, .75), model.mult_floor, model.mult_cap) });
  const fallback = clamp(global, model.mult_floor, model.mult_cap);
  const EARLY_ROWS = 260;
  const excludedCategories = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking']);
  const eligible = protocols.filter(p => preToken(p) && !excludedCategories.has(p.category ?? '')
    && !/\b(?:wrapped|staked|staking)\b/i.test(p.name)
    && !/\s(?:v\d+(?:\.\d+)*|\d+\.\d+)$/i.test(p.name)
    && !/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(p.name));
  const early = eligible.filter(p => !watch.has(p.slug) && p.tvl_usd < snapshot.floor_usd).sort((a,b)=>b.tvl_usd-a.tvl_usd || a.slug.localeCompare(b.slug)).slice(0,EARLY_ROWS);
  const chosen = protocols.filter(p => watch.has(p.slug)).concat(early);
  const rows = chosen.map(p => {
    const c=category(p), s=stats.get(c), multiple=s?.med ?? fallback, low=s?.lo ?? fallback*.6, high=s?.hi ?? fallback*1.6;
    const age=ageDays(p.listed_at,snapshot.as_of), growth=clamp(p.change_7d ?? 0,model.growth_floor,model.growth_cap), gm=1+growth/100*model.growth_weight;
    const mm=model.maturity_floor+Math.min(age ?? model.unknown_age_days,model.maturity_days)/model.maturity_days*model.maturity_range;
    const bm=1+model.chain_weight*Math.min(Math.max(p.chains.length-1,0),model.chain_cap);
    const value=(mult:number)=>Math.max(1,Math.round(p.tvl_usd*mult*gm*mm*bm));
    const confidence=s?.n>=40&&age!==null?'high':s?.n>=15?'medium':'low';
    const basis=s ? `live ${c} protocols` : 'live-token protocols across the snapshot';
    const farm=farmPlan(p,age,watch.has(p.slug));
    return { p, age, multiple, low, high, gm, mm, bm, value:value(multiple), lowValue:value(low), highValue:value(high), confidence, basis, s, farm };
  }).sort((a,b)=>b.value-a.value || a.p.slug.localeCompare(b.p.slug));
  const board: BoardRow[]=rows.map((r,i)=>({slug:r.p.slug,name:r.p.name,rank:i+1,implied_value_usd:r.value,farm_steps:r.farm.map(stepText),category:r.p.category,chains:r.p.chains,tvl_usd:r.p.tvl_usd,change_7d:r.p.change_7d,mcap_usd:r.p.mcap_usd,listed_at:r.p.listed_at,gecko_id:r.p.gecko_id,symbol:r.p.symbol,token_status:'pre-token',age_days:r.age,implied_low_usd:r.lowValue,implied_high_usd:r.highValue,on_watchlist:watch.has(r.p.slug),confidence:r.confidence,model:{model_version:'radar-2-calibrated',category_multiple:r.multiple,category_sample:r.s?.n??0,category_basis:r.basis,low_multiple:r.low,high_multiple:r.high,growth_pct:clamp(r.p.change_7d??0,model.growth_floor,model.growth_cap),growth_multiplier:r.gm,maturity_multiplier:r.mm,breadth_multiplier:r.bm,age_days:r.age}}));
  const categories=[...stats].map(([category,s])=>({category,sample:s.n,median_multiple:s.med,p25_multiple:s.lo,p75_multiple:s.hi})).sort((a,b)=>b.sample-a.sample || a.category.localeCompare(b.category)).slice(0,20);
  const radar:RadarData={as_of:snapshot.as_of,source:snapshot.source,floor_usd:snapshot.floor_usd,model,model_version:'radar-2-calibrated',watchlist_size:snapshot.watchlist.length,board_size:board.length,early_size:early.length,live_size:live.length,universe_size:protocols.length,live_tokens:protocols.filter(liveToken).length,global_median_multiple:fallback,global_sample:live.length,categories,rows:rows.map((r,i)=>({rank:i+1,slug:r.p.slug,name:r.p.name,category:r.p.category,chains:r.p.chains,tvl_usd:r.p.tvl_usd,change_7d:r.p.change_7d,listed_at:r.p.listed_at,age_days:r.age,implied_value_usd:r.value,implied_low_usd:r.lowValue,implied_high_usd:r.highValue,on_watchlist:watch.has(r.p.slug),confidence:r.confidence,multiple:r.multiple,category_sample:r.s?.n??0,category_basis:r.basis,growth_pct:clamp(r.p.change_7d??0,model.growth_floor,model.growth_cap),farm:r.farm})),live:live.sort((a,b)=>(b.p.mcap_usd??0)-(a.p.mcap_usd??0)||a.p.slug.localeCompare(b.p.slug)).slice(0,40).map(x=>({slug:x.p.slug,name:x.p.name,category:x.p.category,chains:x.p.chains,tvl_usd:x.p.tvl_usd,mcap_usd:x.p.mcap_usd,change_7d:x.p.change_7d,multiple:x.m,listed_at:x.p.listed_at,age_days:ageDays(x.p.listed_at,snapshot.as_of),symbol:x.p.symbol}))};
  return {board,radar};
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if(board.length<100)return 'fewer than 100 rows'; if(board.length>4000)return 'more than 4000 rows';
  const known=new Set(snapshot.protocols.map(p=>p.slug)), seen=new Set<string>();
  for(let i=0;i<board.length;i++){const r=board[i]!;if(r.rank!==i+1)return 'rank out of order';if(!known.has(r.slug))return 'slug not in snapshot';if(seen.has(r.slug))return 'duplicate slug';seen.add(r.slug);if(!Number.isSafeInteger(r.implied_value_usd)||r.implied_value_usd<=0||r.implied_value_usd>1e14)return 'invalid implied value';if(i&&board[i-1]!.implied_value_usd<r.implied_value_usd)return 'implied value rises with rank';if(!Array.isArray(r.farm_steps)||r.farm_steps.length<3||r.farm_steps.length>12)return 'invalid farm_steps';if(r.farm_steps.some(s=>s.length<20||s.length>600))return 'invalid farm step';}
  if(snapshot.watchlist.some(s=>!seen.has(s)))return 'watchlist slug missing';if(new Set(board.map(r=>r.implied_value_usd)).size===1)return 'all implied values equal';return null;
}
export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
export function describeModel(): string { return 'Snapshot-calibrated radar-2-calibrated: growth weight 0.5, growth clamp -60 to 120, maturity 0.6 + 0.4 over 1095 days, unknown age 365 days, multiples clamped 0.05 to 12 with 8 category samples, and chain weight 0.05 capped at 4.'; }
