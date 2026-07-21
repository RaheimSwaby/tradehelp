// A daily rotating quote for the dashboard. Deliberately mixed in tone — trading
// legends, market proverbs, discipline/mindset, and a few wry ones — and ordered so
// consecutive days land on different tones. Folk sayings are attributed to "…proverb"
// rather than pinned to a person, to avoid confident misattribution.
export const QUOTES = [
  { text: 'It was never my thinking that made the big money for me. It always was my sitting.', author: 'Jesse Livermore', tone: 'legend' },
  { text: 'Cut your losses short and let your winners run.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn', tone: 'mindset' },
  { text: 'The four most dangerous words in investing are: “this time it’s different.”', author: 'John Templeton', tone: 'wry' },
  { text: 'The consistency you seek is in your mind, not in the markets.', author: 'Mark Douglas', tone: 'legend' },
  { text: 'Bulls make money, bears make money, pigs get slaughtered.', author: 'Wall Street proverb', tone: 'proverb' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle', tone: 'mindset' },
  { text: 'I made my money by selling too soon.', author: 'Bernard Baruch', tone: 'wry' },
  { text: 'The most important rule of trading is to play great defense, not great offense.', author: 'Paul Tudor Jones', tone: 'legend' },
  { text: 'Plan the trade, and trade the plan.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Luck is what happens when preparation meets opportunity.', author: 'Seneca', tone: 'mindset' },
  { text: 'Wall Street is the only place people ride to in a Rolls-Royce to get advice from those who take the subway.', author: 'Warren Buffett', tone: 'wry' },
  { text: 'The elements of good trading are cutting losses, cutting losses, and cutting losses.', author: 'Ed Seykota', tone: 'legend' },
  { text: 'The trend is your friend — until the end when it bends.', author: 'Market proverb', tone: 'proverb' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius', tone: 'mindset' },
  { text: 'October: one of the peculiarly dangerous months to speculate in stocks. The others are July, January, September, April, November, May, March, June, December, August and February.', author: 'Mark Twain', tone: 'wry' },
  { text: 'Be fearful when others are greedy, and greedy when others are fearful.', author: 'Warren Buffett', tone: 'legend' },
  { text: 'When in doubt, stay out.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Discipline weighs ounces; regret weighs tons.', author: 'Jim Rohn', tone: 'mindset' },
  { text: 'Losers average losers.', author: 'Paul Tudor Jones', tone: 'legend' },
  { text: 'Buy the rumor, sell the news.', author: 'Market proverb', tone: 'proverb' },
  { text: 'I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times.', author: 'Bruce Lee', tone: 'mindset' },
  { text: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett', tone: 'legend' },
  { text: 'Trade what you see, not what you think.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Every battle is won before it is fought.', author: 'Sun Tzu', tone: 'mindset' },
  { text: 'It’s not whether you’re right or wrong that matters, but how much you make when right and how much you lose when wrong.', author: 'George Soros', tone: 'legend' },
  { text: 'A stop-loss is cheaper than hope.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Nothing is particularly hard if you divide it into small jobs.', author: 'Henry Ford', tone: 'mindset' },
  { text: 'Learn to take losses. The most important thing is not letting your losses get out of hand.', author: 'Marty Schwartz', tone: 'legend' },
  { text: 'Don’t confuse brains with a bull market.', author: 'Wall Street proverb', tone: 'wry' },
  { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder', tone: 'legend' },
  { text: 'The best trade is sometimes no trade.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier', tone: 'mindset' },
  { text: 'Whenever I enter a position, I have a predetermined stop. That is the only way I can sleep at night.', author: 'Bruce Kovner', tone: 'legend' },
  { text: 'Scared money never wins.', author: 'Trader’s proverb', tone: 'proverb' },
  { text: 'I’ve failed over and over and over again in my life. And that is why I succeed.', author: 'Michael Jordan', tone: 'mindset' },
  { text: 'Risk comes from not knowing what you’re doing.', author: 'Warren Buffett', tone: 'legend' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'Market proverb', tone: 'wry' },
  { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch', tone: 'legend' },
  { text: 'Let the winners run; the trade will tell you when it’s wrong.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'The way to build long-term returns is through preservation of capital and home runs.', author: 'Stanley Druckenmiller', tone: 'legend' },
  { text: 'Amateurs think about how much they can make; professionals think about how much they can lose.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'The market is never wrong; opinions often are.', author: 'Jesse Livermore', tone: 'legend' },
  { text: 'You miss 100% of the shots you don’t take — but a good trader also skips the bad ones.', author: 'Trading proverb', tone: 'wry' },
  { text: 'Letting losses run is the most serious mistake made by most investors.', author: 'William O’Neil', tone: 'legend' },
  { text: 'The market rewards patience and punishes the itch to act.', author: 'Trading proverb', tone: 'proverb' },
  { text: 'Motivation gets you going, but discipline keeps you growing.', author: 'John Maxwell', tone: 'mindset' },
  { text: 'There is nothing new on Wall Street. Speculation is as old as the hills.', author: 'Edwin Lefèvre', tone: 'legend' }
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
