# crossover

Multi-timeframe MACD / Bollinger flip board for Robinhood watchlists.

Live site: https://fornevercollective.github.io/crossover/

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080/crossover/
```

## Refresh data (from robinhood-agentic repo)

```bash
npm run watchlists:export
npm run board:build:robinhood   # daily Q/M/W/D for all lists (~1h)
npm run site:publish            # symlinks charts (no duplicate in workspace)
npm run site:publish:push       # copies charts for git push
git add -A && git commit -m "update flip board" && git push
```
