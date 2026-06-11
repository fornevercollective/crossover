/**
 * Trading concepts — lightweight tags from flip-board row data.
 * "Coffee/beer foam skimming": take quick profits from volatile/frothy moves
 * without holding through noise. Rules documented inline; no external APIs.
 *
 * Future hooks (env / providers — not required for offline math):
 *   POLYGON_API_KEY  — intraday volume, gap detection
 *   T5X_*            — alternative TA feed
 *   RH_*             — official quotes (see paper-probe.ts)
 *   GROK_*           — narrative sentiment overlay
 */
(function () {
  const ALIGN_TFS = ["quarter", "month", "week", "day"];

  function sectorKey(row) {
    return window.SectorColors?.sectorKey(row) || row.sector || row.lists?.[0] || "Other";
  }

  /** MACD histogram vs signal tension — crossover may be near. */
  function histogramTension(frame) {
    if (!frame?.macdBias || !frame?.histogramBias) return 0;
    return frame.macdBias !== frame.histogramBias ? 1 : 0;
  }

  /**
   * Tag symbols with skimmable concept flags from existing board fields.
   * @returns {{ tags: string[], foamScore: number, skimSignal: 'long'|'short'|'neutral', hints: string[] }}
   */
  function analyze(row, sectorStats) {
    const frames = row.frames || {};
    const day = frames.day;
    const week = frames.week;
    const tags = [];
    const hints = [];
    let foam = 0;

    const dFlip = day?.daysSinceFlip ?? 999;
    if (dFlip <= 2) {
      tags.push("flip_freshness");
      foam += 18;
      hints.push("Fresh day flip — momentum burst window.");
    }

    if (day?.macdBias === day?.histogramBias && dFlip <= 5) {
      tags.push("momentum_burst");
      foam += 14;
    }

    const bb = day?.bbPosition;
    if (bb === "below_lower" || bb === "above_upper") {
      tags.push("mean_reversion_bb");
      foam += 16;
      hints.push("Price at BB extreme — foam skim / fade candidate.");
    } else if (bb === "inside" && week?.bbPosition === "inside") {
      tags.push("bb_squeeze");
      foam += 12;
      hints.push("BB squeeze — breakout or flip may follow.");
    }

    if (histogramTension(day)) {
      tags.push("histogram_cross_pending");
      foam += 15;
      hints.push("Day histogram diverges from MACD — crossover approaching.");
    }
    if (histogramTension(week)) {
      tags.push("week_histogram_tension");
      foam += 8;
    }

    let bulls = 0;
    let bears = 0;
    for (const f of ALIGN_TFS) {
      const b = frames[f]?.macdBias;
      if (b === "bullish") bulls++;
      else if (b === "bearish") bears++;
    }
    if (bulls >= 3 || bears >= 3) {
      tags.push("multi_tf_confluence");
      foam += 12;
    }

    const spread = Math.abs(bulls - bears);
    if (
      spread <= 2 &&
      day?.bbPosition === "inside" &&
      week?.bbPosition === "inside" &&
      dFlip >= 5
    ) {
      tags.push("iron_condor_range");
      foam += 14;
      hints.push("Range-bound squeeze — iron condor / skim lane (offline proxy).");
    }

    if (foam >= 50) {
      tags.push("skim_take_profit");
      hints.push("High foam — consider 50–70% skim target on premium/range trades.");
    }

    const sk = sectorKey(row);
    const sec = sectorStats?.[sk];
    if (sec && sec.total >= 5) {
      const bullPct = sec.bull / sec.total;
      if (bullPct >= 0.6 && day?.macdBias === "bullish") {
        tags.push("sector_strength");
        foam += 10;
      } else if (bullPct <= 0.35 && day?.macdBias === "bearish") {
        tags.push("sector_weakness");
        foam += 10;
      }
    }

    foam = Math.min(100, Math.round(foam));

    let skimSignal = "neutral";
    if (foam >= 40) {
      if (day?.macdBias === "bullish" && tags.includes("momentum_burst")) skimSignal = "long";
      else if (day?.macdBias === "bearish" && tags.includes("momentum_burst")) skimSignal = "short";
      else if (tags.includes("mean_reversion_bb")) {
        skimSignal = bb === "below_lower" ? "long" : bb === "above_upper" ? "short" : "neutral";
      } else if (bulls > bears) skimSignal = "long";
      else if (bears > bulls) skimSignal = "short";
    }

    return { tags, foamScore: foam, skimSignal, hints };
  }

  function buildSectorStats(rows) {
    const stats = {};
    for (const row of rows || []) {
      const sk = sectorKey(row);
      if (!stats[sk]) stats[sk] = { bull: 0, bear: 0, total: 0 };
      stats[sk].total++;
      const b = row.frames?.day?.macdBias;
      if (b === "bullish") stats[sk].bull++;
      else if (b === "bearish") stats[sk].bear++;
    }
    return stats;
  }

  function formatTags(tags) {
    const labels = {
      flip_freshness: "Fresh flip",
      momentum_burst: "Momentum",
      mean_reversion_bb: "BB fade",
      bb_squeeze: "Squeeze",
      histogram_cross_pending: "Hist×MACD",
      week_histogram_tension: "W tension",
      multi_tf_confluence: "Q→D stack",
      iron_condor_range: "Condor",
      skim_take_profit: "Skim 65%",
      sector_strength: "Sector↑",
      sector_weakness: "Sector↓",
    };
    return (tags || []).slice(0, 4).map((t) => labels[t] || t);
  }

  window.TradingConcepts = { analyze, buildSectorStats, formatTags, sectorKey };
})();
