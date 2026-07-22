// Bundled patch notes — shown in the "What's new" modal after an update.
// Add an entry here with every release so users always see real notes.

// 0.35.1–0.35.5 are fix-ups on 0.35.0, so they deliberately show the same 0.35
// notes rather than announcing themselves. Anyone arriving from 0.34.x still gets
// the full 0.35 feature list either way.
const V035_NOTES = `• Position sizing — size a plan from your risk budget (futures, stocks, crypto)
• Multi-fill trades — log scale-ins and partial exits with average-cost P&L
• Plan scoring — prefill from your playbook, then score how you executed
• Reviews → commitments — end a review with one measurable focus
• Saved searches — keep your go-to journal searches one click away
• Session comparison — put two trading days side by side
• Similar charts — find look-alike setups, all on your machine
• Screen recordings — attach a recording to a trade and play it back`

const V036_NOTES = `- Cosmetic Refresh - each theme preset now has its own restrained motion style
- Trade Mode now uses one polished, full-window activation sequence across every preset
- Live stats count smoothly when P&L changes, with preset-specific number effects
- Personal trading clock and session ambiance adapt to your usual trading window
- Performance heat map is easier to read, with clearer samples and best/weakest summaries
- Animated backdrops and page transitions are lighter and smoother on slower hardware
- Dashboard quotes rotate daily and AI Coach quick prompts adapt to your journal`

