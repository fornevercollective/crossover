/**
 * Robinhood Investor Index–inspired sector palette (original mapping, not RH assets).
 * Colors sampled from RH index charts: green, lime, coral, teal, purple, blue, orange, gold.
 */
(function () {
  const RH_INDEX = [
    "#00C805",
    "#7EE863",
    "#C3F53C",
    "#FF5A87",
    "#238758",
    "#8761EC",
    "#0051C1",
    "#FF5000",
    "#EADBAC",
    "#F9704B",
  ];

  const SECTOR_MAP = {
    Technology: "#8761EC",
    ETFs: "#EADBAC",
    "Manufacturing & Materials": "#FF5000",
    China: "#FF5A87",
    "Energy & Water": "#238758",
    "IPO Access": "#C3F53C",
    Cryptos: "#0051C1",
    "Cryptos to Watch": "#0051C1",
    "Coinbase Extended": "#0051C1",
    Options: "#7EE863",
    "Market Indexes": "#00C805",
    "Metals Futures": "#F9704B",
    Agentic: "#8761EC",
    "My First List": "#9aa0a6",
    M: "#9aa0a6",
    Other: "#6b7280",
  };

  const SECTOR_ORDER = [
    "Technology",
    "ETFs",
    "Manufacturing & Materials",
    "China",
    "Energy & Water",
    "IPO Access",
    "Cryptos",
    "Cryptos to Watch",
    "Coinbase Extended",
    "Options",
    "Market Indexes",
    "Metals Futures",
    "Agentic",
    "My First List",
    "M",
    "Other",
  ];

  function sectorKey(row) {
    return row.sector || row.lists?.[0] || "Other";
  }

  function colorFor(name) {
    if (!name) return SECTOR_MAP.Other;
    if (SECTOR_MAP[name]) return SECTOR_MAP[name];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return RH_INDEX[h % RH_INDEX.length];
  }

  function sortSectors(names) {
    return [...new Set(names)].sort((a, b) => {
      const ai = SECTOR_ORDER.indexOf(a);
      const bi = SECTOR_ORDER.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  function tint(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  window.SectorColors = {
    RH_INDEX,
    SECTOR_MAP,
    SECTOR_ORDER,
    sectorKey,
    colorFor,
    sortSectors,
    tint,
    bull: "#3dd68c",
    bear: "#f07178",
    neutral: "#9aa0a6",
  };
})();
