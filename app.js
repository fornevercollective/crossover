const FRAMES = ["quarter", "month", "week", "day", "5h", "1h", "live"];
const ALIGN_TFS = ["quarter", "month", "week", "day"];
const PAGE = 150;

const htmlRoot = document.documentElement;
const BASE = htmlRoot.dataset.base || "";
const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";

const state = {
  offset: 0,
  total: 0,
  rows: [],
  allRows: [],
  liveCache: {},
  sortKey: "profit",
  sortDir: -1,
  manifest: {},
  watchlists: { lists: [], sections: [] },
  lastProbe: null,
};

const FLIP_SHORT = {
  macd_bullish: "MB↑",
  macd_bearish: "MB↓",
  histogram_bullish: "H↑",
  histogram_bearish: "H↓",
  bb_upper_breakout: "BU↑",
  bb_upper_reentry: "BU↩",
  bb_lower_breakdown: "BL↓",
  bb_lower_reentry: "BL↩",
  bb_middle_bullish: "BM↑",
  bb_middle_bearish: "BM↓",
};

function asset(path) {
  return `${BASE}${path}`;
}

function profitMeta(row) {
  const frames = { ...row.frames, ...(state.liveCache[row.yahoo]?.frames ?? {}) };
  let bull = 0;
  let bear = 0;
  for (const f of ALIGN_TFS) {
    if (frames[f]?.macdBias === "bullish") bull++;
    if (frames[f]?.macdBias === "bearish") bear++;
  }
  const side = bull > bear ? "long" : bear > bull ? "short" : "neutral";
  const aligned = side === "long" ? bull : side === "short" ? bear : Math.max(bull, bear);
  const intraday =
    side === "long"
      ? ["5h", "1h"].filter((f) => frames[f]?.macdBias === "bullish").length
      : side === "short"
        ? ["5h", "1h"].filter((f) => frames[f]?.macdBias === "bearish").length
        : 0;
  const bb = frames.day?.bbPosition;
  const bbBoost =
    (side === "long" && (bb === "below_lower" || bb === "lower_half")) ||
    (side === "short" && (bb === "above_upper" || bb === "upper_half"))
      ? 10
      : 0;
  const score = Math.min(100, Math.round((aligned / 4) * 70 + (intraday / 2) * 20 + bbBoost));
  return { side, aligned, score, rings: aligned };
}

function profitCirclesHtml(row) {
  const p = profitMeta(row);
  const rings = [1, 2, 3, 4]
    .map((n) => `<span class="ring r${n}${n <= p.rings ? " on" : ""}"></span>`)
    .join("");
  const tip = `${p.side.toUpperCase()} · ${p.score}% potential · ${p.rings}/4 TF aligned (Q→D)`;
  return `<div class="profit-wrap" title="${tip}">
    <div class="profit-circles ${p.side}">${rings}</div>
    <span class="profit-score">${p.score}%</span>
  </div>`;
}

function biasRank(bias) {
  if (bias === "bullish") return 2;
  if (bias === "bearish") return 1;
  return 0;
}

function sortValue(row, key) {
  if (key === "profit") return profitMeta(row).score;
  if (key === "id") return row.id.toLowerCase();
  if (key === "exchange") return `${row.exchange}|${row.country}`.toLowerCase();
  if (key === "sector") return (row.sector || row.lists?.[0] || "").toLowerCase();
  if (FRAMES.includes(key)) {
    const st = { ...row.frames, ...(state.liveCache[row.yahoo]?.frames ?? {}) }[key];
    const br = biasRank(st?.macdBias);
    const days = st?.daysSinceFlip ?? 9999;
    return br * 10000 - days;
  }
  return "";
}

