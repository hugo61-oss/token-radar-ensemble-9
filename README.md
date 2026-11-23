# token-radar-ensemble-9

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-ensemble-9/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-ensemble-9/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ensemble Radar — which pre-token protocol is worth farming next, and what to do about it. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
```

Node 22.18 or later, standard library only, no network. The program reads the sealed snapshot, scores every rankable pre-token protocol, and writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser.

## How it ranks

Five signals, each 0 to 1, all from the snapshot's own figures — no protocol name is ever special-cased:

- **Size** (0.28) — log TVL between the $5M floor and the largest TVL.
- **Momentum** (0.22) — 7-day TVL change, clamped to −50%…+100%.
- **Longevity** (0.15) — days listed, saturating: a protocol that has run for years with no token has waited longest.
- **Breadth** (0.10) — how many chains it runs on.
- **Category heat** (0.25) — its category's median 7-day momentum among pre-token peers plus its share of pre-token TVL, computed from the snapshot.

A **purity** multiplier (×1, ×0.70 for bridge / liquid-staking products, ×0.45 for wrapped, staked or exchange products) scores down protocols whose token already trades elsewhere. Implied value = TVL × (0.04 + 0.56 × score^1.5), so the multiple runs 0.04× to 0.60× TVL.

The board ranks 198 pre-token protocols — the 40-protocol watchlist is the floor, never the ceiling — and every row carries a seven-step farm plan with costs and times. 91 wrapped, staked or bridge products that record no token are scored, flagged and set aside instead of ranked: their token already trades elsewhere, so they are not launches. The dashboard re-derives every score in the page, so board, page and model agree, and a model sandbox lets the reader re-rank under weights of their own choosing. Live-token protocols are kept apart and shown at the market's own values for comparison.

"Records no token" means DefiLlama records none — never proof a protocol has none. Implied values are this entry's own claims, not prices, and nothing here is financial advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
