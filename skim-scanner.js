/**
 * Skim scanner — offline iron-condor / dividend-lane candidates from flip-board rows.
 * Grok Option A stub: ranks range-bound + foam setups for take-profit skims (65% target).
 *
 * Live options/dividends need POLYGON_API_KEY (see scripts/polygon_bridge.py).
 */
(function () {
  const LIMIT = 15;
  const SKIM_TAKE = 0.65;

  function sectorKey(row) {
    return window.SectorColors?.sectorKey(row) || row.sector || row.lists?.[0] || "Other";
  }

  function sectorColor(name) {
    return window.SectorColors?.colorFor(name) || "#6b7280";
  }

  /** Range-bound + squeeze → iron-condor lane (offline proxy). */
  function condorScore(row) {
    const day = row.frames?.day;
    const week = row.frames?.week;
    let score = 0;
    const parts = [];

    if (day?.bbPosition === "inside" && week?.bbPosition === "inside") {
      score += 30;
      parts.push("BB range");
    }

    const dDays = day?.daysSinceFlip ?? 999;
    if (dDays >= 5 && dDays <= 30) {
      score += 18;
      parts.push("post-flip range");
    }

    let bulls = 0;
    let bears = 0;
    for (const f of ["quarter", "month", "week", "day"]) {
      const b = row.frames?.[f]?.macdBias;
      if (b === "bullish") bulls++;
      else if (b === "bearish") bears++;
    }
    const spread = Math.abs(bulls - bears);
    if (spread <= 2) {
      score += 16;
      parts.push("TF balanced");
    }

    const concepts = window.TradingConcepts?.analyze(row);
    const foam = concepts?.foamScore ?? 0;
    if (foam >= 30) {
      score += Math.min(20, Math.round(foam / 5));
      parts.push(`foam ${foam}`);
    }

    if (concepts?.tags?.includes("bb_squeeze")) {
      score += 12;
      parts.push("squeeze");
    }

    return {
      score: Math.min(100, score),
      foam,
      skimTarget: Math.round(foam * SKIM_TAKE),
      parts,
      concepts,
    };
  }

  /** Dividend-capture lane: bullish stack + sector strength (ex-date needs Polygon). */
  function dividendLane(row, sectorStats) {
    const concepts = window.TradingConcepts?.analyze(row, sectorStats);
    const day = row.frames?.day;
    const bullish =
      day?.macdBias === "bullish" &&
      (concepts?.tags?.includes("sector_strength") || concepts?.tags?.includes("multi_tf_confluence"));
    const holdWindow = (day?.daysSinceFlip ?? 0) >= 2 && (day?.daysSinceFlip ?? 0) <= 20;
    return bullish && holdWindow;
  }

  function rankRows(rows) {
    const sectorStats = window.TradingConcepts?.buildSectorStats(rows);
    return (rows || [])
      .map((row) => {
        const meta = condorScore(row);
        const divLane = dividendLane(row, sectorStats);
        return { row, meta, divLane };
      })
      .filter((x) => x.meta.score >= 28)
      .sort(
        (a, b) =>
          b.meta.skimTarget - a.meta.skimTarget ||
          b.meta.score - a.meta.score,
      )
      .slice(0, LIMIT);
  }

  function chipHtml(name) {
    const c = sectorColor(name);
    return `<span class="sector-chip skim-chip" style="--sector-color:${c}"><i></i>${name}</span>`;
  }

  function renderItem({ row, meta, divLane }) {
    const sym = row.id;
    const sk = sectorKey(row);
    const tags = window.TradingConcepts?.formatTags(meta.concepts?.tags || []) || [];
    const tagHtml = tags.length
      ? `<span class="skim-tags">${tags.slice(0, 3).map((t) => `<span class="skim-tag">${t}</span>`).join("")}</span>`
      : "";
    const divBadge = divLane ? `<span class="skim-div" title="Dividend lane (offline)">💰</span>` : "";

    return `<button type="button" class="skim-row" data-symbol="${sym}">
      <span class="skim-target">${meta.skimTarget}</span>
      <span class="skim-sym">${sym}</span>
      ${chipHtml(sk)}
      <span class="skim-score">${meta.score}</span>
      ${divBadge}
      ${tagHtml}
    </button>`;
  }

  function bindClicks(root) {
    root.querySelectorAll(".skim-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.dataset.symbol;
        const row = window.FlipBoard?.getRow?.(sym);
        if (window.FlipBoard?.selectSymbol) window.FlipBoard.selectSymbol(sym, row);
        else if (typeof selectSymbol === "function") selectSymbol(sym, row);
      });
    });
  }

  function update(rows) {
    const el = document.getElementById("skimScannerList");
    const countEl = document.getElementById("skimScannerCount");
    if (!el) return;

    const top = rankRows(rows);
    if (countEl) countEl.textContent = top.length ? `${top.length} skim` : "—";

    if (!top.length) {
      el.innerHTML =
        '<p class="skim-empty muted">No range-bound skim setups in current filter. Try broader list or wait for BB squeeze.</p>';
      return;
    }

    el.innerHTML = top.map(renderItem).join("");
    bindClicks(el);
  }

  window.SkimScanner = { condorScore, rankRows, update };
})();
