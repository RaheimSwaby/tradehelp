# TradeHelp — local-first trading journal + offline AI coach

A desktop app (Electron + React + SQLite) where your trades live in a local
database on your machine and an AI coach reasons over them — powered by your
own **Ollama** model (offline, no subscription) or any OpenAI-compatible cloud
endpoint with your own key.

## What's inside

| Tab        | What it does                                                                 |
|------------|------------------------------------------------------------------------------|
| Journal    | Log trades (long/short, entry/exit/stop/target, size, risk). Auto-calcs P&L + R:R. Import a broker CSV (any layout — you map the columns); imported trades count as **Verified** on your rating. |
| Dashboard  | Net P&L, win rate, profit factor, expectancy, max drawdown, streaks, equity curve, daily P&L. |
| Psychology | P&L by emotion, by setup, and by hour of day.                                |
| Goals      | Weekly/monthly targets with live progress bars.                              |
| Prop Firm  | Track a prop firm challenge — profit target, max daily loss, trailing/static drawdown, min days — with live cushion-to-breach and pass/fail status. |
| Reviews    | Weekly / monthly / quarterly reviews — period stats, equity, top setups & reasons, a saved written reflection, and an optional AI summary. |
| AI Coach   | Chat that reads your real stats; plus a live price lookup (crypto + stocks). |
| Chart AI   | Attach before/after screenshots to a trade, then "Analyze chart" — a vision model reads the chart and critiques the setup (offline via Ollama vision, or your cloud key). |
| Patterns   | Pick a setup; the AI reads your winning vs losing charts and tells you what visually separates them. |
| Settings   | Pick Ollama vs cloud, set model + endpoint, test the connection.             |

Data is stored in a SQLite file in your OS user-data folder, so it survives
app updates and never leaves your machine.

## Prerequisites

- **Node.js 18+** (20+ recommended)
- A C/C++ toolchain for the native SQLite module:
  - macOS: `xcode-select --install`
  - Windows: Visual Studio Build Tools (Desktop C++), or install Node via the
    official installer with "Tools for Native Modules" checked
  - Linux: `build-essential` + `python3`
- **Ollama** for the offline coach: install from https://ollama.com, then
  `ollama pull llama3.2`

## Run it (development)

```bash
npm install        # also rebuilds better-sqlite3 for Electron (postinstall)
npm run dev        # launches the app with hot reload
```

If you see a native-module / `NODE_MODULE_VERSION` error, run:

```bash
npm run rebuild
```

## Build a standalone installer

```bash
npm run dist
```

Output lands in `dist/` (a `.dmg` on macOS, `.exe` NSIS installer on Windows,
`.AppImage` on Linux).

## Releasing & auto-updates

The app auto-updates from **GitHub Releases** via `electron-updater`. To ship one:

1. Set `build.publish[0].owner` in `package.json` to your GitHub username (the repo
   is assumed to be named `tradehelp`).
2. Bump `version` in `package.json`.
3. Commit, then tag and push: `git tag v0.2.0 && git push --tags`.
4. The **Release** GitHub Action builds the Windows + Linux installers and publishes
   them to a GitHub Release. Installed apps pick the update up automatically and show
   a "Restart to update" prompt.

Until a code-signing certificate is added, Windows SmartScreen will warn on first
run — testers click **More info → Run anyway**. Auto-update still works unsigned.

## Project layout

```
src/
  main/
    index.js     Electron main: window + IPC wiring
    db.js        SQLite schema + queries (better-sqlite3)
    ai.js        Ollama + cloud chat
    price.js     Binance (crypto) + Stooq (stocks) quotes
  preload/
    index.js     contextBridge -> window.api
  renderer/
    index.html
    src/
      main.jsx   React mount
      App.jsx    the whole UI
      styles.css Tailwind import + theme base
```

## How the agent piece works

The renderer never talks to a model directly. It calls `window.api.aiChat(...)`,
which goes over IPC to the main process, which calls Ollama (or your cloud
endpoint). To add "skills," give the main process more tools (a screenshot
embedder, a CSV importer, a rule checker) and let the coach call them — the
plumbing is already isolated in `ai.js`.

## Not built yet (roadmap)

NinjaTrader CSV import, screenshot storage + vision embeddings (OpenCLIP),
trade-similarity search, and the rule-enforcement engine. The schema and IPC
layer are structured so these slot in without reshaping the app.

> The coach focuses on process, discipline, and psychology from your own log.
> It is not financial advice and does not generate buy/sell signals.
