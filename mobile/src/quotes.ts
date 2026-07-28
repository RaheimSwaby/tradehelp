export type Quote = {
  quote: string
  author: string
}

export const TRADER_QUOTES: Quote[] = [
  { quote: "Plan the trade and trade the plan.", author: "Traditional Trading Rule" },
  { quote: "Risk management is what keeps you in the game long enough for your edge to work.", author: "Mark Douglas" },
  { quote: "Cut your losses short and let your winners run.", author: "David Ricardo" },
  { quote: "The goal of a successful trader is to make the best trades. Money is secondary.", author: "Alexander Elder" },
  { quote: "Amateurs focus on how much money they can make. Professionals focus on how much money they can lose.", author: "Paul Tudor Jones" },
  { quote: "Disciplined execution beats brilliant analysis every single time.", author: "TradeHelp Mindset" },
  { quote: "Don't focus on making money; focus on protecting what you have.", author: "Paul Tudor Jones" },
  { quote: "Losses are part of the business. Accept them quickly and move to the next setup.", author: "Mark Douglas" },
  { quote: "Patience in waiting for your setup is 80% of successful trading.", author: "Jesse Livermore" },
  { quote: "Your rule discipline today determines your account size tomorrow.", author: "TradeHelp Mindset" }
]

export function getDailyQuote(): Quote {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000)
  return TRADER_QUOTES[dayOfYear % TRADER_QUOTES.length] ?? TRADER_QUOTES[0]!
}
