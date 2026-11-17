# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fvxkrz/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fvxkrz/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches that have not happened yet. It ranks protocols that run
without a token by what a launch would be worth, and prices each one from the market's
own numbers rather than from a hand-set number.

Every figure comes from one sealed snapshot (2026-11-14, DefiLlama), so a run is
reproducible: same snapshot in, same board out.

## How a launch is priced

```
implied = TVL x sector multiple x growth x maturity
```

The sector multiple is the part that matters, and it is measured, not typed in. For each
category the model takes the geometric median of market cap over TVL across the protocols
in that category that already trade, then shrinks it toward the whole-market median with
ten pseudo-peers, so a category of fifteen cannot be outvoted by a category of two.

Two rules keep the number honest:

- **Under two tokenized peers, a category gets no vote at all.** One trading comparison is
  an anecdote, not a sector. Those rows are priced at the whole-market multiple and the row
  says so, on the board and in the drawer, instead of printing one protocol's print as if it
  were a market fact.
- **Shrinkage and medians run in log space**, because mcap/TVL is a ratio. Blending ratios
  arithmetically would let a 9.5x print pull twice as hard as a 0.1x one.

The band around each value is not decoration either: its width is the sector's own
interquartile spread blended with the universe's, by the same weight as the multiple. A
category with one peer borrows the universe's spread rather than claiming certainty.

## What is on the board

The snapshot's watchlist is the floor, never the ceiling. All 40 watchlist protocols are
carried, plus the 138 pre-token protocols below the watchlist floor, by TVL, so the radar
surfaces launches no list has caught yet. The 60 protocols that already trade are held in a
separate view, so the board never mixes a model's claim with a market's price.

The farm plan on each row is derived from that protocol's own record: what to do, what it
costs, and how long to hold.

## Run it

```sh
node cli/makefun.mjs bundle --repo . --out /tmp/t.tar.gz
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
python3 -m http.server 8731 --bind 127.0.0.1 &
open http://127.0.0.1:8731/dashboard/index.html
```

`main.ts` reads the sealed snapshot and writes `out/board.json`, `out/data.js` (the payload the
dashboard reads), `out/dossier.json` and a copy of the dashboard. The page then recomputes
every row in the browser from the same function, which is the point: the ranking is a model
you can check, not a table you have to trust.

## The dashboard

Four views: the board, the sectors, the live tokens, and the model. The model view carries a
sandbox — move growth weight, maturity floor, maturity range, or the assumed age of an
unlisted protocol and the whole board re-ranks against your constants, next to the house
ones. A detail drawer shows the arithmetic chain for a single row, term by term, so
2.75B x 0.214 x 0.989 x 0.798 can be followed to the printed estimate.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
