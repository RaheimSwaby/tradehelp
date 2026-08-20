export function prepareTradingViewRequestHeaders(headers = {}) {
  return {
    ...headers,
    Referer: 'https://www.tradingview.com/'
  }
}
