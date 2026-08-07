// In-app help. Bundled rather than fetched so it works with the network unplugged,
// same as the rest of the app. Keep answers short and specific — this is the place a
// trader looks when a feature isn't obvious, not marketing copy.
export const HELP_SECTIONS = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      {
        q: 'Where is my data stored?',
        a: 'In a single SQLite database in your user data folder, with chart screenshots as files alongside it. Your trades are never uploaded anywhere — no account, no server. Settings → Data & backup → "Open data folder" takes you straight to it. The only features that reach the internet are ones you choose: update checks, economic news, a cloud AI provider if you pick one instead of a local model, and the live chart — see "Does the live chart send my data anywhere?" under Charts.'
      },
      {
        q: 'How do I log my first trade?',
        a: 'Journal tab → fill in symbol, direction and your prices, then Save trade. Only the symbol is required; everything else can be filled in later by editing the trade.'
      },
      {
        q: 'The trade form has too many fields — can I simplify it?',
        a: 'Yes. Settings → Journal preferences → Simple journal mode hides the price and risk fields so you can log a trade in under a minute. You keep screenshots, notes and emotion tags.'
      },
      {
        q: 'Can I import trades from my broker?',
        a: 'Journal tab → Import CSV. Exports from NinjaTrader, Tradovate and TopstepX are auto-detected and the columns map themselves. Duplicates are skipped if you import the same file twice, and you can assign a whole batch to one prop account.'
      },
      {
        q: 'My imported times are off by a few hours.',
        a: 'Set the source timezone in the import dialog. Broker exports are often in exchange time, not yours — TradeHelp converts them to your local time so the heat map and session clock stay accurate.'
      }
    ]
  },
  {
    id: 'live',
    title: 'Trading live (Trade Mode)',
    items: [
      {
        q: 'What does Trade Mode actually do?',
        a: 'It flips the app into a focused "go time" view for a live session: your pre-flight checklist, today\'s P&L against your daily goal, a max-loss alarm, and upcoming high-impact news.'
      },
      {
        q: 'Does the max-loss alarm close my trades?',
        a: 'No. TradeHelp has no broker connection and cannot place or close orders. When you cross your daily loss limit it throws a full-screen alarm telling you to walk away — it puts the line in front of you and makes you decide on purpose.'
      },
      {
        q: 'How do I set my rules and limits?',
        a: 'Trade Mode tab → "Your trading rules" for the pre-flight checklist, and "Daily limits" for your goal and max daily loss. Rules save as you edit them; deleting one takes effect immediately.'
      },
      {
        q: 'What are pre-trade plans?',
        a: 'Write the setup, levels, risk and thesis before you enter, then Lock the plan so it can\'t be rewritten after the fact. When the trade is done, link the actual trade to compare intent against what you really did.'
      },
      {
        q: 'Where do completed Trade Mode sessions go?',
        a: 'Trade Mode → Session history. Sessions are saved even when you did not record your screen. Expand one to see its duration, trades, P&L, notes, recording status and any rule breaks logged at the end.'
      },
      {
        q: 'Can I search, edit or delete a saved session?',
        a: 'Yes. Session history can be searched by date, note, rule or rule-break reason, and filtered for notes, rule breaks, recordings or clean sessions. Expand a session to edit its notes or delete it. Deleting a session also removes its recording and linked rule-break entries, but the trades themselves stay in your Journal.'
      },
      {
        q: 'Why does TradeHelp ask why I broke a rule?',
        a: 'The rule tells you what happened; the reason helps expose what keeps causing it. When ending a session, select only rules you actually broke and add what led to each one. TradeHelp keeps those explanations locally and surfaces repeated reasons in your rule-break patterns and wrap-ups.'
      }
    ]
  },
  {
    id: 'numbers',
    title: 'Understanding your numbers',
    items: [
      {
        q: 'What is the Leak Finder?',
        a: 'It puts a dollar figure on your worst behavioural pattern — "Revenge trades have cost you −$2,340" — ranked across revenge, FOMO, greed, impatience, moving your stop, oversizing and boredom.'
      },
      {
        q: 'My Leak Finder is empty.',
        a: 'It only reads trades where you tagged an emotion or a reason. Tag a few losing trades honestly and the pattern appears — the whole point is making the cost of tilt concrete, and it can only see what you record.'
      },
      {
        q: 'How do I read the performance heat map?',
        a: 'The summary cards at the top are the quick read: your best and weakest hour and day, with the sample size behind each. Hours with fewer than a few trades are ignored so you are not reading noise.'
      },
      {
        q: 'Can I replay a trading day?',
        a: 'Click any day on the Dashboard calendar. Session replay steps through that day in order — plans, entries, exits, no-trade logs, running P&L and screenshots.'
      },
      {
        q: 'How does the journal search work?',
        a: 'Type plain English: "losing NQ trades last week after 11am". Every condition it understood shows as a removable chip, so you can see exactly what is being filtered and drop any part you did not mean.'
      }
    ]
  },
  {
    id: 'charts',
    title: 'Charts',
    items: [
      {
        q: 'What are the two charts in the Chart tab?',
        a: 'The live chart is a TradingView embed with real market data, indicators and symbol search. The execution map is drawn by TradeHelp itself from the prices you recorded, and works with no connection.'
      },
      {
        q: 'Why does the execution map have no candles?',
        a: 'Because TradeHelp does not store market data, so it has no candles to show you. Earlier versions filled the gap with a generated price series, which was clearly labelled but still put shapes on screen that never happened. The map now plots only what your journal actually knows: your entry, your exit, and your stop and target levels. The segment between entry and exit is dashed because that path is unknown.'
      },
      {
        q: 'Can I see real candles behind my trades?',
        a: 'Yes, if your platform can export price history. Settings → Chart data → Import bars. TradeHelp buys no market data, so this is history you already pay your own platform for: it is stored on your machine, works offline afterwards, and the trade chart becomes real candles with your entry, exit, stop and target drawn on top — which the live TradingView chart cannot do, because it does not know your levels. Without an import nothing changes.'
      },
      {
        q: 'Which platforms can export bars I can import?',
        a: 'NinjaTrader 8 (Tools → Historical Data → Export), TradingView, MetaTrader 4 and 5, and Sierra Chart are all handled, along with most other platforms — any CSV or text file of date, open, high, low, close and volume. The bars do not have to come from the broker you traded with; they are just market data for that instrument, so a free NinjaTrader simulation account can supply candles for trades you placed elsewhere.'
      },
      {
        q: 'I trade at a prop firm — does this work for me?',
        a: 'Almost certainly. Apex, TopStep, MyFundedFutures and similar firms mostly front-end on NinjaTrader, Tradovate, Quantower or TradingView, and NinjaTrader and TradingView between them cover the bulk of that market. Export from whichever of those you use. If your firm routes through Rithmic or CQG without an export option, pull the bars from any other platform that has the instrument — the data does not need to come from the account you traded.'
      },
      {
        q: 'The candles are offset from my entry marker.',
        a: 'The export used a different clock than TradeHelp assumed. Re-import and set "Times in the file are" to match: UTC for NinjaTrader and TradingView, or the broker server offset for MetaTrader, which commonly writes UTC+2 or UTC+3 with nothing in the file to say so. Files carrying an explicit offset, as TradingView writes, are handled automatically.'
      },
      {
        q: 'Do imported bars take up much space?',
        a: 'A platform export covers whole sessions, but only the minutes around a trade are ever drawn — on a typical export that is over 80% of the rows doing nothing. Settings → Chart data → Trim to trades keeps bars within four hours of one of your trades and reclaims the rest. Every context window up to ±4h keeps working; only ±1d may show gaps. It cannot be undone without exporting again, so it is never automatic.'
      },
      {
        q: 'How do I see the live chart for one of my trades?',
        a: 'Press "Live chart" on the execution map toolbar. It opens the TradingView chart already set to that trade\'s instrument, with real market data and full timeframe control. TradingView\'s embed cannot be pointed at a specific date, so scroll back to the trade time shown in the banner. A screenshot attached to the trade at the time is the other option, and the only one that works offline.'
      },
      {
        q: 'Why is there no timeframe selector on the trade chart?',
        a: 'Because the scale is deliberately fixed at four hours either side of the trade. That is what makes duration readable without clicking anything: a two-minute scalp and a four-hour hold look plainly different, where a chart sized to each trade would make them look identical. Scroll to zoom and drag to pan, then press "Fit trade" to come back. Four hours also matches what "Trim to trades" keeps, so the chart never asks for data trimming removed. The live TradingView chart has full timeframe control.'
      },
      {
        q: 'The execution map is empty for one of my trades.',
        a: 'That trade has no entry price recorded. Rather than estimate one, the chart says so. Add the entry price to the trade and it will draw. A trade with an entry but no exit yet plots the entry alone.'
      },
      {
        q: 'The live chart shows the wrong instrument.',
        a: 'Symbols are matched on the contract root, so NQ, MNQ, "NQ 06-24", /ES, ES_F and ESH5 all resolve correctly, and stock tickers are passed to TradingView unprefixed so it picks the right listing. If a symbol still resolves wrong, type the fully qualified form (for example CME_MINI:ES1!) into the symbol box — anything containing a colon is used exactly as written.'
      },
      {
        q: 'Does the live chart send my data anywhere?',
        a: 'The live chart loads from TradingView, so it needs a connection and TradingView can see which symbol you are viewing, the same as opening their site in a browser. Your trades, notes, prices and P&L are never sent — they stay in your local database. If you would rather nothing left your machine at all, use the execution map, which is built entirely from your own data.'
      },
      {
        q: 'The live chart is blank.',
        a: 'It needs an internet connection, since the data comes from TradingView. Offline, use the execution map instead.'
      }
    ]
  },
  {
    id: 'reviews',
    title: 'Reviews and wrap-ups',
    items: [
      {
        q: 'What is the weekly or monthly wrap-up?',
        a: 'It is a local recap built from your completed trades and recorded rule breaks: net P&L, record, win rate, repeated setups or emotions, your current weakness and one suggested focus. The numbers do not require AI; asking the Coach for a note is optional.'
      },
      {
        q: 'When does a wrap-up appear?',
        a: 'TradeHelp offers a completed weekly or monthly recap once for that period. A monthly wrap takes priority when both are ready. You can also open weekly recaps from Reviews and use the full-screen recap button there.'
      },
      {
        q: 'What happens to the focus I save?',
        a: 'Your focus is saved locally against that week or month. The next matching wrap shows it back to you so you can compare what you intended to work on with what your journal recorded.'
      },
      {
        q: 'Where are my written review notes?',
        a: 'Reviews → Saved notes lists every retrospective you wrote, newest first. Select one to reopen its period or delete the note. Deleting the note does not delete trades or their calculated statistics.'
      }
    ]
  },
  {
    id: 'coach',
    title: 'The AI coach',
    items: [
      {
        q: 'How do I set up the AI coach?',
        a: 'Settings → Model provider. Ollama is the simplest local option; the next answer walks through installing it and downloading a model. You can also point the OpenAI-compatible option at LM Studio or LocalAI on localhost and leave the API key blank to stay fully offline. A cloud key works too if you prefer.'
      },
      {
        q: 'How do I install Ollama and download a model?',
        a: [
          '1. Download Ollama from ollama.com/download, install it, and open the Ollama app.',
          '2. Open PowerShell or Command Prompt on Windows, or Terminal on macOS.',
          '3. Download one text model. Run: ollama pull qwen2.5:7b for strong everyday coaching, ollama pull qwen3:8b if you want the optional reasoning panel, or ollama pull llama3.2 for lighter hardware.',
          '4. Leave the terminal open until the download reaches 100%. Models are several gigabytes, so this can take a while.',
          '5. In TradeHelp, open Settings → Model provider. Keep Ollama selected, click Browse beside Model, and choose the model you downloaded.',
          '6. Click Test model. A successful test confirms the model can generate a reply and loads it into memory; the first load after restarting Ollama can be slower.',
          '7. Optional: for chart screenshots, also run ollama pull llama3.2-vision and select it under Vision model.'
        ].join('\n')
      },
      {
        q: 'Which model should I use?',
        a: 'qwen2.5:7b or llama3.1:8b give reliable everyday coaching. Use qwen3:8b if you specifically want the optional reasoning panel. Below about 3B, models start misreading or inventing trades. For reading chart screenshots you need a vision model such as llama3.2-vision.'
      },
      {
        q: 'Why does Ollama say my model does not support thinking?',
        a: 'Show model reasoning is optional and only works with thinking-capable Ollama models. If you see an Ollama 400 error such as "hermes3 does not support thinking," nothing is wrong with your journal or model installation. Open Settings → Coach & personal clock, turn off Show model reasoning, click Save coach & clock, and retry. Normal answer streaming still works. You can also switch to a thinking-capable model such as qwen3:8b; reasoning may make replies slower.'
      },
      {
        q: 'Why is the first coach response slow?',
        a: 'A local model has to load several gigabytes into memory after Ollama starts or when you switch models. Use Test model before opening the coach to verify and warm it. For faster everyday replies, choose Fast or Balanced response depth and leave Show model reasoning off; Deep mode and visible reasoning intentionally take longer.'
      },
      {
        q: 'What can the coach see?',
        a: 'Your full journal: trades with notes, reasons and self-grades, saved reviews, playbook, goals, rules and no-trade days. It coaches process and psychology — it does not predict prices or give trade signals.'
      },
      {
        q: 'Will it make things up?',
        a: 'There are hard guardrails telling it to use only your real data and to say when something is not there. Untagged trades are marked so it cannot invent an emotion you never recorded. If a small model still drifts, use a larger one.'
      },
      {
        q: 'Does my journal leave my machine?',
        a: 'With a local model, never. If you choose a cloud provider, Settings has a separate toggle controlling whether your written notes are included in what gets sent.'
      }
    ]
  },
  {
    id: 'discipline',
    title: 'Discipline tools',
    items: [
      {
        q: 'What is a coach commitment?',
        a: 'One measurable behaviour you commit to for your next N trades — a daily trade cap, a risk limit, an entry cutoff, a minimum R:R, requiring a stop, or a daily loss limit. TradeHelp grades each trade against it and always shows why it passed or missed.'
      },
      {
        q: 'What is the personal session clock?',
        a: 'It learns your usual trading window from your own history — no fixed market hours — and shows which phase you are in. If an hour has historically been much stronger or weaker for you, it will say so as you enter it.'
      },
      {
        q: 'How do achievements work?',
        a: 'Most reward behaviour, not P&L: tilt-free streaks, journaling consistency, honouring your stop, and completing commitments. A few clearly labelled troll achievements use humour to call out repeated rule breaks. Each has a difficulty tier, and achievements use best-ever tallies so once earned they stay earned.'
      },
      {
        q: 'Why log a no-trade day?',
        a: 'Sitting out is a decision worth recording. Logging it keeps your discipline streaks honest and feeds the coach context about the days you chose not to trade.'
      }
    ]
  },
  {
    id: 'prop',
    title: 'Prop firm accounts',
    items: [
      {
        q: 'How do I track an eval or funded account?',
        a: 'Accounts tab → Prop. Add each account with its profit target, daily loss limit and trailing drawdown; templates for common account sizes fill the numbers in for you.'
      },
      {
        q: 'What do the two bars on each account mean?',
        a: 'One is progress toward your profit target, the other is how much drawdown cushion you have left. The account closest to breaching gets flagged.'
      },
      {
        q: 'How do I keep prop and personal trades separate?',
        a: 'Tag each trade to Live or a specific prop account in the journal. The Dashboard has a Live / Prop / All toggle so your personal P&L never blurs into your eval stats.'
      },
      {
        q: 'Can I track payouts?',
        a: 'Yes — log each payout per account and see the all-time total. Your first payout unlocks a medal that climbs tiers as they stack up.'
      }
    ]
  },
  {
    id: 'housekeeping',
    title: 'Backups, trial and updates',
    items: [
      {
        q: 'How do I back up my journal?',
        a: 'Settings → Data & backup → Export backup writes a portable JSON of your records. A daily SQLite backup is also kept in your data folder. Note the JSON excludes screenshot files and API keys — for a complete backup, copy the whole data folder.'
      },
      {
        q: 'How does the trial and license work?',
        a: 'Every download starts a 14-day trial with everything unlocked — no account, no card. After that it is $50 once, and one key activates up to 2 devices. Your trades are never deleted when a trial ends.'
      },
      {
        q: 'How do updates work?',
        a: 'Updates download in the background and show a "Restart now" banner when they are ready — on macOS as well, now that the Mac build is signed and notarised by Apple. TradeHelp checks every 30 minutes and when you focus the window. Your journal is never touched by an update.'
      }
    ]
  }
]

const norm = (value) => String(value || '').toLowerCase()

// Filter sections to entries matching a query, keeping section grouping intact.
// Returns every section when the query is empty so the panel opens fully browsable.
export function searchHelp(query, sections = HELP_SECTIONS) {
  const q = norm(query).trim()
  if (!q) return sections
  const terms = q.split(/\s+/).filter(Boolean)
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const haystack = `${norm(item.q)} ${norm(item.a)} ${norm(section.title)}`
        return terms.every((term) => haystack.includes(term))
      })
    }))
    .filter((section) => section.items.length > 0)
}

export function helpItemCount(sections = HELP_SECTIONS) {
  return sections.reduce((total, section) => total + section.items.length, 0)
}
