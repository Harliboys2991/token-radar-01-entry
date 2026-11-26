# token-radar-01-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Harliboys2991/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Harliboys2991/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the protocols that record no token yet by what their launch would be worth. It reads a sealed DefiLlama snapshot, scores every pre-token protocol with model radar-2 — TVL, seven-day growth, time running with no token, and chain breadth — and hands in a static dashboard with the ranked board, a detail page and farm plan for each protocol, filters and sorting, a live-token view, and a model sandbox that re-ranks the board on the same figures.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Then open `out/dashboard/index.html` in a browser (served, so the page can read its data file next to it). `main.ts` needs Node.js 22.18 or later; the dashboard itself is static files and makes no network requests.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xborg2991&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
