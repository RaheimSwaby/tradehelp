# Directional Bias Engine plan

## Product boundary

The engine reports market context, not a trade instruction. Every instrument has one of four states:

- Bullish
- Bearish
- Neutral
- Unavailable

The interface always shows the factors, data timestamp, source, and invalidation level. AI may explain a completed calculation, but it never chooses the state or invents a price level.

## Version 1 inputs

Version 1 needs a supported one-minute OHLCV feed with at least two hours of current history.

- Two-hour trend: price relative to 20 and 50 EMA, plus EMA slope
- Market structure: confirmed swing highs and lows
- Session VWAP: price location and distance from VWAP
- Momentum: rate of change and range expansion
- Participation: current volume relative to the same time-of-day baseline

No order-flow claim is made from OHLCV bars. Bid/ask delta becomes a separate factor only when the connected provider supplies tick direction or market-by-order data.

## Score

The first implementation should be deterministic and replayable.

| Factor | Weight |
| --- | ---: |
| Two-hour trend | 35 |
| Market structure | 25 |
| Session VWAP | 20 |
| Momentum | 10 |
| Participation | 10 |

Each factor returns a value from -1 to +1 and an evidence string. The weighted score runs from -100 to +100.

- +20 to +100: Bullish
- -19 to +19: Neutral
- -100 to -20: Bearish
- Missing or stale data: Unavailable

The neutral band matters. Forcing a binary answer in balanced conditions makes the product look certain when the data is not.

## Example read

```text
NQ | Bullish | 64/100
Updated 10:14:00 ET | Provider: customer connection

2H trend       +28  Price above rising 20 and 50 EMA
Structure      +18  Higher high and higher low confirmed
VWAP           +14  Holding 0.32% above session VWAP
Momentum        +4  Positive, but no range expansion
Participation    0  Volume is near its time-of-day baseline

Invalid below 21,480, the last confirmed higher low.
```

## Freshness and failure rules

- One-minute data older than two minutes is stale.
- Stale or disconnected instruments show Unavailable, never the last bias as if it were live.
- A provider reconnect rebuilds the rolling window before publishing a state.
- Contract rolls use the provider's lead-volume contract, while the UI keeps the familiar root symbol.
- Every state change is logged with its inputs so it can be replayed and tested.

## Instrument rollout

Start with one venue to keep symbol handling and licensing manageable:

1. MNQ, MES, ES, NQ, GC, MGC, CL, and RTY through a CME-capable connection
2. EUR/USD, GBP/USD, and USD/JPY through a separate forex provider
3. VIX through a Cboe-capable provider

Spot forex has no single consolidated order book. If order flow is added later, label the source precisely or use CME currency futures as a proxy. Never call one broker's spot flow the whole market.

## Provider adapter

Market calculations must not know which vendor supplies the data.

```ts
interface MarketDataProvider {
  id: string
  capabilities(): Array<'quotes' | 'bars' | 'trades' | 'depth' | 'mbo'>
  connect(credentials): Promise<void>
  subscribeBars(symbols, interval, onBar): Unsubscribe
  getHistory(symbol, interval, from, to): Promise<Bar[]>
  status(): ProviderStatus
}
```

Customer-supplied API connections plug into this boundary. Credentials stay in the Electron main process and should move to the operating-system credential store before this ships. The renderer receives normalized market records, never raw API keys.

## Order-flow extension

Order flow is a capability, not a dependency of the first bias engine.

- Trades capability: aggressive buy/sell volume and cumulative delta
- Depth capability: price-level liquidity and imbalance
- MBO capability: adds, cancels, modifications, queue changes, and absorption research

The UI must name the exact feed and venue. For spot forex, broker-specific flow must be labelled broker-specific.

## Delivery sequence

1. Ship the deterministic five-minute Private Briefing using current quote and event sources.
2. Add the provider interface and secure credential storage.
3. Connect one customer-owned CME-capable API and build bar normalization.
4. Implement and replay-test the five bias factors.
5. Add a read-only Bias panel for the initial CME instrument group.
6. Measure usage before pursuing redistribution licensing or hosted order flow.
