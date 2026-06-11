/**
 * Robinhood-style list header + mini distribution chart for filtered universe.
 */
(function () {
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

  function drawDistChart(rows) {
    const canvas = $("listDistChart");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

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
      { label: "Bull D", value: bull, color: "#00c805" },
      { label: "Bear D", value: bear, color: "#ff5000" },
      { label: "Flat", value: neutral, color: "#cccccc" },
    ];

    const pad = 8;
    const barW = (w - pad * 2) / bars.length - 6;
    bars.forEach((b, i) => {
      const x = pad + i * (barW + 6);
      const bh = ((h - 24) * b.value) / total;
      const y = h - 16 - bh;
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = "#666";
      ctx.font = "9px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, x + barW / 2, h - 4);
    });
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
      <button type="button" class="rh-filter-chip" data-filter="bull">Rising flips ${rising}</button>
      <button type="button" class="rh-filter-chip" data-filter="bear">Falling flips ${falling}</button>
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
    drawDistChart(rows || []);
    renderChangeSummary(rows || []);
  }

  window.ListHeader = { update };
})();
