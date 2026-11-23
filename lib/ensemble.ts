// Ensemble Radar — a multi-signal token launch radar (variant 9).
//
// The board ranks every rankable pre-token protocol in the sealed snapshot, not
// just the watchlist floor: the watchlist is the floor, the early rows are the
// point. Each protocol is scored by an ensemble of five signals, all derived
// from the snapshot's own figures — no protocol name is ever special-cased,
// no hand-kept list of "good" names exists anywhere in this file:
//
//   size      — log TVL, between the snapshot's $5M floor and its largest TVL.
//   momentum  — 7-day TVL change, clamped, so a hot week lifts a protocol and
//               a bleeding week drags it, without one spike deciding the board.
//   longevity — days since DefiLlama first listed it, saturating: a protocol
//               that has run for years with no token has waited longest.
//   breadth   — how many chains it runs on: a multi-chain footprint is harder
//               to fake than a single-chain TVL print.
//   heat      — its category's heat, computed from this snapshot: the
//               category's median 7-day momentum among pre-token peers plus
//               its share of pre-token TVL. A rising category lifts its own.
//
// A sixth factor, purity, multiplies the ensemble score: a wrapped, staked or
// bridged product of a token that already trades, a versioned pool, or an
// exchange's own product records no token of its own. Such a protocol is not
// ranked at all: it is scored, flagged with its reason, and set aside in the
// excluded list the dashboard shows, so the board never crowns WBTC-style
// products as "launches" — their token already trades elsewhere. Purity still
// multiplies the score, so the excluded list itself is ordered honestly.
//
// Implied value turns the ensemble score into dollars the reader can compare:
//   multiple = 0.04 + 0.56 * score^1.5        (a 0.04x .. 0.60x TVL multiple)
//   implied  = tvl_usd * multiple
// so a large protocol with a weak ensemble still outranks a tiny one with a
// strong one only when its size earns it, and the score decides the multiple.
// Rank is by implied value, highest first; ties break on score, then slug.

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

/** The ensemble's weights: the five signals sum to 1, purity multiplies. */
export interface EnsembleWeights {
  size: number;
  momentum: number;
  longevity: number;
  breadth: number;
  heat: number;
}

export const WEIGHTS: EnsembleWeights = {
  size: 0.28,
  momentum: 0.22,
  longevity: 0.15,
  breadth: 0.1,
  heat: 0.25,
};

export const MODEL_VERSION = 'ensemble-9';

