<img width="817" height="763" alt="Screenshot 2026-06-10 at 11 11 31 pm" src="https://github.com/user-attachments/assets/28db1ea4-0150-423c-aa8d-5575a27718cc" />
<img width="817" height="763" alt="Screenshot 2026-06-10 at 11 11 13 pm" src="https://github.com/user-attachments/assets/23500924-66e5-4930-a7ab-9a61f396b2c7" />

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
