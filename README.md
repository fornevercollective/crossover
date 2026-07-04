# crossover

stock BolingerBands/MACD/  

Multi-timeframe MACD / Bollinger flip board for Robinhood watchlists.

**Live site:** https://fornevercollective.github.io/crossover/

**Local preview:** `python3 -m http.server 8080` (open http://localhost:8080/crossover/)

## New: Live Trade Percentage Converter

Interactive position sizing tool for crypto & altcoins.

- Convert live between **% of holdings** ↔ **USD dollar amount** ↔ **coin quantity** at real-time 1-tick prices.
- What to enter directly into Robinhood or Coinbase trade tickets.
- Supports popular altcoins + any CoinGecko id.
- Auto-refreshing price feed, fee adjustment, presets, copy-to-clipboard entry strings.
- Perfect companion to the Flip Board signals.

**Open converter:** https://fornevercollective.github.io/crossover/live-percentage-converter.html

## Data refresh (from robinhood-agentic repo)

- `npm run watchlists:export`
- `npm run board:build:robinhood` (daily Q/M/W/D for all lists, ~1h)
- `npm run sector:activity` (sector Q/M/W/D/5h/1h flip heatmaps)
- `npm run site:publish` (symlinks charts)
- `npm run site:publish:push` (copies charts for git push)
- `git add -A && git commit -m "update flip board" && git push`

## About

stock BolingerBands/MACD/  
Link: https://fornevercollective.github.io/crossover/

---

*Part of fornevercollective trading & qbitOS ecosystem. See also freya.qbitos.ai for units/market converters.*