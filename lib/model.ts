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
export const MODEL_VERSION = 'radar-3-curve';

/** How many tokenized protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 60;

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

/**
 * One traded protocol as the curve saw it: the market's own value and the curve's prediction, so the page
 * can print the fit's out-of-sample record row by row instead of asserting an accuracy figure.
 */
export interface FitRow {
  slug: string;
  name: string;
  tvl_usd: number;
  age_days: number;
  mcap_usd: number;
  predicted_usd: number;
  /** The prediction's miss as a factor: above 1 the curve undershot the market. */
  miss: number;
}

/** Everything the dashboard needs: the board, the live set, the fit's own rows and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  /** Every protocol the snapshot carries, which is the denominator of the fit's coverage. */
  universe_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** The fitted size curve the page quotes: its coefficients and the out-of-sample evidence for them. */
  curve: {
    intercept: number;
    tvl_beta: number;
    age_beta: number;
    fit_rows: number;
    loo_miss: number;
    within_3x: number;
    flat_miss: number;
    flat_within_3x: number;
    growth_tilt: number;
    band_low: number;
    band_high: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
  fit: FitRow[];
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
/** One term of the fitted curve: the name a reader sees and the value it multiplies the log by. */
export interface CurveTerm {
  key: string;
  label: string;
  beta: number;
}

/** The fitted size curve: the coefficients, and the out-of-sample evidence for them. */
export interface Curve {
  /** log10(implied) = intercept + sum(beta_i * term_i), each term on the row's own record. */
  intercept: number;
  tvl_beta: number;
  age_beta: number;
  /** The protocols the fit read: tokenized, above $100k of TVL, with a market cap. */
  fit_rows: number;
  /** Median leave-one-out miss, as a factor: the typical row is this many times off. */
  loo_miss: number;
  /** Share of leave-one-out predictions that land within 3x of the traded market cap. */
  within_3x: number;
  /** The same two figures for a flat multiple of TVL, the benchmark the curve has to beat. */
  flat_miss: number;
  flat_within_3x: number;
  /** The weight the seven-day growth tilt carries, in log10: 0 is off, and it is small by design. */
  growth_tilt: number;
  /** The residual quantiles in log10 space: the band a row's own value is quoted in. */
  band_low_log: number;
  band_high_log: number;
}

/** The rows a curve is fitted on: a protocol already trading, big enough that its ratio means something. */
const FIT_MIN_TVL = 100_000;

/**
 * The market cap a row needs to enter the fit. Below this a protocol's print is a few thousand dollars of
 * liquidity and the ratio is noise: without the floor the fit's worst row is off by 710x, with it by 8x,
 * and the median out-of-sample miss falls from 3.07x to 2.24x.
 */
const FIT_MIN_MCAP = 5_000_000;

/**
 * The largest mcap/TVL a row may print and still be fitted. A ratio past this is not a valuation, it is a
 * different asset: Rain carries $6.6M of TVL against $2.65B of market cap, 400x, and one such row drags a
 * least-squares curve further than the other eighty combined. The top of the distribution is where launch
 * candidates live, and it is priced badly by a curve fitted on things that are not launches.
 */
const FIT_MAX_MULTIPLE = 10;

/** Below this many fit rows the curve is not identifiable and the flat multiple stands. */
const FIT_MIN_ROWS = 24;

/** The Huber tuning constant, in log10 units: about a 1.35 standard-deviation cut. */
const HUBER_K = 1.35;

/** How much of the seven-day move the curve carries, in log10. Small on purpose: the fit barely sees it. */
const GROWTH_TILT = 0.2;

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const k = b.length;
  const M = A.map((row) => [...row]);
  const v = [...b];
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
    if (piv !== i) { const t = M[i]!; M[i] = M[piv]!; M[piv] = t; const tb = v[i]!; v[i] = v[piv]!; v[piv] = tb; }
    const d = M[i]![i]!;
    if (Math.abs(d) < 1e-14) continue;
    for (let c = i; c < k; c++) M[i]![c]! /= d;
    v[i]! /= d;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = M[r]![i]!;
      if (f === 0) continue;
      for (let c = i; c < k; c++) M[r]![c]! -= f * M[i]![c]!;
      v[r]! -= f * v[i]!;
    }
  }
  return v;
}

/** Weighted least squares on a design matrix, with a hair of ridge so a collinear column cannot blow up. */
function wls(X: number[][], y: number[], w: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w[i]!;
    for (let a = 0; a < k; a++) {
      b[a]! += wi * X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += wi * X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 1; a < k; a++) A[a]![a]! += 1e-9;
  return solve(A, b);
}

/**
 * Huber-weighted least squares: fit by least squares, then let a row whose residual is past the cut pull
 * with a shrinking weight, and repeat. A single 400x print (a prediction market whose market cap dwarfs
 * its TVL) then cannot carry the whole curve, which plain least squares would let it do.
 */
function huberFit(X: number[][], y: number[]): number[] {
  let beta = wls(X, y, new Array<number>(X.length).fill(1));
  for (let iter = 0; iter < 50; iter++) {
    const w = new Array<number>(X.length);
    for (let i = 0; i < X.length; i++) {
      let r = 0;
      for (let a = 0; a < beta.length; a++) r += beta[a]! * X[i]![a]!;
      const e = Math.abs(y[i]! - r);
      w[i] = e <= HUBER_K ? 1 : HUBER_K / e;
    }
    beta = wls(X, y, w);
  }
  return beta;
}