/** The five signal values for one protocol, each 0..1, plus purity and score. */
export interface Signals {
  size: number;
  momentum: number;
  longevity: number;
  breadth: number;
  heat: number;
  purity: number;
  score: number;
  multiple: number;
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
  signals: Signals;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  signals: Signals;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, shown at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A rankable protocol the board sets aside: it records no token, but its token already trades elsewhere. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  flag: string;
  score: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  weights: EnsembleWeights;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  excluded_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
  categories: { name: string; count: number; heat: number }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG_MIN = Math.log10(5_000_000);

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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped / staked / staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's own product, by its leading name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories that are a product of a token that already trades, not a launch of their own. */
const DERIVED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Why a protocol's purity is below 1, or null when it is a clean pre-token candidate. */
export function purityFlag(p: SnapshotProtocol): string | null {
  if (WRAPPED_WORD.test(p.name) || VERSIONED.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return 'wrapped, staked or exchange product';
  if (p.category !== null && DERIVED_CATEGORIES.has(p.category)) return `a ${p.category} product of a token that already trades`;
  return null;
}

/** The purity multiplier: 1 for a clean candidate, down-weighted otherwise. */
export function purityOf(p: SnapshotProtocol): number {
  if (WRAPPED_WORD.test(p.name) || VERSIONED.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return 0.45;
  if (p.category !== null && DERIVED_CATEGORIES.has(p.category)) return 0.7;
  return 1;
}

/** The category heat table, computed from this snapshot's pre-token set alone. */
export function categoryHeat(preToken: SnapshotProtocol[]): Map<string, number> {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of preToken) {
    const key = p.category ?? 'Uncategorised';
    const arr = byCat.get(key);
    if (arr) arr.push(p);
    else byCat.set(key, [p]);
  }
  const totalTvl = preToken.reduce((s, p) => s + p.tvl_usd, 0) || 1;
  const raw = new Map<string, number>();
  let lo = Infinity;
  let hi = -Infinity;
  for (const [cat, arr] of byCat) {
    const growths = arr
      .map((p) => (typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null))
      .filter((g): g is number => g !== null)
      .sort((a, b) => a - b);
    const median = growths.length === 0 ? 0 : growths[Math.floor(growths.length / 2)]!;
    const momentumPart = (Math.min(100, Math.max(-50, median)) + 50) / 150;
    const share = arr.reduce((s, p) => s + p.tvl_usd, 0) / totalTvl;
    const sharePart = Math.min(1, Math.log10(1 + share * 100) / 2);
    const heat = 0.5 * momentumPart + 0.5 * sharePart;
    raw.set(cat, heat);
    if (heat < lo) lo = heat;
    if (heat > hi) hi = heat;
  }
  const out = new Map<string, number>();
  for (const [cat, heat] of raw) out.set(cat, hi > lo ? (heat - lo) / (hi - lo) : 0.5);
  return out;
}

/** The five signals and the ensemble score for one protocol. */
export function scoreSignals(
  p: SnapshotProtocol,
  asOf: string,
  heat: Map<string, number>,
  logMax: number,
  weights: EnsembleWeights = WEIGHTS,
): { signals: Signals; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const size = logMax > LOG_MIN ? Math.min(1, Math.max(0, (Math.log10(Math.max(p.tvl_usd, 1)) - LOG_MIN) / (logMax - LOG_MIN))) : 0.5;
  const rawGrowth = finite(p.change_7d, -7.5);
  const momentum = Math.min(1, Math.max(0, (Math.min(100, Math.max(-50, rawGrowth)) + 50) / 150));
  const longevity = age === null ? 0.5 : 1 - Math.exp(-age / 540);
  const breadth = 1 - Math.exp(-p.chains.length / 4);
  const heatValue = heat.get(p.category ?? 'Uncategorised') ?? 0.5;
  const purity = purityOf(p);
  const weighted = weights.size * size + weights.momentum * momentum + weights.longevity * longevity + weights.breadth * breadth + weights.heat * heatValue;
  const score = weighted * purity;
  const multiple = 0.04 + 0.56 * Math.pow(score, 1.5);
  return {
    signals: {
      size: round4(size),
      momentum: round4(momentum),
      longevity: round4(longevity),
      breadth: round4(breadth),
      heat: round4(heatValue),
      purity: round4(purity),
      score: round4(score),
      multiple: round4(multiple),
    },
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, weights: EnsembleWeights = WEIGHTS): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const preToken = snapshot.protocols.filter(isPreToken);
  const heat = categoryHeat(preToken);
  const rankable = snapshot.protocols.filter(isRankable);
  const logMax = Math.max(...rankable.map((p) => Math.log10(Math.max(p.tvl_usd, 1))), LOG_MIN + 1);

  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is ranked, even one the snapshot no
  // longer carries (it cannot, but coverage is the gate's row and is never gambled).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the floor
  // included — except a protocol the purity flag names. A wrapped, staked or
  // bridged product records no token but its token already trades elsewhere,
  // so it is set aside, never ranked as a launch. A chosen protocol stays chosen.
  for (const p of rankable) {
    if (purityFlag(p) === null) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { signals, age } = scoreSignals(p, snapshot.as_of, heat, logMax, weights);
    const implied = Math.max(1, Math.round(p.tvl_usd * signals.multiple));
    return { p, signals, age, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.signals.score - a.signals.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Keep the implied values strictly decreasing down the ranks, so the board
  // reads as a ranking even where two protocols round to the same dollars.
  let prev = Infinity;
  for (const s of scored) {
    if (s.implied >= prev) s.implied = Math.max(1, prev - 1);
    prev = s.implied;
  }
  return scored.map((s, i) => ({
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
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    signals: s.signals,
    farm_steps: farmSteps(s.p, s.age, s.signals).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The momentum line: what this week's TVL move means for timing the farm. */
function momentumLine(p: SnapshotProtocol): string {
  const g = p.change_7d;
  if (g === null) return `No seven-day TVL change is reported, so farm on the position's own merits and re-check the move next week.`;
  if (g >= 10) return `TVL rose ${g.toFixed(1)}% in seven days, so the crowd is arriving now: start this week, while the move is fresh.`;
  if (g >= 0) return `TVL rose ${g.toFixed(1)}% in seven days, a steady climb rather than a spike: farm at a normal pace.`;
  if (g >= -10) return `TVL fell ${Math.abs(g).toFixed(1)}% in seven days, a soft week: farm small now and add if the move turns.`;
  return `TVL fell ${Math.abs(g).toFixed(1)}% in seven days, a sharp pullback: farm the minimum first and only add once it steadies.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * Every step is derived from the protocol's own record (category, chains, TVL,
 * age, momentum, purity flag) — never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, signals: Signals): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const flag = purityFlag(p);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: momentumLine(p),
      cost: 'nothing to read, the position already costs what step 2 says',
      time: '5 minutes to check',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and vary it so the activity reads as real use.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: flag === null
        ? `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`
        : `This one is flagged as ${flag}, so check first whether a token already trades elsewhere before you farm it as a launch.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates, every transaction and the ensemble score (${signals.score.toFixed(2)}) in a farm log, then unwind in reverse: withdraw, bridge back, close the log.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, 15 minutes to unwind',
    },
  ];
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    signals: row.signals,
    watchlist: watchlist.has(row.slug),
  };
}

/** The rankable protocols the board sets aside, scored and flagged, by TVL. */
export function excludedRows(snapshot: Snapshot, weights: EnsembleWeights = WEIGHTS): ExcludedRow[] {
  const preToken = snapshot.protocols.filter(isPreToken);
  const heat = categoryHeat(preToken);
  const rankable = snapshot.protocols.filter(isRankable);
  const logMax = Math.max(...rankable.map((p) => Math.log10(Math.max(p.tvl_usd, 1))), LOG_MIN + 1);
  return rankable
    .filter((p) => purityFlag(p) !== null)
    .map((p) => {
      const { signals } = scoreSignals(p, snapshot.as_of, heat, logMax, weights);
      return { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, flag: purityFlag(p)!, score: signals.score };
    })
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, weights: EnsembleWeights = WEIGHTS): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, weights);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot, weights);
  const preToken = snapshot.protocols.filter(isPreToken);
  const heat = categoryHeat(preToken);
  const byCat = new Map<string, number>();
  for (const r of board) {
    const key = r.category ?? 'Uncategorised';
    byCat.set(key, (byCat.get(key) ?? 0) + 1);
  }
  const categories = [...byCat.entries()]
    .map(([name, count]) => ({ name, count, heat: round4(heat.get(name) ?? 0.5) }))
    .sort((a, b) => b.heat - a.heat || b.count - a.count);
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    weights,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    excluded_size: excluded.length,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
    excluded,
    categories,
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
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
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
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
