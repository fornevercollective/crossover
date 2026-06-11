/**
 * Robinhood-style list header + mini distribution chart for filtered universe.
 */
(function () {
  const PAL = {
    canvasTop: "#151a22",
    canvasBot: "#1a2130",
    bull: ["#2ee89a", "#3dd68c"],
    bear: ["#ff8a93", "#f07178"],
    neutral: ["#4a5268", "#6b7280"],
    accent: "#7aa2f7",
    gold: "#e6c068",
    text: "#9aa0a6",
    textBright: "#e8eaed",
    longMid: ["#5ee0a8", "#3dd68c"],
    shortMid: ["#ffb0b6", "#f07178"],
    flat: ["#3d4558", "#565f75"],
  };

  function fillCanvasBg(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PAL.canvasTop);
    g.addColorStop(1, PAL.canvasBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function barGradient(ctx, x, y, h, colors) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    return g;
  }

  function roundBar(ctx, x, y, w, h, fill, r) {
    if (h < 1) return;
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const LIST_BLURBS = {
    China: "Explore ADRs and China-exposed names on Robinhood.",
    Technology: "Software, semiconductors, and tech leaders from Robinhood curated lists.",
    "Energy & Water": "Power, utilities, and energy names — follow full list in the RH app.",
    ETFs: "Exchange-traded funds across sectors and themes.",
    "Manufacturing & Materials": "Industrial and materials stocks from Robinhood lists.",
    "IPO Access": "Recent and upcoming IPOs on Robinhood.",
    "Metals Futures": "Rock on with futures based on metals like gold, silver and copper.",
    Cryptos: "Crypto assets available on Robinhood.",
    Options: "Options watchlists and chains — entertainment / research only.",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function activeListMeta() {
    const watchlist = document.getElementById("watchlist")?.value || "";
    const section = document.getElementById("sectionFilter")?.value || "";
    const lists = window.FlipBoard?.watchlists?.lists || [];

    if (watchlist) {
      const lst = lists.find((l) => l.display_name === watchlist);
      return {
        title: watchlist,
        count: window.FlipBoard?.filteredCount?.() ?? 0,
        owner: lst?.owner_type === "robinhood" ? "Robinhood" : "Custom",
        blurb: LIST_BLURBS[watchlist] || `Symbols from your ${watchlist} watchlist.`,
        href: lst?.owner_type === "robinhood" ? "https://robinhood.com/lists/robinhood" : null,
      };
    }

    const sectionLabels = {
      curated: "Robinhood Curated",
      custom: "My Watchlists",
      options: "Options",
      indexes: "Market Indexes",
    };

    if (section) {
      return {
        title: sectionLabels[section] || section,
        count: window.FlipBoard?.filteredCount?.() ?? 0,
        owner: section === "curated" ? "Robinhood" : section,
        blurb: "Browse MACD / Bollinger flips across this Robinhood section.",
        href: section === "curated" ? "https://robinhood.com/lists/robinhood" : null,
      };
    }

    return {
      title: "All symbols",
      count: window.FlipBoard?.filteredCount?.() ?? 0,
      owner: "Robinhood",
      blurb: "Multi-timeframe MACD & Bollinger flip board — curated lists from robinhood.com/lists.",
      href: "https://robinhood.com/lists/robinhood",
    };
  }

  const SC = () => window.SectorColors;

  function sectorKey(row) {
    return SC()?.sectorKey(row) || row.sector || row.lists?.[0] || "Other";
  }

  function setupCanvas(canvas) {
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function drawDistChart(rows) {
    const canvas = $("listDistChart");
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    fillCanvasBg(ctx, w, h);

    let bull = 0;
    let bear = 0;
    let neutral = 0;
    for (const row of rows) {
      const b = row.frames?.day?.macdBias;
      if (b === "bullish") bull++;
      else if (b === "bearish") bear++;
      else neutral++;
    }
    const total = Math.max(1, bull + bear + neutral);
    const bars = [
      { label: "Bull D", value: bull, colors: PAL.bull },
      { label: "Bear D", value: bear, colors: PAL.bear },
      { label: "Flat", value: neutral, colors: PAL.neutral },
    ];

    const pad = 8;
    const barW = (w - pad * 2) / bars.length - 6;
    bars.forEach((b, i) => {
      const x = pad + i * (barW + 6);
      const bh = Math.max(2, ((h - 24) * b.value) / total);
      const y = h - 16 - bh;
      roundBar(ctx, x, y, barW, bh, barGradient(ctx, x, y, bh, b.colors), 4);
      ctx.fillStyle = PAL.text;
      ctx.font = "9px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, x + barW / 2, h - 4);
    });
  }

  function drawSectorChart(rows) {
    const canvas = $("listSectorChart");
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    fillCanvasBg(ctx, w, h);

    const bySector = new Map();
    for (const row of rows) {
      const key = sectorKey(row);
      if (!bySector.has(key)) bySector.set(key, { bull: 0, bear: 0, neutral: 0, total: 0 });
      const bucket = bySector.get(key);
      bucket.total++;
      const bias = row.frames?.day?.macdBias;
      if (bias === "bullish") bucket.bull++;
      else if (bias === "bearish") bucket.bear++;
      else bucket.neutral++;
    }

    const sorted = SC()?.sortSectors([...bySector.keys()]) || [...bySector.keys()];
    const sectors = sorted
      .map((name) => [name, bySector.get(name)])
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);
    if (!sectors.length) {
      ctx.fillStyle = PAL.text;
      ctx.font = "11px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No sector data", w / 2, h / 2);
      return;
    }

    const labelW = Math.min(108, w * 0.34);
    const padY = 6;
    const rowH = Math.min(14, (h - padY * 2) / sectors.length - 2);
    const barX = labelW + 14;
    const barW = w - barX - 36;
    const maxTotal = Math.max(1, ...sectors.map(([, s]) => s.total));

    ctx.font = "10px system-ui,sans-serif";
    ctx.textBaseline = "middle";

    sectors.forEach(([name, stats], i) => {
      const y = padY + i * (rowH + 3) + rowH / 2;
      const scale = barW / maxTotal;
      const bw = stats.total * scale;
      let x = barX;
      const accent = SC()?.colorFor(name) || PAL.accent;

      ctx.beginPath();
      ctx.arc(labelW - 6, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.textAlign = "right";
      const short = name.length > 14 ? `${name.slice(0, 13)}…` : name;
      ctx.fillText(short, labelW, y);

      if (bw > 0) {
        roundBar(ctx, barX, y - rowH / 2 + 1, bw, rowH - 2, SC()?.tint(accent, 0.22) || "rgba(122,162,247,0.22)", 3);
      }

      const segments = [
        { n: stats.bull, colors: PAL.bull },
        { n: stats.bear, colors: PAL.bear },
        { n: stats.neutral, colors: PAL.neutral },
      ];
      for (const seg of segments) {
        if (!seg.n) continue;
        const sw = (seg.n / stats.total) * bw;
        const by = y - rowH / 2 + 1;
        const bh = rowH - 2;
        roundBar(ctx, x, by, sw, bh, barGradient(ctx, x, by, bh, seg.colors), 3);
        x += sw;
      }

      ctx.fillStyle = PAL.text;
      ctx.textAlign = "left";
      ctx.fillText(String(stats.total), barX + bw + 4, y);
    });

    renderSectorLegend(sectors.map(([n]) => n));
  }

  function renderSectorLegend(names) {
    const el = $("listSectorLegend");
    if (!el || !SC()) return;
    el.innerHTML = names
      .map((name) => {
        const c = SC().colorFor(name);
        return `<span class="rh-sector-key" style="--sector-color:${c}"><i></i>${name}</span>`;
      })
      .join("");
  }

  function drawProfitChart(rows) {
    const canvas = $("listProfitChart");
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    fillCanvasBg(ctx, w, h);

    const profitMeta = window.FlipBoard?.profitMeta;
    const buckets = [
      { key: "highLong", label: "High long", colors: PAL.bull },
      { key: "midLong", label: "Mid long", colors: PAL.longMid },
      { key: "neutral", label: "Low / flat", colors: PAL.flat },
      { key: "midShort", label: "Mid short", colors: PAL.shortMid },
      { key: "highShort", label: "High short", colors: PAL.bear },
    ];
    const counts = Object.fromEntries(buckets.map((b) => [b.key, 0]));
    let scoreSum = 0;
    let scoreN = 0;
    let dayBull = 0;
    let dayBear = 0;

    for (const row of rows) {
      const dayBias = row.frames?.day?.macdBias;
      if (dayBias === "bullish") dayBull++;
      if (dayBias === "bearish") dayBear++;

      if (!profitMeta) continue;
      const p = profitMeta(row);
      scoreSum += p.score;
      scoreN++;

      if (p.side === "long") {
        if (p.score >= 70) counts.highLong++;
        else if (p.score >= 40) counts.midLong++;
        else counts.neutral++;
      } else if (p.side === "short") {
        if (p.score >= 70) counts.highShort++;
        else if (p.score >= 40) counts.midShort++;
        else counts.neutral++;
      } else {
        counts.neutral++;
      }
    }

    const max = Math.max(1, ...Object.values(counts));
    const pad = 8;
    const barW = (w - pad * 2) / buckets.length - 4;
    buckets.forEach((b, i) => {
      const x = pad + i * (barW + 4);
      const val = counts[b.key];
      const bh = Math.max(2, ((h - 28) * val) / max);
      const y = h - 18 - bh;
      roundBar(ctx, x, y, barW, bh, barGradient(ctx, x, y, bh, b.colors), 4);
      ctx.fillStyle = PAL.text;
      ctx.font = "8px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, x + barW / 2, h - 6);
      if (val > 0) {
        ctx.fillStyle = PAL.textBright;
        ctx.font = "9px system-ui,sans-serif";
        ctx.fillText(String(val), x + barW / 2, y - 3);
      }
    });

    const statsEl = $("listProfitStats");
    if (statsEl) {
      const avg = scoreN ? Math.round(scoreSum / scoreN) : 0;
      statsEl.innerHTML = `
        <span class="rh-profit-stat--accent"><strong>Avg score</strong> ${avg}%</span>
        <span class="rh-profit-stat--long"><strong>Day bull</strong> ${dayBull.toLocaleString()}</span>
        <span class="rh-profit-stat--short"><strong>Day bear</strong> ${dayBear.toLocaleString()}</span>
        <span class="rh-profit-stat--long"><strong>High long</strong> ${counts.highLong.toLocaleString()}</span>
        <span class="rh-profit-stat--short"><strong>High short</strong> ${counts.highShort.toLocaleString()}</span>
      `;
    }
  }

  let lastRows = [];

  function redrawCharts() {
    drawDistChart(lastRows);
    drawSectorChart(lastRows);
    drawProfitChart(lastRows);
  }

  function renderChangeSummary(rows) {
    const el = $("listChangeSummary");
    if (!el) return;
    let rising = 0;
    let falling = 0;
    for (const row of rows) {
      const flip = row.frames?.day?.lastFlip?.type || "";
      if (flip.includes("bullish") || flip.includes("reentry") && flip.includes("lower")) rising++;
      if (flip.includes("bearish") || flip.includes("breakdown")) falling++;
    }
    el.innerHTML = `
      <button type="button" class="rh-filter-chip rh-filter-chip--rising" data-filter="bull">↑ Rising flips <strong>${rising.toLocaleString()}</strong></button>
      <button type="button" class="rh-filter-chip rh-filter-chip--falling" data-filter="bear">↓ Falling flips <strong>${falling.toLocaleString()}</strong></button>
    `;
  }

  function update(rows) {
    const meta = activeListMeta();
    $("listTitle").textContent = meta.title;
    $("listCount").textContent = meta.count.toLocaleString();
    $("listOwner").textContent = meta.owner;
    $("listBlurb").textContent = meta.blurb;
    const link = $("listRhLink");
    if (link) {
      if (meta.href) {
        link.href = meta.href;
        link.hidden = false;
      } else {
        link.hidden = true;
      }
    }
    lastRows = rows || [];
    redrawCharts();
    renderChangeSummary(lastRows);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawCharts, 120);
  });

  window.ListHeader = { update };
})();
