# ⚡ Upwork Bid Intel

> Stop burning connects on ghost jobs, bad clients, and race-to-bottom budgets.

A Chrome extension that scores every Upwork job listing 0–100 instantly — no account, no setup, all local.

## How it works

The extension reads publicly visible signals on each job page and card:
- Client rating, hire history, total spend
- Payment verification status
- Job age (days since posted)
- Number of proposals (competition level)
- Budget vs market rate
- Description quality
- Client hire/interview rates

Combines them into a single **0–100 score** with a **colour-coded badge** injected directly onto the Upwork UI.

## Install (dev)

1. Clone this repo
2. `chrome://extensions` → Developer mode → Load unpacked
3. Select this folder
4. Go to Upwork — scores appear automatically

## Score guide

| Score | Verdict |
|-------|---------|
| 80–100 | 🟢 Excellent — apply with confidence |
| 65–79 | 🟡 Good — apply |
| 45–64 | 🟠 Risky — read carefully first |
| 25–44 | 🔴 Poor — probably skip |
| 0–24 | 💀 Skip — save your connects |

## Privacy

No account. No server. No tracking. All analysis runs in your browser.

## License

MIT