export const RELEASE_NOTES = {
  '0.36.0': V036_NOTES,
  '0.35.5': V035_NOTES,
  '0.35.4': V035_NOTES,
  '0.35.3': V035_NOTES,
  '0.35.2': V035_NOTES,
  '0.35.1': V035_NOTES,
  '0.35.0': V035_NOTES,
  '0.34.1': `• Commitment and pre-trade-plan pop-ups now open centered on screen
• Achievement unlocks now pop in from the side with an animated medal
• New commitment achievements — Kept My Word, Habit Builder and Ironclad Discipline
• More commitment rules — minimum R:R, stop-loss required, and a daily loss limit`,
  '0.34.0': `• Pre-trade plans — lock in your setup, levels and risk before entry, then link the real trade to compare plan vs. execution
• Session replay — click any day on the calendar to step through the whole session in order
• Coach commitments — pick one habit to measure, with automatic pass/miss tracking
• Natural-language journal search — e.g. “losing NQ trades last week after 11am”, shown as removable filter chips
• Add screenshots when editing an existing trade`,
  '0.33.0': `- Last session review - a floating daily report now recaps your most recent trading day on app launch\n- Basic review works without AI: net P&L, W/L record, trade list, emotions, and one improvement tip\n- Optional AI review - ask your configured model for a short day-specific coaching note\n- Reopen anytime - close the card and bring it back from the top-bar Review button`,
  '0.32.1': `- Accounts tab - Prop Firm is now Accounts, with separate Live and Prop views\n- Live account tracking - set starting capital, track balance, withdrawals, net P&L, win rate, and max drawdown for personal trades\n- AI coach account context - the coach now reads real live-account stats instead of guessing from market prices\n- Tab polish - active tab icons now get a longer, smoother glow pulse`,
  '0.32.0': `- Accounts tab - Prop Firm is now Accounts, with separate Live and Prop views\n- Live account tracking - set starting capital, track balance, withdrawals, net P&L, win rate, and max drawdown for personal trades\n- AI coach account context - the coach now reads real live-account stats instead of guessing from market prices\n- Tab polish - active tab icons now get a longer, smoother glow pulse`,
  '0.31.2': `- NinjaTrader Orders CSV import - TradeHelp now recognizes Orders exports, ignores canceled bracket orders, and rebuilds filled orders into closed trades`,
  '0.31.1': `- Minor Pattern Recognition polish - compared charts now show date/P&L and can be opened full-size from the preview`,
  '0.31.0': `- Appearance 2.0 - new theme preset preview cards for Classic, Midnight, Clean Light, Terminal Green, Red Session, and Minimal Gray\n- Custom backgrounds - choose a local PNG/JPG/WEBP and tune opacity, blur, dim, and fill/fit/tile\n- Separate Go-Time colors - Trade Mode can now use its own serious session color\n- Profit/loss color styles - switch between classic, blue/red, green/orange, colorblind-safe, or minimal mono\n- Number font options - keep the default mono feel or switch to cleaner/softer number styling`,
  '0.30.1': `- New Money Rain backdrop - falling bills and dollar marks are now available in Settings -> Appearance\n- Subtle tab hover motion - tabs now lift, glow and nudge their icons when you float over them\n- Cleaner custom tab icons - Trade Mode and AI Coach now use app-specific SVG icons that inherit your accent color\n- Local dev fix - the app now installs the correct Electron SQLite binary before dev starts, preventing the better-sqlite3 NODE_MODULE_VERSION crash`,
  '0.30.0': `• Leak finder — the Dashboard now puts a dollar figure on your worst habit: "Revenge trades have cost you -$X", ranked across FOMO, greed, impatience, oversizing, moving your stop and more, pulled from your emotion and reason tags\n• Join the community — a TradeHelp Discord link is now in Settings, the welcome wizard, and the website\n• Fixed the "Compare winners vs losers" pattern finder giving a nonsense analysis when your model can't read chart images — it now points you to set a vision model (e.g. llama3.2-vision) instead`,
  '0.29.0': `• 4 new achievements — 🗓️ Locked In (journal 10 trading days in a row), ☕ Sat On My Hands (log 10 no-trade days), 🌅 Bounce Back (clean tilt-free days right after red days) and 🎯 Defined Risk (25 trades with both stop and target set)\n• Achievements now have difficulty tiers — Bronze, Silver, Gold and Diamond — and the harder the badge, the cooler the medal: gold glows, diamond shines\n• Share report: your unlocked accolades now appear as tier-colored badges (new toggle included)\n• New "Feedback & support" panel in Settings — DM @tradehelp.io on Instagram with bugs and ideas`,
  '0.28.0': `• Guided setup on first launch — a quick welcome wizard helps new traders set their rules, daily goal and max loss, then import their first trades\n• Smarter CSV import — NinjaTrader 8, Tradovate and TopstepX exports are now recognized automatically, with columns mapped for you (Tradovate's trade direction is worked out from the fill order)\n• Groundwork for the website's new comparison and broker-import guides`,
  '0.27.0': `• Animated backdrops — pick a vibe in Settings → Appearance: 🌌 Constellation (with shooting stars), 💻 Matrix rain, 🫧 glow Orbs, 🔥 rising Flames, 🕯️ drifting Candles or a 🎚️ bouncing Equalizer — or turn it off\n• Every backdrop re-tints live with your accent color, light/dark theme and Trade Mode\n• Backdrops respect reduced-motion settings and pause while the window is hidden\n• Fixed the light theme not sticking after a restart`,
  '0.26.0': `• Light theme — switch between Dark and Light in Settings → Appearance\n• Undo delete — removing a trade now shows an Undo toast instead of a confirm popup\n• Smarter CSV import — duplicate trades are detected and skipped, imports can be assigned straight to a prop account, and Fees + Commission columns are read separately (both netted into P&L, shown in the preview)\n• Dashboard: equity sparkline on the Net P&L card and total fees paid in its subtitle\n• Four new accent colors — emerald, blue, lime and silver\n• Visual polish — new logo, smooth tab and modal transitions, button press feedback, and accent focus rings on inputs`,
  '0.25.3': `• Fixed the AI Coach not actually seeing your journal — Ollama was silently truncating the data before the model read it (raised the context window). The coach now reliably reads your real trades instead of asking you to describe them\n• Added recommended-model guidance in Settings`,
  '0.25.2': `• AI Coach now reads your FULL journal — trades, written notes, reasons, self-grades, saved reviews, playbook, goals, rules and no-trade logs — so it coaches what you actually wrote instead of guessing from numbers\n• Hard guardrail added so the coach won't invent trades or notes that aren't in your data\n• Warning when your local model is too small (sub-2B) to read your journal reliably\n• Cloud users get a toggle for whether written notes leave the machine (local Ollama always gets everything)`,
  '0.25.1': `• Housekeeping and minor copy updates.`,
  '0.25.0': `• Proactive coach brief on the Dashboard — an at-a-glance process review that refreshes as your trades change, with an optional AI touch (toggle it in Settings)\n• Share report — export a clean PNG snapshot of your stats to share, with a date range and account label`,
  '0.24.2': `• Cosmetic polish — gradient-filled equity curve, frosted-glass floating widgets and pop-ups, hover lift on cards, aligned tabular numbers, and green/red accents on trade-history rows`,
  '0.24.1': `• New prop firm achievements — "First Payout" unlocks on your first one, and a "Payday" medal climbs an 8-tier ladder (Wood → Steel → Bronze → Silver → Gold → Platinum → Diamond → Legendary) as your payout count grows`,
  '0.24.0': `• Tag each trade as Live or a specific prop account right in the journal\n• Dashboard now has a Live / Prop / All toggle so your prop and live P&L stay separate (letter grade still combines both)\n• Prop accounts now count only the trades you tag to them by default — your live trades no longer leak in\n• Each account card shows two bars: progress toward target AND drawdown cushion\n• Track prop firm payouts — per account and an all-time log`,
  '0.23.2': `• The floating Trade Mode news widget now always shows while you're live — even when there's no upcoming news (so you know you're clear)`,
  '0.23.1': `• Economic calendar now floats in the corner while Trade Mode is live, so upcoming news stays in view — imminent high-impact events glow red, and it collapses to a pill when you want it out of the way`,
  '0.23.0': `• Simple journal mode — toggle it on to hide the price/risk fields and log a trade in under a minute (keeps screenshots)\n• No-trade day tracker — log days you sat out or missed, with a reason and mood, without touching your P&L\n• Add your own custom emotions and setups with a + button\n• Setup is now a clean dropdown instead of free-text`,
  '0.22.4': `• Update banner now clearly says the new version downloaded in the background — just click Restart to apply, no browser or download page`,
  '0.22.3': `• Windows updates are fully automatic again — the app downloads in the background and shows a "Restart now" button to update instantly\n• Added Performance heat map and Playbook to the website`,
  '0.22.2': `• Fixed releases being published as drafts — landing page download and in-app update now work correctly`,
  '0.22.1': `• Update check interval reduced to 10s for testing`,
  '0.22.0': `• Update banner now appears on Windows when a new version is available — click to download the latest installer directly`,
  '0.21.8': `• Fixed CI workflow (removed release-notes job that was failing)`,
  '0.21.7': `• Restored original update flow: app silently downloads update and shows a bottom-left 'Restart now' banner`,
  '0.21.6': `• Fixed CI release-notes generation`,
  '0.21.4': `• Update notifications now work on all platforms — a banner appears when a new version is out with a direct download link\n• Fixed update delivery that was silently broken for Windows users`,
  '0.21.3': `• Update flow is now user-triggered: banner shows when an update is available, click "Update now" to download, then "Restart now" to apply`,
  '0.21.2': `• Heat map advisory now shows best hour and best day as separate chips`,
  '0.21.1': `• Heat map advisory fixed to correctly highlight the single best performing time slot`,
  '0.21.0': `• Performance heat map on the Dashboard — win rate by hour × day with a fire color scale and advisory\n• Playbook tab — document your setups with entry criteria, invalidation, and targets; trades auto-link by setup name`,
  '0.20.3': `• Security: settings write-side key allowlist\n• Security: image upload MIME allowlist blocks SVGs\n• Performance: trade list query rewritten to use a single JOIN\n• Reliability: settings cache invalidated on every write\n• openExternal restricted to http/https URLs only\n• Stream listener cleanup on component unmount\n• getImage returns null on file error instead of crashing\n• Backup errors now logged instead of swallowed`,
}
