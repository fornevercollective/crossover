/**
 * 3-day swing breakout picks — one top symbol per Robinhood sector/list.
 */
(function () {
  function sectorKey(row) {
    return window.SectorColors?.sectorKey(row) || row.sector || row.lists?.[0] || "Other";
  }

  function sectorColor(name) {
    return window.SectorColors?.colorFor(name) || "#6b7280";
  }

  function biasLabel(row) {
    const day = row.frames?.day?.macdBias;
    if (day === "bullish") return "bull";
    if (day === "bearish") return "bear";
    return "flat";
  }

  function squeezeMeta(row) {
    const closes = window.ChartCloses?.getCloses(row);
    return closes?.length >= 26 ? window.BBSqueeze?.analyzeFromCloses(closes) : null;
  }

  /**
   * Composite 3-day swing score from imminent flip, squeeze, Q→D profit, fresh flip, foam.
   */
  function swingScore(row, sectorStats) {
    if (window.TradingConcepts && sectorStats) {
      window.TradingConcepts.analyze(row, sectorStats);
    }
    const imminent = window.ImminentFlips?.imminentScore(row) || { score: 0 };
    const profit = window.FlipBoard?.profitMeta(row) || { score: 0, side: "neutral" };
    const concepts = window.TradingConcepts?.analyze(row, sectorStats) || { foamScore: 0, skimSignal: "neutral" };
    const sq = squeezeMeta(row);

    let score = imminent.score * 0.35;
    score += profit.score * 0.25;

    const dDays = row.frames?.day?.daysSinceFlip ?? 999;
    if (dDays <= 3) score += 18 - dDays * 3;

    if (sq?.release) score += 16;
    else if (sq?.predicted) score += 10;
    else if (sq?.on) score += Math.min(8, (sq.squeezeScore || 0) / 12);

    if (concepts.foamScore >= 25) score += Math.min(12, concepts.foamScore / 8);
    if (concepts.skimSignal !== "neutral") score += 4;

    return {
      score: Math.min(100, Math.round(score)),
      bias: row.frames?.day?.macdBias || "neutral",
      days: dDays === 999 ? null : dDays,
      profitScore: profit.score,
      imminentScore: imminent.score,
      squeezeScore: sq?.squeezeScore ?? 0,
      foamScore: concepts.foamScore,
      sq,
    };
  }

  function pickBySector(rows, sectorStats) {
    const best = new Map();
    for (const row of rows || []) {
      const sk = sectorKey(row);
      const meta = swingScore(row, sectorStats);
      if (meta.score < 22) continue;
      const prev = best.get(sk);
      if (!prev || meta.score > prev.meta.score) best.set(sk, { row, meta });
    }

    const order = window.SectorColors?.SECTOR_ORDER || [];
    return [...best.entries()]
      .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a[0].localeCompare(b[0]);
      })
      .map(([sector, pick]) => ({ sector, ...pick }));
  }

  function chipHtml(name) {
    const c = sectorColor(name);
    return `<span class="sector-chip swing-chip" style="--sector-color:${c}"><i></i>${name}</span>`;
  }

  function renderItem({ sector, row, meta }) {
    const sym = row.id;
    const bias = biasLabel(row);
    const days = meta.days != null ? `${meta.days}d` : "—";
    const sqHint = meta.sq?.release ? " · release" : meta.sq?.on ? " · squeeze" : "";

    return `<button type="button" class="swing-row" data-symbol="${sym}" data-bias="${bias}" title="Imminent ${meta.imminentScore} · Profit ${meta.profitScore}${sqHint}">
      ${chipHtml(sector)}
      <span class="swing-sym">${sym}</span>
      <span class="swing-score">${meta.score}</span>
      <span class="swing-days">${days}</span>
      <span class="swing-bias ${bias}">${meta.bias}</span>
    </button>`;
  }

  function bindClicks(root) {
    root.querySelectorAll(".swing-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.dataset.symbol;
        const row = window.FlipBoard?.getRow?.(sym);
        if (window.FlipBoard?.selectSymbol) window.FlipBoard.selectSymbol(sym, row);
        else if (typeof selectSymbol === "function") selectSymbol(sym, row);
      });
    });
  }

  function update(rows) {
    const el = document.getElementById("swingBreakoutsList");
    const countEl = document.getElementById("swingBreakoutsCount");
    if (!el) return;

    const sectorStats = window.TradingConcepts?.buildSectorStats(rows);
    const picks = pickBySector(rows, sectorStats);

    if (countEl) countEl.textContent = picks.length ? `${picks.length} sectors` : "—";

    if (!picks.length) {
      el.innerHTML =
        '<p class="swing-empty muted">No swing breakout picks in current filter — widen list or wait for fresh flips.</p>';
      return;
    }

    el.innerHTML = picks.map(renderItem).join("");
    bindClicks(el);
  }

  window.SwingBreakouts = { swingScore, pickBySector, update };
})();
