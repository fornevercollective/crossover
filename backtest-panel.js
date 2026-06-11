/**
 * Paper backtest summary — loads data/paper-backtest/report.json on static site.
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";

  function asset(path) {
    return `${BASE}${path}`;
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  }

  function render(report) {
    const el = document.getElementById("backtestPanel");
    if (!el) return;

    const s = report?.summary;
    const w = report?.window;
    if (!s || s.tradeCount === 0) {
      el.innerHTML =
        '<p class="backtest-empty muted">No backtest report. Run <code>npm run backtest:paper -- --months 6</code> then <code>npm run site:publish</code>.</p>';
      return;
    }

    const tradeCount = Number(s.tradeCount).toLocaleString("en-US");
    const sectors = Object.entries(s.bySector || {})
      .sort((a, b) => b[1].trades - a[1].trades)
      .map(
        ([name, v]) =>
          `<span class="backtest-sector"><b>${name}</b> ${Number(v.trades).toLocaleString("en-US")}t · ${v.winRate}% win · ${fmtPct(v.avgReturnPct)}</span>`,
      )
      .join("");

    const maxDd =
      s.maxDrawdownPct != null
        ? `<span class="backtest-stat"><b>${fmtPct(-Math.abs(s.maxDrawdownPct))}</b> max DD</span>`
        : "";

    el.innerHTML = `
      <div class="backtest-stats">
        <span class="backtest-stat"><b>${tradeCount}</b> trades</span>
        <span class="backtest-stat"><b>${s.winRate}%</b> win</span>
        <span class="backtest-stat"><b>${fmtPct(s.avgReturnPct)}</b> avg</span>
        ${maxDd}
        <span class="backtest-stat muted">${w?.months ?? "?"}mo · ${w?.start ?? ""} → ${w?.end ?? ""}</span>
      </div>
      <p class="backtest-note muted">Q→D fresh-flip entries · Yahoo daily · optional RH/Polygon via env</p>
      <div class="backtest-sectors">${sectors}</div>
    `;
  }

  async function load() {
    try {
      const res = await fetch(asset("/data/paper-backtest/report.json"));
      if (!res.ok) throw new Error(String(res.status));
      render(await res.json());
    } catch {
      render(null);
    }
  }

  window.BacktestPanel = { load, render };
  load();
})();
