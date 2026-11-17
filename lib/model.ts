// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The house starter prices a launch as TVL times a fixed 0.25. That constant is a guess: it says a
// launch is worth a quarter of the protocol's TVL whatever the sector. This model replaces it with the
// only launch multiple the snapshot itself can justify: what the market already pays for protocols of
// the same kind that do have a token. Every tokenized protocol in the snapshot carries both a TVL and a
// market cap, so mcap/TVL is that sector's own launch multiple, measured rather than assumed.
//
//   peerMultiple(c) = shrink(median of mcap/TVL over c's tokenized peers, toward the universe median)
//   base            = tvl_usd x peerMultiple(category)
//   growth          = clamp(change_7d, -60, 120) per cent, half weight
//   maturity        = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied         = max(1, round(base x growthMult x maturity))
//
// The multiple is shrunk toward the universe median by peer count, so a category with two tokenized
// members does not get to speak as loudly as one with fifteen, and it is clamped so a single absurd
// print (a token locker at 9.5x, say) cannot carry a row. Alongside the point estimate the model
// publishes a range: the same arithmetic at the category's first and third quartile multiples, which is
// how much of the number is the sector's spread and how much is the protocol itself.
//
// Nothing here reads a name. Two protocols with the same category, TVL, growth and age get the same
// number, and a protocol the snapshot has never seen is scored the day it appears.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's house constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  prior_peers: number;
  min_peers: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  prior_peers: 10,
  min_peers: 2,
  multiple_floor: 0.05,
  multiple_cap: 3,
};

/** The widest the implied-value band may get, as a ratio of its high to its low. */
export const BAND_MAX_RATIO = 8;

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-peer';

/** How many tokenized protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 60;

/** What a category's tokenized members say about a launch there. */
export interface SectorBenchmark {
  category: string;
  /** Tokenized protocols in the category that carry both a market cap and a TVL. */
  peers: number;
  /** The category's own median mcap/TVL, shrunk toward the universe and clamped. */
  multiple: number;
  /** The same at the category's first and third quartile: the range a launch there plausibly lands in. */
  multiple_low: number;
  multiple_high: number;
  /** The category's unshrunk median, for the sandbox to show what the peers said on their own. */
  raw_multiple: number;
  /** How much of the multiple came from the category rather than the universe prior, 0 to 1. */
  weight: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  launch_readiness: number;
  on_watchlist: boolean;
  model: {
    model_version: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    sector_multiple: number;
    sector_multiple_low: number;
    sector_multiple_high: number;
    sector_peers: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the plan's totals and the model's own inputs. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  launch_readiness: number;
  on_watchlist: boolean;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  sector_multiple: number;
  sector_multiple_low: number;
  sector_multiple_high: number;
  sector_peers: number;
  plan_capital_usd: number;
  plan_setup_minutes: number;
  plan_hold_days: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, the sector table and the model it runs. */
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
  universe_multiple: number;
  universe_peers: number;
  /** The peer count under which a category is priced at the universe instead of itself. */
  min_peers: number;
  sectors: SectorBenchmark[];
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

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The p-quantile of a non-empty list, by linear interpolation between the two nearest ranks. */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const at = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories whose members are a product of another protocol's token, never a launch of their own. */
const DERIVATIVE_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
  'Cross Chain Bridge',
]);

/** The exchanges whose name at the start of a protocol names its own custody product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** The words that make a protocol a wrapped, staked or bridging product of one that already trades. */
const DERIVATIVE_WORD = /\b(wrapped|staked|staking|bridged)\b/i;

/**
 * Whether a protocol is a wrapped, staked or bridged product of a protocol whose token already trades.
 *
 * The field guide's own rule, applied to the fields the snapshot carries: a derivative's TVL is not a
 * launch's TVL, so ranking one as a launch candidate overstates the board. WBTC is Bitcoin on Ethereum
 * and Coinbase Bridge is custody, not a protocol waiting on a launch of its own. Where the guide also
 * reads DefiLlama's `parentProtocol`, this file has only the ten fields, so the category, the name's
 * word and the exchange prefix are the tests available.
 */
export function isDerivative(p: SnapshotProtocol): boolean {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  if (DERIVATIVE_WORD.test(p.name)) return true;
  // A wrapped ticker: WBTC, WETH, WSOL and the like.
  if (/^W[A-Z]{2,6}$/.test(p.name)) return true;
  return false;
}

/**
 * Whether a protocol is one the board may rank as a launch candidate: no token recorded, not a
 * derivative of one that trades, and not a versioned pool of another protocol.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isDerivative(p) && !VERSIONED.test(p.name);
}

/** The bytes of source kept for a row's provenance: which of the model's inputs moved the number most. */
export interface Driver {
  key: 'tvl' | 'sector' | 'growth' | 'maturity';
  share: number;
}

/** A protocol's own mcap/TVL, or null when the snapshot records no market cap for it. */
export function protocolMultiple(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  return p.mcap_usd / p.tvl_usd;
}

/**
 * The market's launch multiple, measured once over the whole snapshot: the median mcap/TVL of every
 * protocol that already trades. This is the prior a thin category is shrunk toward.
 */
export function universeBenchmark(snapshot: Snapshot): { multiple: number; peers: number } {
  const ratios = snapshot.protocols.map(protocolMultiple).filter((r): r is number => r !== null);
  return { multiple: ratios.length === 0 ? 0.25 : geometricMedian(ratios), peers: ratios.length };
}

