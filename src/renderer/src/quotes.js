// A daily rotating quote for the dashboard. Each entry carries attribution status and
// a source note so paraphrases, traditional maxims, and uncertain attributions are not
// presented as verified primary quotations.
export const QUOTES = [
  { text: 'It was never my thinking that made the big money for me. It always was my sitting.', author: 'Jesse Livermore (as recounted by Edwin Lefèvre)', tone: 'legend', attribution: 'secondary', source: 'Edwin Lefèvre, Reminiscences of a Stock Operator (1923)' },
  { text: 'Cut your losses short and let your winners run.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Commonly attributed to Jim Rohn', tone: 'mindset', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'The four most dangerous words in investing are: “this time it’s different.”', author: 'John Templeton', tone: 'wry', attribution: 'secondary', source: 'Quoted in The Templeton Touch by William Proctor (1983)' },
  { text: 'The consistency you seek is in your mind, not in the markets.', author: 'Mark Douglas', tone: 'legend', attribution: 'primary', source: 'Trading in the Zone (2000)' },
  { text: 'Bulls make money, bears make money, pigs get slaughtered.', author: 'Wall Street proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional Wall Street maxim; exact origin unknown' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant', tone: 'mindset', attribution: 'primary', source: 'The Story of Philosophy (1926), summarizing Aristotle' },
  { text: 'I made my money by selling too soon.', author: 'Commonly attributed to Bernard Baruch', tone: 'wry', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'The most important rule of trading is to play great defense, not great offense.', author: 'Paul Tudor Jones', tone: 'legend', attribution: 'secondary', source: 'Interview in Market Wizards by Jack D. Schwager (1989)' },
  { text: 'Plan the trade, and trade the plan.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Luck is what happens when preparation meets opportunity.', author: 'Commonly attributed to Seneca', tone: 'mindset', attribution: 'common', source: 'Common attribution; no matching passage verified in Seneca’s surviving works' },
  { text: 'Wall Street is the only place people ride to in a Rolls-Royce to get advice from those who take the subway.', author: 'Commonly attributed to Warren Buffett', tone: 'wry', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'The elements of good trading are cutting losses, cutting losses, and cutting losses.', author: 'Ed Seykota', tone: 'legend', attribution: 'secondary', source: 'Interview in Market Wizards by Jack D. Schwager (1989)' },
  { text: 'The trend is your friend — until the end when it bends.', author: 'Market proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional market rhyme; exact origin unknown' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Commonly attributed to Confucius', tone: 'mindset', attribution: 'common', source: 'Common attribution; no verified passage in the Analects identified' },
  { text: 'October: one of the peculiarly dangerous months to speculate in stocks. The others are July, January, September, April, November, May, March, June, December, August and February.', author: 'Mark Twain', tone: 'wry', attribution: 'primary', source: 'Pudd’nhead Wilson’s Calendar (1894)' },
  { text: 'Be fearful when others are greedy, and greedy when others are fearful.', author: 'Warren Buffett', tone: 'legend', attribution: 'primary', source: 'Berkshire Hathaway shareholder letter (2004)' },
  { text: 'When in doubt, stay out.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Discipline weighs ounces; regret weighs tons.', author: 'Commonly attributed to Jim Rohn', tone: 'mindset', attribution: 'common', source: 'Common attribution; wording varies and no verified primary source was identified' },
  { text: 'Losers average losers.', author: 'Paul Tudor Jones', tone: 'legend', attribution: 'secondary', source: 'Interview in Market Wizards by Jack D. Schwager (1989)' },
  { text: 'Buy the rumor, sell the news.', author: 'Market proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional market maxim; exact origin unknown' },
  { text: 'I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times.', author: 'Commonly attributed to Bruce Lee', tone: 'mindset', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Commonly attributed to Warren Buffett', tone: 'legend', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'Trade what you see, not what you think.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Every battle is won before it is fought.', author: 'Paraphrase of Sun Tzu', tone: 'mindset', attribution: 'paraphrase', source: 'Modern paraphrase inspired by The Art of War; not a direct translation' },
  { text: 'It’s not whether you’re right or wrong that matters, but how much you make when right and how much you lose when wrong.', author: 'George Soros', tone: 'legend', attribution: 'secondary', source: 'Quoted in Soros on Soros by Byron Wien and Krisztina Koenen (1995)' },
  { text: 'A stop-loss is cheaper than hope.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Nothing is particularly hard if you divide it into small jobs.', author: 'Commonly attributed to Henry Ford', tone: 'mindset', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'Learn to take losses. The most important thing is not letting your losses get out of hand.', author: 'Marty Schwartz', tone: 'legend', attribution: 'secondary', source: 'Interview in Market Wizards by Jack D. Schwager (1989)' },
  { text: 'Don’t confuse brains with a bull market.', author: 'Wall Street proverb', tone: 'wry', attribution: 'traditional', source: 'Traditional Wall Street maxim; exact origin unknown' },
  { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder', tone: 'legend', attribution: 'primary', source: 'Come Into My Trading Room (2002)' },
  { text: 'The best trade is sometimes no trade.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Commonly attributed to Robert Collier', tone: 'mindset', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'Whenever I enter a position, I have a predetermined stop. That is the only way I can sleep at night.', author: 'Bruce Kovner', tone: 'legend', attribution: 'secondary', source: 'Interview in Market Wizards by Jack D. Schwager (1989)' },
  { text: 'Scared money never wins.', author: 'Trader’s proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional gambling and trading maxim; exact origin unknown' },
  { text: 'I’ve failed over and over and over again in my life. And that is why I succeed.', author: 'Michael Jordan', tone: 'mindset', attribution: 'primary', source: 'Nike “Failure” commercial (1997)' },
  { text: 'Risk comes from not knowing what you’re doing.', author: 'Commonly attributed to Warren Buffett', tone: 'legend', attribution: 'common', source: 'Common attribution; no verified primary source identified' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'Market maxim, commonly attributed to John Maynard Keynes', tone: 'wry', attribution: 'common', source: 'Common attribution; exact wording and primary source are disputed' },
  { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch', tone: 'legend', attribution: 'primary', source: 'One Up on Wall Street (1989)' },
  { text: 'Let the winners run; the trade will tell you when it’s wrong.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional trading maxim; exact origin unknown' },
  { text: 'The way to build long-term returns is through preservation of capital and home runs.', author: 'Stanley Druckenmiller', tone: 'legend', attribution: 'secondary', source: 'Interview in The New Market Wizards by Jack D. Schwager (1992)' },
  { text: 'Amateurs think about how much they can make; professionals think about how much they can lose.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Traditional risk-management maxim; exact origin unknown' },
  { text: 'The market is never wrong; opinions often are.', author: 'Jesse Livermore (as recounted by Edwin Lefèvre)', tone: 'legend', attribution: 'secondary', source: 'Edwin Lefèvre, Reminiscences of a Stock Operator (1923)' },
  { text: 'You miss 100% of the shots you don’t take — but a good trader also skips the bad ones.', author: 'Trading adaptation', tone: 'wry', attribution: 'adaptation', source: 'Trading adaptation of a saying commonly attributed to Wayne Gretzky' },
  { text: 'Letting losses run is the most serious mistake made by most investors.', author: 'William O’Neil', tone: 'legend', attribution: 'primary', source: 'How to Make Money in Stocks (1988)' },
  { text: 'The market rewards patience and punishes the itch to act.', author: 'Trading proverb', tone: 'proverb', attribution: 'traditional', source: 'Modern trading maxim; exact origin unknown' },
  { text: 'Motivation gets you going, but discipline keeps you growing.', author: 'John C. Maxwell', tone: 'mindset', attribution: 'primary', source: 'The 15 Invaluable Laws of Growth (2012)' },
  { text: 'There is nothing new on Wall Street. Speculation is as old as the hills.', author: 'Edwin Lefèvre', tone: 'legend', attribution: 'primary', source: 'Reminiscences of a Stock Operator (1923)' }
]

// Deterministic once-per-day rotation that cycles the whole list before repeating.
export function quoteOfTheDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const ms = d.getTime()
  if (!Number.isFinite(ms) || !QUOTES.length) return QUOTES[0]
  // Local-day index since the epoch, so it advances at the user's local midnight.
  const dayIndex = Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000)
  return QUOTES[((dayIndex % QUOTES.length) + QUOTES.length) % QUOTES.length]
}

function nextWindowLabel(nextWindow) {
  if (typeof nextWindow === 'string') return nextWindow.trim()
  return String(nextWindow?.windowLabel || nextWindow?.label || nextWindow?.timeLabel || '').trim()
}

function minutesUntilWindow(now, window) {
  const start = Number(window?.start)
  if (!Number.isFinite(start)) return null
  const current = now.getHours() * 60 + now.getMinutes()
  return ((start - current) % (24 * 60) + (24 * 60)) % (24 * 60)
}

// Pure copy helper for dashboard/header integration. It describes only the user's
// journal rhythm; it never labels a fixed exchange or market session.
export function buildDataAwareGreeting({ now = new Date(), personalClock = null, nextWindow = null, cleanStreak = 0 } = {}) {
  const date = now instanceof Date ? now : new Date(now)
  const validDate = Number.isFinite(date.getTime())
  const hour = validDate ? date.getHours() : 12
  const salutation = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'
  const cues = []
  const clockLabel = nextWindowLabel(personalClock)

  if (clockLabel && personalClock?.phase && personalClock.phase !== 'off') {
    cues.push(`Your journal-based clock puts you in your usual ${clockLabel} trading window.`)
  } else {
    const upcomingWindow = clockLabel ? personalClock : nextWindow
    const upcoming = clockLabel || nextWindowLabel(nextWindow)
    const minutes = validDate ? minutesUntilWindow(date, upcomingWindow) : null
    if (upcoming && minutes != null && minutes > 0 && minutes <= 180) {
      cues.push(`Your next usual trading window begins in ${minutes} minute${minutes === 1 ? '' : 's'} (${upcoming}), based on your journal history.`)
    } else if (upcoming) {
      cues.push(`Your next usual trading window is ${upcoming}, based on your journal history.`)
    }
  }

  const streak = Math.max(0, Math.floor(Number(cleanStreak) || 0))
  if (streak > 0) cues.push(`Your ${streak}-trade clean streak is active—protect the process one decision at a time.`)

  return [salutation, ...cues].join(' ')
}