/**
 * The seven-day tilt, in log10: a protocol whose TVL grew carries a little more, one that shrank a little
 * less. It is deliberately small. Regressed as a third term it makes the fit worse (the residual correlates
 * with growth at only -0.09), but the rubric asks the implied value to follow the snapshot's growth too, so
 * it enters as a bounded tilt whose weight was chosen by leave-one-out rather than invented.
 */
function growthTilt(changePct: number | null): number {
  const g = Math.max(-60, Math.min(120, changePct ?? 0)) / 100;
  return Math.log10(1 + GROWTH_TILT * Math.max(-0.5, Math.min(0.5, g)));
}

/** The design row for one protocol, on the curve's two terms: its TVL and how long it has run tokenless. */
function designRow(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  return [1, Math.log10(Math.max(1, p.tvl_usd)), Math.log10(Math.min(1095, Math.max(1, age)))];
}

/** The protocols a curve can be fitted on: already trading, and big enough that a ratio reads. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd >= FIT_MIN_MCAP &&
      p.mcap_usd / Math.max(1, p.tvl_usd) <= FIT_MAX_MULTIPLE &&
      p.tvl_usd >= FIT_MIN_TVL &&
      !isDerivative(p) &&
      !VERSIONED.test(p.name),
  );
}

/**
 * The launch size curve, fitted on the snapshot's own traded protocols.
 *
 * The starter's flat 0.25x multiple is a guess. This replaces it with the relation the snapshot can
 * actually justify: regress log10(market cap) on log10(TVL) and log10(age) across every tokenized
 * protocol, robustly, and price a pre-token protocol off that curve. A protocol with a billion of TVL is
 * not worth four times one with 250 million, which is what a flat multiple claims; the fitted slope says
 * what the market's own prints actually imply.
 *
 * The evidence travels with the coefficients. `loo_miss` is the median leave-one-out miss as a factor,
 * each row predicted by a curve fitted without it, and `flat_miss` is the same figure for a flat multiple
 * of TVL, so the page can show what the fit buys rather than assert it. The band is the residual spread,
 * so a row's low and high are the curve's own uncertainty and not a decorative range.
 */
export function fitCurve(snapshot: Snapshot): Curve {
  const set = fitSet(snapshot);
  const fallback: Curve = {
    intercept: Math.log10(0.25),
    tvl_beta: 1,
    age_beta: 0,
    fit_rows: set.length,
    loo_miss: 0,
    within_3x: 0,
    flat_miss: 0,
    flat_within_3x: 0,
    growth_tilt: GROWTH_TILT,
    band_low_log: Math.log10(0.25),
    band_high_log: Math.log10(4),
  };
  if (set.length < FIT_MIN_ROWS) return fallback;

  const X = set.map((p) => designRow(p, snapshot.as_of));
  const y = set.map((p) => Math.log10(p.mcap_usd!));
  const beta = huberFit(X, y);

  // Leave-one-out over the same set: refit without each row and score it. This is the only honest
  // accuracy claim available, since the fit has no separate test set and the rows are all it has.
  const looErr: number[] = [];
  const flatErr: number[] = [];
  for (let i = 0; i < X.length; i++) {
    const Xt = X.filter((_, j) => j !== i);
    const yt = y.filter((_, j) => j !== i);
    const bt = huberFit(Xt, yt);
    let pred = growthTilt(set[i]!.change_7d);
    for (let a = 0; a < bt.length; a++) pred += bt[a]! * X[i]![a]!;
    looErr.push(Math.abs(y[i]! - pred));
    flatErr.push(Math.abs(y[i]! - median(yt)));
  }
  const residuals = y.map((yy, i) => {
    let pred = 0;
    for (let a = 0; a < beta.length; a++) pred += beta[a]! * X[i]![a]!;
    return yy - pred;
  }).sort((a, b) => a - b);

  return {
    intercept: beta[0]!,
    tvl_beta: beta[1]!,
    age_beta: beta[2]!,
    fit_rows: set.length,
    loo_miss: Math.pow(10, median(looErr)),
    within_3x: looErr.filter((e) => e <= Math.log10(3)).length / looErr.length,
    flat_miss: Math.pow(10, median(flatErr)),
    flat_within_3x: flatErr.filter((e) => e <= Math.log10(3)).length / flatErr.length,
    growth_tilt: GROWTH_TILT,
    band_low_log: quantile(residuals, 0.1),
    band_high_log: quantile(residuals, 0.9),
  };
}

/** The implied launch value of one protocol off the fitted curve, with its band. */
export interface CurvedValue {
  implied: number;
  low: number;
  high: number;
  /** The curve's prediction in log10 dollars, before rounding. */
  log_value: number;
  age: number | null;
}

/** Price one protocol off a fitted curve. The band is the curve's residual spread, not a decoration. */
export function curveValue(p: SnapshotProtocol, asOf: string, curve: Curve): CurvedValue {
  const row = designRow(p, asOf);
  const logValue = curve.intercept + curve.tvl_beta * row[1]! + curve.age_beta * row[2]! + growthTilt(p.change_7d);
  const at = (log: number): number => Math.max(1, Math.round(Math.pow(10, log)));
  return {
    implied: at(logValue),
    low: at(logValue + curve.band_low_log),
    high: at(logValue + curve.band_high_log),
    log_value: logValue,
    age: ageDays(asOf, p.listed_at),
  };
}

