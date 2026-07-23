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
        a: 'In a single SQLite database in your user data folder, with chart screenshots as files alongside it. Nothing is uploaded anywhere — no account, no server. Settings → Data & backup → "Open data folder" takes you straight to it.'
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
    id: 'coach',
    title: 'The AI coach',
    items: [
      {
        q: 'How do I set up the AI coach?',
        a: 'Settings → Model provider. Ollama is the simplest local option; you can also point the OpenAI-compatible option at LM Studio or LocalAI on localhost and leave the API key blank to stay fully offline. A cloud key works too if you prefer.'
      },
      {
        q: 'Which model should I use?',
        a: 'qwen2.5:7b or llama3.1:8b give reliable coaching. Below about 3B, models start misreading or inventing trades. For reading chart screenshots you need a vision model such as llama3.2-vision.'
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
        a: 'They reward behaviour, not P&L: tilt-free streaks, journaling consistency, honouring your stop, completing commitments. Each has a difficulty tier, and they use best-ever tallies so once earned they stay earned.'
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
