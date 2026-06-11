/**
 * Top symbols most likely to MACD/BB flip soon — scored from board row fields.
 */
(function () {
  const ALIGN_TFS = ["quarter", "month", "week", "day"];
  const LIMIT = 25;

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

  /**
   * Imminent flip score 0–100 from daysSinceFlip, histogram/MACD tension, BB squeeze, alignment.
   */
  function imminentScore(row) {
    const frames = row.frames || {};
    const day = frames.day;
    const week = frames.week;
    let score = 0;
    const parts = [];

    if (day?.macdBias && day?.histogramBias && day.macdBias !== day.histogramBias) {
      score += 28;
      parts.push("D hist≠MACD");
    }
    if (week?.macdBias && week?.histogramBias && week.macdBias !== week.histogramBias) {
      score += 14;
      parts.push("W hist≠MACD");
    }

    const dDays = day?.daysSinceFlip ?? 999;
    if (dDays <= 2) {
      score += 22;
      parts.push(`${dDays}d fresh`);
    } else if (dDays >= 8 && dDays <= 25) {
      score += 16;
      parts.push(`${dDays}d stale`);
    } else if (dDays > 30) {
      score += 10;
      parts.push(`${dDays}d due`);
    }

    if (day?.bbPosition === "inside" && week?.bbPosition === "inside") {
      score += 12;
      parts.push("BB inside");
    }
    const closes = window.ChartCloses?.getCloses(row);
    const sq = closes?.length >= 26 ? window.BBSqueeze?.analyzeFromCloses(closes) : null;
    if (sq?.on) {
      score += Math.min(20, 10 + Math.round(sq.squeezeScore / 5));
      parts.push(`squeeze ${sq.widthPctile}%`);
    }
    if (sq?.release || sq?.predicted) {
      score += 14;
      parts.push(sq.release ? "release" : "flip due");
    }

    let bulls = 0;
    let bears = 0;
    for (const f of ALIGN_TFS) {
      const b = frames[f]?.macdBias;
      if (b === "bullish") bulls++;
      else if (b === "bearish") bears++;
    }
    const spread = Math.abs(bulls - bears);
    if (spread === 1) {
      score += 12;
      parts.push("TF mixed");
    } else if (spread === 2) {
      score += 8;
      parts.push("TF building");
    }

    const concepts = window.TradingConcepts?.analyze(row);
    if (concepts?.foamScore >= 35) {
      score += Math.min(12, Math.round(concepts.foamScore / 10));
    }

    return {
      score: Math.min(100, Math.round(score)),
      bias: day?.macdBias || "neutral",
      days: dDays === 999 ? null : dDays,
      parts,
      foamScore: concepts?.foamScore ?? 0,
      squeezeScore: sq?.squeezeScore ?? 0,
      skimSignal: concepts?.skimSignal ?? "neutral",
      conceptTags: concepts?.tags ?? [],
    };
  }

  function rankRows(rows, sectorStats) {
    return (rows || [])
      .map((row) => {
        if (window.TradingConcepts && sectorStats) {
          window.TradingConcepts.analyze(row, sectorStats);
        }
        const meta = imminentScore(row);
        return { row, meta };
      })
      .filter((x) => x.meta.score >= 25)
      .sort((a, b) => b.meta.score - a.meta.score || (a.meta.days ?? 999) - (b.meta.days ?? 999))
      .slice(0, LIMIT);
  }

  function chipHtml(name) {
    const c = sectorColor(name);
    return `<span class="sector-chip imminent-chip" style="--sector-color:${c}"><i></i>${name}</span>`;
  }

  function renderItem({ row, meta }) {
    const sym = row.id;
    const sk = sectorKey(row);
    const bias = biasLabel(row);
    const days = meta.days != null ? `${meta.days}d` : "—";
    const tags = window.TradingConcepts?.formatTags(meta.conceptTags) || [];
    const tagHtml = tags.length
      ? `<span class="imminent-tags">${tags.map((t) => `<span class="imminent-tag">${t}</span>`).join("")}</span>`
      : "";
    const foam =
      meta.foamScore >= 30
        ? `<span class="imminent-foam" title="Foam skim score">☕${meta.foamScore}</span>`
        : "";

    return `<button type="button" class="imminent-row" data-symbol="${sym}" data-bias="${bias}">
      <span class="imminent-rank-score">${meta.score}</span>
      <span class="imminent-sym">${sym}</span>
      ${chipHtml(sk)}
      <span class="imminent-days">${days}</span>
      <span class="imminent-bias ${bias}">${meta.bias}</span>
      ${foam}
      ${tagHtml}
    </button>`;
  }

  function bindClicks(root) {
    root.querySelectorAll(".imminent-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.dataset.symbol;
        const row = window.FlipBoard?.getRow?.(sym);
        if (window.FlipBoard?.selectSymbol) window.FlipBoard.selectSymbol(sym, row);
        else if (typeof selectSymbol === "function") selectSymbol(sym, row);
      });
    });
  }

  function update(rows) {
    const el = document.getElementById("imminentFlipsList");
    const countEl = document.getElementById("imminentFlipsCount");
    if (!el) return;

    const sectorStats = window.TradingConcepts?.buildSectorStats(rows);
    const top = rankRows(rows, sectorStats);

    if (countEl) countEl.textContent = top.length ? `${top.length} watch` : "—";

    if (!top.length) {
      el.innerHTML = '<p class="imminent-empty muted">No high-probability flip candidates in current filter.</p>';
      return;
    }

    el.innerHTML = top.map(renderItem).join("");
    bindClicks(el);
  }

  window.ImminentFlips = { imminentScore, rankRows, update };
})();
