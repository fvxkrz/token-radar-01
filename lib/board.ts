// The radar's board: which protocols the page ranks, in what order, and the payload the page reads.
//
// The board's floor is the snapshot's watchlist, never its ceiling. On top of it the radar adds the
// pre-token protocols below the watchlist floor, by TVL, so a reader sees the launches the watchlist
// itself has not caught yet: a protocol with no token that no list carries is exactly the one a radar
// exists to surface. The ranking is on the model's implied value, the live-token protocols are kept in
// a set of their own so the board never mixes a model's claim with a market's price, and every row's
// farm plan is derived from its own record.

import {
  MODEL,
  MODEL_VERSION,
  LIVE_ROWS,
  SnapshotError,
  isRankable,
  fitCurve,
  curveValue,
  fitSet,
  protocolMultiple,
  type Curve,
  type FitRow,
  type BoardRow,
  type LiveRow,
  type RadarData,
  type RadarRow,
  type Snapshot,
  type SnapshotProtocol,
  type ModelConstants,
} from './model.ts';
import { farmSteps, stepText, capitalFor, holdDaysFor } from './plan.ts';

/** How many pre-token protocols below the watchlist floor the radar carries, by TVL. */
export const EARLY_ROWS = 260;

/**
 * The board's rows, strongest first with ranks 1..n.
 *
 * Every watchlist slug is on it, whatever its record says: coverage is the gate's first row and is
 * never traded for a nicer-looking board. The early rows are the pre-token protocols with less TVL
 * than the watchlist floor, which the watchlist by construction cannot hold.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, curve: Curve = fitCurve(snapshot)): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = new Set(snapshot.watchlist);

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

  const scored = [...chosen.values()].map((p) => ({ p, v: curveValue(p, snapshot.as_of, curve) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map(({ p, v }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token' as const,
    age_days: v.age,
    implied_value_usd: v.implied,
    implied_value_low_usd: v.low,
    implied_value_high_usd: v.high,
    launch_readiness: launchReadiness(v.implied, v.low, v.high, v.age),
    on_watchlist: watchlist.has(p.slug),
    model: {
      model_version: MODEL_VERSION,
      growth_pct: p.change_7d ?? 0,
      growth_multiplier: 1,
      maturity_multiplier: 1,
      sector_multiple: round4(Math.pow(10, v.log_value) / Math.max(1, p.tvl_usd)),
      sector_multiple_low: round4(Math.pow(10, v.log_value + curve.band_low_log) / Math.max(1, p.tvl_usd)),
      sector_multiple_high: round4(Math.pow(10, v.log_value + curve.band_high_log) / Math.max(1, p.tvl_usd)),
      sector_peers: curve.fit_rows,
      age_days: v.age,
    },
    farm_steps: farmSteps(p, v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * A 0-100 readiness score: how much of the value is the protocol's own record rather than its sector's
 * spread, and how long it has run without a token. It is what the board sorts a tie by and what the page
 * draws as a bar, never a second ranking.
 */
export function launchReadiness(implied: number, low: number, high: number, age: number | null): number {
  const tightness = high > low ? low / high : 1;
  const ageScore = age === null ? 0.5 : Math.min(1, age / 730);
  const sizeScore = Math.min(1, implied / 250_000_000);
  return Math.round(100 * (0.45 * tightness + 0.3 * ageScore + 0.25 * sizeScore));
}

/** The live-token protocols, by market cap, for the page's Live token view: the market's own numbers. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: protocolMultiple(p) === null ? null : round4(protocolMultiple(p)!),
    }));
}

/** A board row's compact form for the page, with the plan's totals inlined. */
export function radarRow(row: BoardRow): RadarRow {
  const age = row.age_days;
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: age,
    implied_value_usd: row.implied_value_usd,
    implied_value_low_usd: row.implied_value_low_usd,
    implied_value_high_usd: row.implied_value_high_usd,
    launch_readiness: row.launch_readiness,
    on_watchlist: row.on_watchlist,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    sector_multiple: row.model.sector_multiple,
    sector_multiple_low: row.model.sector_multiple_low,
    sector_multiple_high: row.model.sector_multiple_high,
    sector_peers: row.model.sector_peers,
    plan_capital_usd: capitalForOf(row),
    plan_setup_minutes: 40,
    plan_hold_days: holdDaysFor(age),
  };
}

/** The capital the row's plan asks for, from the same thresholds the plan itself uses. */
function capitalForOf(row: BoardRow): number {
  return capitalFor({ tvl_usd: row.tvl_usd } as SnapshotProtocol);
}

/**
 * The fit set priced by the fitted curve: actual against predicted, worst miss first, so the page's
 * evidence table leads with the rows the curve gets wrong. Nothing here is on the board: these are the
 * protocols whose token already trades, read only to fit and to check.
 */
export function fitRows(snapshot: Snapshot, curve: Curve): FitRow[] {
  return fitSet(snapshot)
    .map((p) => {
      const v = curveValue(p, snapshot.as_of, curve);
      return {
        slug: p.slug,
        name: p.name,
        tvl_usd: Math.round(p.tvl_usd),
        age_days: v.age ?? 0,
        mcap_usd: Math.round(p.mcap_usd!),
        predicted_usd: v.implied,
        miss: round4(Math.max(v.implied, p.mcap_usd!) / Math.min(v.implied, p.mcap_usd!)),
      };
    })
    .sort((a, b) => b.miss - a.miss || (a.slug < b.slug ? -1 : 1));
}

/** Everything the page renders, from the snapshot: the board, the live set, the fit's own rows, the model. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const curve = fitCurve(snapshot);
  const board = buildBoard(snapshot, model, curve);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    universe_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,

    curve: {
      intercept: round4(curve.intercept),
      tvl_beta: round4(curve.tvl_beta),
      age_beta: round4(curve.age_beta),
      fit_rows: curve.fit_rows,
      loo_miss: round4(curve.loo_miss),
      within_3x: round4(curve.within_3x),
      flat_miss: round4(curve.flat_miss),
      flat_within_3x: round4(curve.flat_within_3x),
      growth_tilt: round4(curve.growth_tilt),
      band_low: round4(curve.band_low_log),
      band_high: round4(curve.band_high_log),
    },
    rows: board.map(radarRow),
    live,
    fit: fitRows(snapshot, curve),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/**
 * Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value,
 * and the farm steps' own limits. main.ts asks this before it writes anything, so a bad model fails
 * loudly rather than handing the gate a board it will refuse.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows and the gate wants at least 100`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has an implied value past the gate's ceiling`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

/** A compact data.js: the page's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