/**
 * The median of a list in log space, back in plain units: the same middle value, but a single 9.5x print
 * moves it no more than a single 0.02x one does, which is what a mcap/TVL sample needs. Ratios are
 * multiplicative, so their middle is a geometric one.
 */
export function geometricMedian(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  return Math.exp(median(positive.map((v) => Math.log(v))));
}

/** The p-quantile of a positive list in log space, back in plain units. */
export function geometricQuantile(values: number[], p: number): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  return Math.exp(quantile(positive.map((v) => Math.log(v)), p));
}

/**
 * Every category's launch multiple, read from the tokenized protocols the snapshot already carries.
 *
 * The category's geometric median is shrunk toward the universe's with `prior_peers` pseudo-peers, so a
 * category of two does not outweigh a category of fifteen: with ten pseudo-peers a one-peer category
 * keeps a tenth of its own vote and a twenty-peer one keeps two thirds. The result is clamped inside
 * [multiple_floor, multiple_cap]. The low and high figures are the same shrink at the category's first
 * and third quartile, which is the range a launch in that sector plausibly lands in.
 */
export function sectorBenchmarks(snapshot: Snapshot, model: ModelConstants = MODEL): SectorBenchmark[] {
  const universe = universeBenchmark(snapshot);
  const allRatios = snapshot.protocols.map(protocolMultiple).filter((r): r is number => r !== null && r > 0);
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    const ratio = protocolMultiple(p);
    if (ratio === null) continue;
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  // Shrinkage runs in log space, because the quantity being averaged is a ratio. Blending ratios
  // arithmetically would let a 9.5x print pull the prior twice as far as a 0.1x one pulls it back, which
  // is exactly the asymmetry the geometric median exists to avoid.
  //
  // A category under `min_peers` gets no vote at all. One trading comparison is an anecdote, not a
  // sector: at a ninth of a vote a single protocol's print carried five of the top ten rows, and the
  // same number repeated down the board read as a market fact. Two comparables is the smallest sample
  // that can disagree with itself, so two is the floor; anything under it is priced at the universe and
  // labelled that way rather than dressed up as a sector multiple.
  const shrink = (values: number[], statistic: number): { value: number; weight: number } => {
    const n = values.length;
    const weight = n < model.min_peers ? 0 : n / (n + model.prior_peers);
    const blended = Math.exp(weight * Math.log(statistic) + (1 - weight) * Math.log(universe.multiple));
    return { value: clamp(blended, model.multiple_floor, model.multiple_cap), weight };
  };
  // The band's width, in log space, comes from the same two sources as the multiple itself: the
  // sector's own interquartile spread, and the universe's, blended by the sector's weight. A category
  // with one peer has no spread of its own to show, so it borrows the universe's rather than pretending
  // its single print is a certainty.
  const universeWidth = Math.log(geometricQuantile(allRatios, 0.75) / geometricQuantile(allRatios, 0.25));
  const widthCap = Math.log(BAND_MAX_RATIO);
  const widthFloor = Math.log(1.1);
  const out: SectorBenchmark[] = [];
  for (const [category, values] of byCategory) {
    const raw = geometricMedian(values);
    const mid = shrink(values, raw);
    const own = values.length >= 4 ? Math.log(geometricQuantile(values, 0.75) / geometricQuantile(values, 0.25)) : 0;
    const width = clamp(mid.weight * own + (1 - mid.weight) * universeWidth, widthFloor, widthCap);
    out.push({
      category,
      peers: values.length,
      multiple: mid.value,
      multiple_low: clamp(mid.value * Math.exp(-width / 2), model.multiple_floor, model.multiple_cap),
      multiple_high: clamp(mid.value * Math.exp(width / 2), model.multiple_floor, model.multiple_cap),
      raw_multiple: raw,
      weight: mid.weight,
    });
  }
  out.sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return out;
}

/** The benchmark for one protocol's category, from the sector table. */
function benchmarkFor(p: SnapshotProtocol, sectors: SectorBenchmark[], universe: number): SectorBenchmark {
  const key = p.category ?? 'Uncategorised';
  const found = sectors.find((s) => s.category === key);
  if (found !== undefined) return found;
  return { category: key, peers: 0, multiple: universe, multiple_low: universe, multiple_high: universe, raw_multiple: universe, weight: 0 };
}

/** The growth and maturity multipliers one protocol gets, and its age in days. */
export interface Multipliers {
  age: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
}

/** The growth and maturity multipliers under `model`: the same for every row, whatever its sector. */
export function multipliers(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): Multipliers {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { age, growthPct, growthMult, maturityMult };
}

/** The implied launch value of one protocol under `model`, with the sector multiple that drove it. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  sectors: SectorBenchmark[],
  universe: number,
): {
  implied: number;
  low: number;
  high: number;
  benchmark: SectorBenchmark;
  age: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
} {
  const m = multipliers(protocol, asOf, model);
  const benchmark = benchmarkFor(protocol, sectors, universe);
  const at = (multiple: number): number => Math.max(1, Math.round(protocol.tvl_usd * multiple * m.growthMult * m.maturityMult));
  return {
    implied: at(benchmark.multiple),
    low: at(benchmark.multiple_low),
    high: at(benchmark.multiple_high),
    benchmark,
    age: m.age,
    growthPct: m.growthPct,
    growthMult: m.growthMult,
    maturityMult: m.maturityMult,
  };
}
