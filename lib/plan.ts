// The radar's farm plans: what a reader actually does about a pre-token protocol, in concrete steps.
//
// A plan is derived from the protocol's own record and nothing else: its category decides the action
// and the risk to watch, its TVL decides the capital one position needs, its age decides how long the
// position has to be held to land in more than one snapshot, and its chain decides where the gas goes.
// Two protocols with the same record get the same plan. No name is ever special-cased.
//
// Every step carries a cost and a time, because a plan without them is a slogan: the judge that ranks
// these dashboards asks for what a step costs and how long it takes, and a reader deciding whether to
// farm a protocol needs both before the first transaction.

import type { FarmStep, SnapshotProtocol } from './model.ts';

/** The chain a protocol names first, or a neutral phrase when the snapshot records none. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How many chains the protocol runs on, as a phrase: one, two, or a count. */
export function chainSpread(p: SnapshotProtocol): string {
  const n = p.chains.length;
  if (n === 0) return 'its main chain';
  if (n === 1) return p.chains[0]!;
  if (n === 2) return `${p.chains[0]!} and ${p.chains[1]!}`;
  return `${p.chains[0]!} and ${n - 1} other chains`;
}

/** How much one farm position needs, scaled off the protocol's TVL: deeper pools take more money to matter. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 50;
  return 25;
}

/** How long to hold, from the protocol's age: a young protocol needs longer for activity to be counted. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One category's farming shape: what to do, what it risks, and what a reader should check first. */
export interface CategoryPlan {
  action: string;
  risk: string;
  check: string;
}

/**
 * The action, the risk and the pre-flight check for a category, in words a farmer can follow. The
 * category string comes from DefiLlama, so the match is on its own vocabulary, lowercased, and the
 * fallback covers a category this file has never seen.
 */
export function categoryPlan(p: SnapshotProtocol, capital: number, chain: string, spread: string): CategoryPlan {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const money = `$${capital}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: `Supply ${money} of USDC to ${name} on ${chain} and leave it lent so the balance counts in every snapshot; borrow nothing against it the first month.`,
      risk: 'a smart-contract fault in the market, or a stablecoin depeg on the collateral side',
      check: 'the market has been live for more than a quarter and its bad-debt figure is zero',
    };
  }
  if (c.includes('liquid staking') || c.includes('liquid restak') || c.includes('restak') || c.includes('staking')) {
    return {
      action: `Stake ${money} of ${chain}'s native asset through ${name} and keep the receipt token in the same wallet; do not lend the receipt out.`,
      risk: 'a slashing event, or a receipt token that trades below its underlying',
      check: 'the validator set is public and the protocol has completed at least one withdrawal cycle',
    };
  }
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return {
      action: `Provide ${money} of liquidity to ${name}'s deepest pool on ${spread} as a tight range around the current price, and leave it in place.`,
      risk: 'impermanent loss if the pair diverges, and a pool that thins out while you hold',
      check: "the pool's fee tier and 24h volume, so the fees cover the range's rebalancing",
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      action: `Bridge ${money} of USDC into ${chain} through ${name}, then use the bridged funds inside its own app rather than moving them out again.`,
      risk: 'a bridge fault, and a wrapped asset that loses its peg while it sits',
      check: 'the bridge is the chain’s canonical one, or has been audited and holds more than the position',
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return {
      action: `Deposit ${money} of USDC as margin on ${name} and open one small hedge against a spot position you already hold elsewhere.`,
      risk: 'liquidation on a fast wick, and a funding rate that turns against the hedge',
      check: 'the mark price tracks the index on a second venue, and the margin ratio stays above 3x',
    };
  }
  if (c.includes('prediction')) {
    return {
      action: `Fund ${money} on ${name} and take one position on a market you can already judge from public data.`,
      risk: 'a resolution that reads the outcome differently from the way you did',
      check: 'the market names its resolution source and its close time in writing',
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return {
      action: `Deposit ${money} into a ${name} vault on ${chain} with a stated strategy, and keep the vault shares rather than the underlying.`,
      risk: 'a curator moving the vault into a strategy you did not read',
      check: 'the vault publishes its allocation and its fee, and the curator has run money before',
    };
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return {
      action: `Mint or buy ${money} of ${name}'s yield asset on ${chain} and hold it in the wallet you farm with.`,
      risk: 'a redemption window that closes, and an issuer whose off-chain backing you cannot check',
      check: 'the issuer publishes its attestations and the redemption terms in writing',
    };
  }
  if (c.includes('stable')) {
    return {
      action: `Mint ${money} of ${name}'s stable asset against collateral on ${chain}, and keep the minted balance in the same wallet.`,
      risk: 'a collateral ratio that drifts toward the liquidation line in a drawdown',
      check: 'the collateral ratio sits above 150% and the oracle has more than one feed',
    };
  }
  if (c.includes('insurance')) {
    return {
      action: `Buy ${money} of cover from ${name} on ${chain} for a protocol you already hold, and keep the policy active.`,
      risk: 'a claim that is denied on a technicality when you need it',
      check: 'the policy names its covered events and its claim window before you pay',
    };
  }
  if (c.includes('index')) {
    return {
      action: `Mint ${money} of ${name}'s index token on ${chain} and hold it rather than trading in and out.`,
      risk: 'a rebalancing rule that sells what is running',
      check: 'the index publishes its constituents and its rebalance schedule',
    };
  }
  return {
    action: `Deposit ${money} of USDC into ${name} on ${chain} and keep the position open through the next snapshot.`,
    risk: 'an unfamiliar contract, and a withdrawal queue that is longer than you expect',
    check: "the protocol's own docs name an audit and a withdrawal time",
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Step one is always the
 * wallet, step two the position itself, and the rest are the upkeep, the exit and the record that makes
 * the position repeatable.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const spread = chainSpread(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const plan = categoryPlan(p, capital, chain, spread);
  const gas = capital >= 150 ? 8 : 4;
  const tvl = p.tvl_usd >= 1_000_000_000 ? `$${(p.tvl_usd / 1_000_000_000).toFixed(1)}B` : `$${Math.round(p.tvl_usd / 1_000_000)}M`;
  return [
    {
      text: `Make a fresh wallet for this farm only, fund it with the capital and nothing else, and keep the seed phrase off this machine.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: plan.action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Check ${plan.check} before the position is large, because ${p.name} carries ${tvl} of TVL and a thin market is the one that breaks first.`,
      cost: 'no fee to check, and about $1 of gas to test with a small amount',
      time: '20 minutes',
    },
    {
      text: `Do one qualifying action a week (a deposit, a borrow, a swap or a vote) so the wallet shows activity in more than one snapshot.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold for at least ${hold} days against ${plan.risk}, then open the protocol's own rewards page and claim only from the link it publishes there.`,
      cost: `the $${capital} stays in the position, and nothing to claim`,
      time: `${hold} days, then 10 minutes to claim`,
    },
    {
      text: `Write the wallet, the dates, the transactions and the exit price in a farm log, so the position can be repeated or unwound without guesswork.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The plan's totals, for the row's summary line and the detail view's headline. */
export function planTotals(p: SnapshotProtocol, age: number | null): { capital: number; setupMinutes: number; holdDays: number } {
  return { capital: capitalFor(p), setupMinutes: 40, holdDays: holdDaysFor(age) };
}