function applyFilters(rows) {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const country = document.getElementById("country").value;
  const exchange = document.getElementById("exchange").value;
  const biasFilter = document.getElementById("biasFilter").value;
  const watchlist = document.getElementById("watchlist").value;
  const section = document.getElementById("sectionFilter").value;

  return rows.filter((row) => {
    if (country && row.country !== country) return false;
    if (exchange && row.exchange !== exchange) return false;
    if (watchlist && !(row.lists || []).includes(watchlist)) return false;
    if (section) {
      const lists = row.lists || [];
      const sectionLists = (state.watchlists.lists || [])
        .filter((l) => l.section === section)
        .map((l) => l.display_name);
      if (!lists.some((l) => sectionLists.includes(l))) {
        if (section === "indexes" && !lists.includes("Market Indexes")) return false;
        if (section !== "indexes") return false;
      }
    }
    if (biasFilter) {
      const day = row.frames?.day;
      if (day?.macdBias !== biasFilter) return false;
    }
    if (q) {
      const hay = `${row.id} ${row.yahoo} ${row.name} ${(row.lists || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return a.id.localeCompare(b.id) * dir;
  });
}

function cellHtml(frame, st) {
  if (!st) return '<span class="cell na">—</span>';
  const bias = st.macdBias === "bullish" ? "bull" : st.macdBias === "bearish" ? "bear" : "na";
  const flip = st.lastFlip?.type;
  const tag = FLIP_SHORT[flip] ?? (st.macdBias === "bullish" ? "M+" : "M-");
  const age = st.daysSinceFlip != null ? ` ${st.daysSinceFlip}d` : "";
  const tip = [
    `TF: ${frame}`,
    st.asOf ? `as of ${st.asOf}` : "",
    st.close != null ? `close ${st.close}` : "",
    st.macdBias ? `MACD ${st.macdBias}` : "",
    st.bbPosition ? `BB ${st.bbPosition}` : "",
    flip ? `last ${flip}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="cell ${bias}" title="${tip}">${tag}${age}</span>`;
}

function renderRow(row) {
  const livePatch = state.liveCache[row.yahoo]?.frames ?? {};
  const frames = { ...row.frames, ...livePatch };
  const cells = FRAMES.map((f) => `<td>${cellHtml(f, frames[f])}</td>`).join("");
  const listHint = (row.lists || []).slice(0, 2).join(", ");
  const sector = row.sector || listHint || "—";
  return `<tr data-symbol="${row.id}">
    <td>${profitCirclesHtml(row)}</td>
    <td class="sym" title="${row.name}${row.lists?.length ? " · " + row.lists.join(", ") : ""}">${row.id}<br><small>${row.yahoo}</small></td>
    <td class="meta">${row.exchange || "—"}<br>${row.country || "—"}</td>
    <td class="meta" title="${(row.lists || []).join(", ")}">${sector}</td>
    ${cells}
  </tr>`;
}

function updateSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("asc", "desc");
    if (th.dataset.sort === state.sortKey) {
      th.classList.add(state.sortDir > 0 ? "asc" : "desc");
    }
  });
}

function updateHeroCounts(filteredCount) {
  const total = state.manifest.symbolCount ?? state.allRows.length;
  document.getElementById("heroCount").textContent = total.toLocaleString();
  const sub = document.getElementById("heroFiltered");
  if (filteredCount !== total) {
    sub.textContent = `${filteredCount.toLocaleString()} shown after filters`;
  } else {
    sub.textContent = `${(state.watchlists.lists?.length ?? 0)} lists · ${state.watchlists.catalog?.unique_symbols ?? ""} universe`;
  }
}

function renderBoard() {
  const filtered = sortRows(applyFilters(state.allRows));
  state.total = filtered.length;
  state.rows = filtered.slice(state.offset, state.offset + PAGE);

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = state.rows.map(renderRow).join("");

  tbody.querySelectorAll(".sym").forEach((el) => {
    el.addEventListener("click", () => {
      const sym = el.closest("tr")?.dataset.symbol;
      if (!sym) return;
      document.getElementById("paperSymbol").value = sym;
      runPaperProbe();
    });
  });

  const page = Math.floor(state.offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(state.total / PAGE));
  document.getElementById("pager").textContent = `Page ${page} / ${pages} · ${state.total.toLocaleString()} symbols`;

  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = state.offset + PAGE >= state.total;
  updateSortHeaders();
  updateHeroCounts(state.total);
}

function populateFilters(rows) {
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))].sort();
  const exchanges = [...new Set(rows.map((r) => r.exchange).filter(Boolean))].sort();
  const cSel = document.getElementById("country");
  const eSel = document.getElementById("exchange");
  const wSel = document.getElementById("watchlist");
  const sSel = document.getElementById("sectionFilter");

  for (const c of countries) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    cSel.appendChild(o);
  }
  for (const e of exchanges) {
    const o = document.createElement("option");
    o.value = e;
    o.textContent = e;
    eSel.appendChild(o);
  }

  const sectionLabels = {
    curated: "Robinhood Curated",
    custom: "My Watchlists",
    options: "Options",
    indexes: "Market Indexes",
    discover: "Browse (follow in app)",
  };
  for (const sec of ["curated", "custom", "options", "indexes"]) {
    const o = document.createElement("option");
    o.value = sec;
    o.textContent = sectionLabels[sec] || sec;
    sSel.appendChild(o);
  }

  const bySection = {};
  for (const lst of state.watchlists.lists || []) {
    const sec = lst.section || (lst.owner_type === "robinhood" ? "curated" : "custom");
    bySection[sec] = bySection[sec] || [];
    bySection[sec].push(lst);
  }

  for (const [sec, lists] of Object.entries(bySection)) {
    const og = document.createElement("optgroup");
    og.label = sectionLabels[sec] || sec;
    for (const lst of lists.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
      const o = document.createElement("option");
      o.value = lst.display_name;
      const n = lst.item_count ?? lst.symbols?.length ?? 0;
      o.textContent = `${lst.display_name} (${n})`;
      og.appendChild(o);
    }
    wSel.appendChild(og);
  }
}

function updateMeta() {
  const man = state.manifest;
  const cat = state.watchlists.catalog || {};
  document.getElementById("meta").textContent =
    `${man.preset ?? "?"} · ${man.generatedAt?.slice(0, 19) ?? ""} · ${cat.followedLists ?? "?"} RH lists · ${cat.discoverable ?? 0} more in app`;
}

async function loadStatic() {
  const [rowsRes, manRes, wlRes] = await Promise.all([
    fetch(asset("/data/rows.json")),
    fetch(asset("/data/manifest.json")),
    fetch(asset("/data/watchlists.json")),
  ]);
  state.allRows = await rowsRes.json();
  state.manifest = await manRes.json();
  state.watchlists = await wlRes.json();
  populateFilters(state.allRows);
  updateMeta();
  renderBoard();
}

async function loadFiltersApi() {
  const res = await fetch("/api/filters");
  const { countries, exchanges, watchlists, sections } = await res.json();
  state.watchlists = { lists: watchlists || [], sections: sections || [] };
  const cSel = document.getElementById("country");
  const eSel = document.getElementById("exchange");
  const wSel = document.getElementById("watchlist");
  const sSel = document.getElementById("sectionFilter");

  for (const c of countries) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    cSel.appendChild(o);
  }
  for (const e of exchanges) {
    const o = document.createElement("option");
    o.value = e;
    o.textContent = e;
    eSel.appendChild(o);
  }

  const sectionLabels = {
    curated: "Robinhood Curated",
    custom: "My Watchlists",
    options: "Options",
    indexes: "Market Indexes",
  };
  for (const sec of ["curated", "custom", "options", "indexes"]) {
    const o = document.createElement("option");
    o.value = sec;
    o.textContent = sectionLabels[sec];
    sSel.appendChild(o);
  }

  const bySection = {};
  for (const lst of watchlists || []) {
    const sec = lst.section || (lst.owner_type === "robinhood" ? "curated" : "custom");
    bySection[sec] = bySection[sec] || [];
    bySection[sec].push(lst);
  }
  for (const [sec, lists] of Object.entries(bySection)) {
    const og = document.createElement("optgroup");
    og.label = sectionLabels[sec] || sec;
    for (const lst of lists.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
      const o = document.createElement("option");
      o.value = lst.display_name;
      o.textContent = `${lst.display_name} (${lst.item_count ?? 0})`;
      og.appendChild(o);
    }
    wSel.appendChild(og);
  }
}

async function loadBoardApi() {
  const p = new URLSearchParams();
  const q = document.getElementById("search").value.trim();
  const country = document.getElementById("country").value;
  const exchange = document.getElementById("exchange").value;
  const watchlist = document.getElementById("watchlist").value;
  if (q) p.set("q", q);
  if (country) p.set("country", country);
  if (exchange) p.set("exchange", exchange);
  if (watchlist) p.set("list", watchlist);
  p.set("offset", "0");
  p.set("limit", "10000");

  const res = await fetch(`/api/board?${p}`);
  const data = await res.json();
  state.allRows = data.rows;
  state.total = data.total;
  state.manifest = await fetch("/api/manifest").then((r) => r.json());
  updateMeta();
  renderBoard();
}

function formatProbe(data) {
  const rh = data.robinhood;
  const pt = data.paperTrade;
  const lines = [
    `<span class="rh">Robinhood (${rh.source})</span>`,
    `  Last: ${rh.lastTradePrice ?? "—"}`,
    `  Adj prev close: ${rh.adjustedPreviousClose ?? "—"}`,
    `  Daily %: ${rh.dailyChangePct != null ? rh.dailyChangePct.toFixed(2) + "%" : "—"}`,
    rh.note || "",
    "",
    `<span class="ours">Our MACD/BB (not RH)</span>`,
    `  Day bias: ${data.ours.macdBias?.day ?? "—"} · BB: ${data.ours.bbPosition?.day ?? "—"}`,
    `  Q/M/W/D: ${["quarter", "month", "week", "day"].map((f) => (data.ours.macdBias?.[f] === "bullish" ? "B" : data.ours.macdBias?.[f] === "bearish" ? "S" : "—")).join(" ")}`,
    "",
    `Agreement: ${data.comparison.biasAgreement}`,
    `Price Δ vs our day close: ${data.comparison.priceDeltaPct != null ? data.comparison.priceDeltaPct.toFixed(2) + "%" : "—"}`,
    "",
    `<span class="side-${pt.side}">Paper ${pt.side.toUpperCase()}</span> ${pt.quantity} @ ${pt.estFillPrice ?? "—"} = $${pt.notional?.toFixed(2) ?? "—"}`,
    pt.rationale,
  ];
  return lines.join("\n");
}

async function runPaperProbe() {
  const sym = document.getElementById("paperSymbol").value.trim().toUpperCase();
  const qty = Number(document.getElementById("paperQty").value || 100);
  const out = document.getElementById("paperOut");
  const btn = document.getElementById("paperProbe");
  if (!sym) return;
  btn.disabled = true;
  out.textContent = "Probing…";
  try {
    let data;
    if (STATIC) {
      out.textContent = "Paper probe needs local server (npm run board:serve) for Robinhood official quotes.";
      return;
    }
    const res = await fetch(`/api/paper/probe?symbol=${encodeURIComponent(sym)}&qty=${qty}`);
    data = await res.json();
    state.lastProbe = data;
    out.innerHTML = formatProbe(data);
    document.getElementById("paperCopy").disabled = false;
  } catch (e) {
    out.textContent = String(e);
  } finally {
    btn.disabled = false;
  }
}

function bind() {
  if (STATIC) {
    document.getElementById("refreshLive").style.display = "none";
    document.getElementById("reload").textContent = "Reload page";
    document.getElementById("reload").addEventListener("click", () => location.reload());
  }

  let debounce;
  document.getElementById("search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.offset = 0;
      if (STATIC) renderBoard();
      else loadBoardApi();
    }, 250);
  });

  for (const id of ["country", "exchange", "biasFilter", "watchlist", "sectionFilter"]) {
    document.getElementById(id).addEventListener("change", () => {
      state.offset = 0;
      if (STATIC) renderBoard();
      else loadBoardApi();
    });
  }

  document.getElementById("prev").addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - PAGE);
    renderBoard();
  });
  document.getElementById("next").addEventListener("click", () => {
    state.offset += PAGE;
    renderBoard();
  });

  if (!STATIC) {
    document.getElementById("refreshLive").addEventListener("click", refreshLivePage);
    document.getElementById("reload").addEventListener("click", async () => {
      await fetch("/api/reload", { method: "POST" });
      state.offset = 0;
      loadBoardApi();
    });
  }

  document.getElementById("paperProbe").addEventListener("click", runPaperProbe);
  document.getElementById("paperSymbol").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runPaperProbe();
  });
  document.getElementById("paperCopy").addEventListener("click", () => {
    if (!state.lastProbe) return;
    navigator.clipboard.writeText(JSON.stringify(state.lastProbe, null, 2));
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = key === "profit" || FRAMES.includes(key) ? -1 : 1;
      }
      state.offset = 0;
      renderBoard();
    });
  });
}

async function refreshLivePage() {
  if (STATIC) return;
  const symbols = state.rows.map((r) => r.yahoo);
  if (!symbols.length) return;
  const btn = document.getElementById("refreshLive");
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  try {
    const res = await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    const data = await res.json();
    Object.assign(state.liveCache, data.updates ?? {});
    renderBoard();
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh live";
  }
}

bind();
if (STATIC) loadStatic();
else loadFiltersApi().then(loadBoardApi);
