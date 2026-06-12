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

    const patterns = Object.entries(s.byPatternTag || {})
      .sort((a, b) => b[1].trades - a[1].trades)
      .slice(0, 6)
      .map(
        ([tag, v]) =>
          `<span class="backtest-pattern"><code>${tag}</code> ${v.trades}t · ${v.winRate}% · ${fmtPct(v.avgReturnPct)}</span>`,
      )
      .join("");

    const maxDd =
      s.maxDrawdownPct != null
        ? `<span class="backtest-stat"><b>${fmtPct(-Math.abs(s.maxDrawdownPct))}</b> max DD</span>`
        : "";

    const flipLine = report.flipsInWindow
      ? `<span class="backtest-stat muted">${report.flipsInWindow.totalFlips?.toLocaleString?.("en-US") ?? 0} flips in window</span>`
      : "";

    el.innerHTML = `
      <div class="backtest-stats">
        <span class="backtest-stat"><b>${tradeCount}</b> trades</span>
        <span class="backtest-stat"><b>${s.winRate}%</b> win</span>
        <span class="backtest-stat"><b>${fmtPct(s.avgReturnPct)}</b> avg</span>
        ${maxDd}
        ${flipLine}
        <span class="backtest-stat muted">${w?.months ?? "?"}mo · ${w?.start ?? ""} → ${w?.end ?? ""}</span>
      </div>
      <p class="backtest-note muted">Q→D fresh-flip entries · Yahoo daily · optional RH/Polygon via env</p>
      <div class="backtest-sectors">${sectors}</div>
      ${patterns ? `<div class="backtest-patterns muted"><span class="backtest-patterns-label">Top tags:</span> ${patterns}</div>` : ""}
    `;
  }

  function renderSectorPatterns(data) {
    const el = document.getElementById("backtestSectorPatterns");
    if (!el || !data?.sectors) return;
    const blocks = Object.entries(data.sectors)
      .map(([name, sec]) => {
        const tops = (sec.topPatterns || []).slice(0, 3);
        if (!tops.length) return "";
        const lines = tops
          .map(
            (p) =>
              `<li><code>${p.pattern}</code> — ${p.trades}t, ${p.winRate}% win, ${fmtPct(p.avgReturnPct)}</li>`,
          )
          .join("");
        return `<div class="backtest-sector-block"><b>${name}</b><ul class="backtest-pattern-list">${lines}</ul></div>`;
      })
      .filter(Boolean)
      .join("");
    if (!blocks) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<p class="muted backtest-sector-patterns-title">Sector-era patterns</p>${blocks}`;
  }

  async function load() {
    try {
      const res = await fetch(asset("/data/paper-backtest/report.json"));
      if (!res.ok) throw new Error(String(res.status));
      render(await res.json());
    } catch {
      render(null);
    }
    try {
      const res = await fetch(asset("/data/paper-backtest/sector-patterns.json"));
      if (res.ok) renderSectorPatterns(await res.json());
    } catch {
      /* optional */
    }
  }

  window.BacktestPanel = { load, render };
  load();
})();
