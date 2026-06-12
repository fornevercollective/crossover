const FRAMES = ["quarter", "month", "week", "day", "5h", "1h", "live"];
const ALIGN_TFS = ["quarter", "month", "week", "day"];
const POT_FRAMES = ["day", "week", "month"];
const PAGE = 150;
const COH_STORAGE_KEY = "flipBoardCohUsd";

const htmlRoot = document.documentElement;
const BASE = htmlRoot.dataset.base || "";
const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";

const state = {
  offset: 0,
  total: 0,
  rows: [],
  allRows: [],
  liveCache: {},
  sortKey: "evPot",
  sortDir: -1,
  sectorFilter: "",
  cohUsd: 200,
  backtest: null,
  manifest: {},
  watchlists: { lists: [], sections: [] },
  lastProbe: null,
  scannerReqId: 0,
};

function sectorKey(row) {
  return window.SectorColors?.sectorKey(row) || row.sector || row.lists?.[0] || "Other";
}

function sectorColor(name) {
  return window.SectorColors?.colorFor(name) || "#6b7280";
}

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

function loadCohFromStorage() {
  try {
    const v = localStorage.getItem(COH_STORAGE_KEY);
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) state.cohUsd = n;
    }
  } catch {
    /* ignore */
  }
}

function saveCohToStorage() {
  try {
    localStorage.setItem(COH_STORAGE_KEY, String(state.cohUsd));
  } catch {
    /* ignore */
  }
}

function fmtPotPct(n) {
  if (n == null || Number.isNaN(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function winRateForRow(row) {
  const pot = row.potentials?.day;
  if (pot?.winRate != null) return pot.winRate;
  const sector = sectorKey(row);
  const bySec = state.backtest?.summary?.bySector || {};
  if (bySec[sector]?.winRate != null) return bySec[sector].winRate;
  return state.backtest?.summary?.winRate ?? 35;
}

function evPotForRow(row) {
  const pot = row.potentials?.day;
  if (pot?.evPct != null) return pot.evPct;
  const pct = pot?.pct;
  if (pct == null) return null;
  return (pct * winRateForRow(row)) / 100;
}

function cohMeta(row) {
  const pot = row.potentials?.day;
  const entry = pot?.entry ?? row.frames?.day?.close;
  if (!entry || entry <= 0) return null;
  const shares = Math.floor(state.cohUsd / entry);
  const wr = winRateForRow(row);
  const potPct = pot?.pct ?? null;
  const ev = pot?.evPct ?? (potPct != null ? (potPct * wr) / 100 : null);
  return { shares, entry, wr, potPct, ev };
}

function selectSymbol(sym, row) {
  if (!sym) return;
  const r = row || state.allRows.find((x) => x.id === sym || x.yahoo === sym);
  document.getElementById("tickerInput").value = sym;
  if (window.FlipChart) window.FlipChart.select(sym, r?.yahoo ?? sym);
  if (window.PaperBrief) window.PaperBrief.load(sym);
}

function getFilteredRows() {
  return sortRows(applyFilters(state.allRows));
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
  if (key === "dPot") return row.potentials?.day?.pct ?? -9999;
  if (key === "wPot") return row.potentials?.week?.pct ?? -9999;
  if (key === "mPot") return row.potentials?.month?.pct ?? -9999;
  if (key === "evPot") return evPotForRow(row) ?? -9999;
  if (key === "id") return row.id.toLowerCase();
  if (key === "exchange") return `${row.exchange}|${row.country}`.toLowerCase();
  if (key === "sector") {
    const sk = sectorKey(row);
    const order = window.SectorColors?.SECTOR_ORDER || [];
    const idx = order.indexOf(sk);
    const rank = idx >= 0 ? idx : 999;
    return `${String(rank).padStart(4, "0")}|${sk.toLowerCase()}`;
  }
  if (FRAMES.includes(key)) {
    const st = { ...row.frames, ...(state.liveCache[row.yahoo]?.frames ?? {}) }[key];
    const br = biasRank(st?.macdBias);
    const days = st?.daysSinceFlip ?? 9999;
    return br * 10000 - days;
  }
  return "";
}

function marketFilterMatch(value, rowValue) {
  const v = (rowValue || "").trim();
  if (value === "__blank__") return !v;
  if (!value) return true;
  return v === value;
}

function applyFilters(rows) {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const country = document.getElementById("country").value;
  const exchange = document.getElementById("exchange").value;
  const biasFilter = document.getElementById("biasFilter").value;
  const watchlist = document.getElementById("watchlist").value;
  const section = document.getElementById("sectionFilter").value;

  return rows.filter((row) => {
    if (!marketFilterMatch(country, row.country)) return false;
    if (!marketFilterMatch(exchange, row.exchange)) return false;
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
    if (state.sectorFilter && sectorKey(row) !== state.sectorFilter) return false;
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
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av < bv) return -dir;
    if (av > bv) return dir;
    if (key === "sector") {
      const ps = profitMeta(b).score - profitMeta(a).score;
      if (ps) return ps;
    }
    return a.id.localeCompare(b.id) * (key === "sector" ? 1 : dir);
  });
  return sorted;
}

function potChipHtml(frame, row) {
  const pot = row.potentials?.[frame];
  if (!pot || pot.pct == null) return "";
  const cls = pot.pct >= 0 ? "pot-pos" : "pot-neg";
  const coh = cohMeta(row);
  const cohTip = coh
    ? ` · COH $${state.cohUsd.toLocaleString()} → ~${coh.shares} @ $${coh.entry.toFixed(2)} · EV ${fmtPotPct(coh.ev)} · ${coh.wr}% win`
    : "";
  const tip = [
    `${frame.toUpperCase()} pot ${fmtPotPct(pot.pct)}`,
    `entry $${pot.entry} · floor $${pot.floor} · ceiling $${pot.ceiling}`,
    `flip ${pot.flipType} ${pot.flipDate}`,
    `${pot.horizonDays}d window · ${pot.side}`,
    pot.evPct != null ? `EV ${fmtPotPct(pot.evPct)} (${pot.winRate}% win)` : "",
    cohTip,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="pot-chip ${cls}" title="${tip}">${fmtPotPct(pot.pct)}</span>`;
}

function cellHtml(frame, st, row) {
  if (!st) return '<span class="cell na">—</span>';
  const bias = st.macdBias === "bullish" ? "bull" : st.macdBias === "bearish" ? "bear" : "na";
  const flip = st.lastFlip?.type;
  const tag = FLIP_SHORT[flip] ?? (st.macdBias === "bullish" ? "M+" : "M-");
  const age = st.daysSinceFlip != null ? ` ${st.daysSinceFlip}d` : "";
  const potChip = POT_FRAMES.includes(frame) ? potChipHtml(frame, row) : "";
  const tip = [
    `TF: ${frame}`,
    st.asOf ? `as of ${st.asOf}` : "",
    st.close != null ? `close ${st.close}` : "",
    st.macdBias ? `MACD ${st.macdBias}` : "",
    st.bbPosition ? `BB ${st.bbPosition}` : "",
    flip ? `last ${flip}` : "",
    row.potentials?.[frame]
      ? `pot ${fmtPotPct(row.potentials[frame].pct)} · floor ${row.potentials[frame].floor} · ceiling ${row.potentials[frame].ceiling}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="cell ${bias}" title="${tip}">${tag}${age}${potChip}</span>`;
}

function sectorChipHtml(name) {
  const c = sectorColor(name);
  return `<span class="sector-chip" style="--sector-color:${c}"><i></i>${name}</span>`;
}

function renderGroupHeader(sector, count) {
  const c = sectorColor(sector);
  return `<tr class="sector-group-header" data-sector-group="${sector}" style="--sector-color:${c}">
    <td colspan="15"><span class="sector-group-label"><i></i>${sector}</span><span class="sector-group-count">${count.toLocaleString()}</span></td>
  </tr>`;
}

function potCellHtml(frame, row) {
  const pot = row.potentials?.[frame];
  if (!pot || pot.pct == null) return '<span class="pot-col na">—</span>';
  const cls = pot.pct >= 0 ? "pot-pos" : "pot-neg";
  const coh = cohMeta(row);
  const tip = [
    `entry $${pot.entry}`,
    `floor $${pot.floor} · ceiling $${pot.ceiling}`,
    coh ? `COH $${state.cohUsd} → ~${coh.shares} shares` : "",
    pot.evPct != null ? `EV ${fmtPotPct(pot.evPct)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="pot-col ${cls}" title="${tip}">${fmtPotPct(pot.pct)}</span>`;
}

function renderRow(row) {
  const livePatch = state.liveCache[row.yahoo]?.frames ?? {};
  const frames = { ...row.frames, ...livePatch };
  const cells = FRAMES.map((f) => `<td>${cellHtml(f, frames[f], row)}</td>`).join("");
  const potCols = POT_FRAMES.map((f) => `<td class="pot-td">${potCellHtml(f, row)}</td>`).join("");
  const ev = evPotForRow(row);
  const evCls = ev == null ? "na" : ev >= 0 ? "pot-pos" : "pot-neg";
  const coh = cohMeta(row);
  const evTip = coh
    ? `day pot × ${coh.wr}% win · COH $${state.cohUsd} → ~${coh.shares} @ $${coh.entry.toFixed(2)}`
    : "Expected value = day pot% × backtest win rate";
  const sk = sectorKey(row);
  const c = sectorColor(sk);
  const listHint = (row.lists || []).slice(0, 2).join(", ");
  const sectorLabel = row.sector || listHint || "—";
  return `<tr data-symbol="${row.id}" data-sector="${sk}" style="--sector-color:${c}"${row.buildError ? ' class="row-error sector-row"' : ' class="sector-row"'}>
    <td>${profitCirclesHtml(row)}</td>
    <td class="pot-td ${evCls}" title="${evTip}">${ev != null ? fmtPotPct(ev) : "—"}</td>
    <td class="sym" title="${row.name}${row.buildError ? " · " + row.buildError : ""}${row.lists?.length ? " · " + row.lists.join(", ") : ""}">${row.id}<br><small>${row.yahoo}</small></td>
    <td class="meta">${row.exchange || "—"}<br>${row.country || "—"}</td>
    <td class="meta sector-cell" title="${(row.lists || []).join(", ")}">${sectorChipHtml(sk !== "Other" ? sk : sectorLabel)}</td>
    ${cells}
    ${potCols}
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

function buildTableBody(rows, fullFiltered) {
  if (state.sortKey !== "sector") return rows.map(renderRow).join("");

  const parts = [];
  let lastSector = null;
  const groupCounts = new Map();
  for (const row of fullFiltered || rows) {
    const sk = sectorKey(row);
    groupCounts.set(sk, (groupCounts.get(sk) || 0) + 1);
  }
  for (const row of rows) {
    const sk = sectorKey(row);
    if (sk !== lastSector) {
      parts.push(renderGroupHeader(sk, groupCounts.get(sk) || 0));
      lastSector = sk;
    }
    parts.push(renderRow(row));
  }
  return parts.join("");
}

function renderCohBatchBar(filtered) {
  const el = document.getElementById("cohBatchBar");
  if (!el) return;
  const ranked = filtered
    .map((row) => ({ row, ev: evPotForRow(row), coh: cohMeta(row) }))
    .filter((x) => x.ev != null && x.coh?.shares > 0)
    .sort((a, b) => b.ev - a.ev);
  const top = ranked.slice(0, 5);
  if (!top.length) {
    el.innerHTML = `<span class="coh-batch-empty muted">COH $${state.cohUsd.toLocaleString()} — no EV-ranked entries in filtered set</span>`;
    return;
  }
  const chips = top
    .map(({ row, ev, coh }) => {
      const cls = ev >= 0 ? "pot-pos" : "pot-neg";
      return `<button type="button" class="coh-batch-chip ${cls}" data-symbol="${row.id}" title="EV ${fmtPotPct(ev)} · ~${coh.shares} shares @ $${coh.entry.toFixed(2)}">${row.id} ${fmtPotPct(ev)}</button>`;
    })
    .join("");
  el.innerHTML = `<span class="coh-batch-label">COH $${state.cohUsd.toLocaleString()} · top EV batch:</span>${chips}<span class="coh-batch-meta muted">${ranked.length} fit · ${filtered.length} filtered</span>`;
  el.querySelectorAll(".coh-batch-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.symbol;
      const row = state.allRows.find((r) => r.id === sym);
      selectSymbol(sym, row);
    });
  });
}

function renderSectorChips(rows) {
  const el = document.getElementById("sectorChips");
  if (!el || !window.SectorColors) return;
  const counts = new Map();
  for (const row of rows) {
    const sk = sectorKey(row);
    counts.set(sk, (counts.get(sk) || 0) + 1);
  }
  const names = window.SectorColors.sortSectors([...counts.keys()]);
  const active = state.sectorFilter;
  el.innerHTML =
    `<button type="button" class="sector-filter-chip${active ? "" : " active"}" data-sector="">All sectors</button>` +
    names
      .map((name) => {
        const c = sectorColor(name);
        const on = active === name ? " active" : "";
        return `<button type="button" class="sector-filter-chip${on}" data-sector="${name}" style="--sector-color:${c}"><i></i>${name} <span class="chip-count">${counts.get(name)}</span></button>`;
      })
      .join("");
  el.querySelectorAll(".sector-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sectorFilter = btn.dataset.sector || "";
      state.offset = 0;
      renderBoard();
    });
  });
}

function renderBoard() {
  const filtered = sortRows(applyFilters(state.allRows));
  state.total = filtered.length;
  state.rows = filtered.slice(state.offset, state.offset + PAGE);

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = buildTableBody(state.rows, filtered);
  renderSectorChips(filtered);

  tbody.querySelectorAll(".sym").forEach((el) => {
    el.addEventListener("click", () => {
      const tr = el.closest("tr");
      const sym = tr?.dataset.symbol;
      if (!sym) return;
      const row = state.rows.find((r) => r.id === sym) || state.allRows.find((r) => r.id === sym);
      selectSymbol(sym, row);
      tr?.classList.add("selected");
      tbody.querySelectorAll("tr.selected").forEach((r) => {
        if (r !== tr) r.classList.remove("selected");
      });
    });
  });

  if (window.ListHeader) window.ListHeader.update(filtered);
  refreshScanners(filtered);

  const page = Math.floor(state.offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(state.total / PAGE));
  document.getElementById("pager").textContent = `Page ${page} / ${pages} · ${state.total.toLocaleString()} symbols`;

  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = state.offset + PAGE >= state.total;
  updateSortHeaders();
  updateHeroCounts(state.total);
  renderCohBatchBar(filtered);
}

async function refreshScanners(filtered) {
  const reqId = ++state.scannerReqId;
  if (window.ChartCloses) {
    try {
      await window.ChartCloses.prefetch(filtered, { max: 300, concurrency: 12 });
    } catch {
      /* ranking still works from board-only signals */
    }
  }
  if (reqId !== state.scannerReqId) return;
  if (window.ImminentFlips) window.ImminentFlips.update(filtered);
  if (window.SkimScanner) window.SkimScanner.update(filtered);
  if (window.SwingBreakouts) window.SwingBreakouts.update(filtered);
}

function addMarketOptions(sel, values) {
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v === "__blank__" ? "— (blank)" : v;
    sel.appendChild(o);
  }
}

function populateFilters(rows) {
  const countries = [
    ...new Set(rows.map((r) => (r.country || "").trim() || "__blank__")),
  ].sort((a, b) => (a === "__blank__" ? -1 : b === "__blank__" ? 1 : a.localeCompare(b)));
  const exchanges = [
    ...new Set(rows.map((r) => (r.exchange || "").trim() || "__blank__")),
  ].sort((a, b) => (a === "__blank__" ? -1 : b === "__blank__" ? 1 : a.localeCompare(b)));
  const cSel = document.getElementById("country");
  const eSel = document.getElementById("exchange");
  const wSel = document.getElementById("watchlist");
  const sSel = document.getElementById("sectionFilter");

  addMarketOptions(cSel, countries);
  addMarketOptions(eSel, exchanges);

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

async function loadBacktestReport() {
  try {
    const res = await fetch(asset("/data/paper-backtest/report.json"));
    if (res.ok) state.backtest = await res.json();
  } catch {
    state.backtest = null;
  }
}

async function loadStatic() {
  loadCohFromStorage();
  const cohInput = document.getElementById("cohUsd");
  if (cohInput) cohInput.value = String(state.cohUsd);
  await loadBacktestReport();
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
    o.textContent = c === "__blank__" ? "— (blank)" : c;
    cSel.appendChild(o);
  }
  for (const e of exchanges) {
    const o = document.createElement("option");
    o.value = e;
    o.textContent = e === "__blank__" ? "— (blank)" : e;
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
  loadCohFromStorage();
  const cohInput = document.getElementById("cohUsd");
  if (cohInput) cohInput.value = String(state.cohUsd);
  await loadBacktestReport();
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
  p.set("limit", "20000");

  const res = await fetch(`/api/board?${p}`);
  const data = await res.json();
  state.allRows = data.rows;
  state.total = data.total;
  state.manifest = await fetch("/api/manifest").then((r) => r.json());
  updateMeta();
  renderBoard();
}

function bind() {
  loadCohFromStorage();
  const cohInput = document.getElementById("cohUsd");
  if (cohInput) {
    cohInput.value = String(state.cohUsd);
    cohInput.addEventListener("change", () => {
      const n = Number(cohInput.value);
      if (Number.isFinite(n) && n > 0) {
        state.cohUsd = n;
        saveCohToStorage();
        renderBoard();
      }
    });
  }

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

  document.getElementById("tickerInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const sym = document.getElementById("tickerInput").value.trim().toUpperCase();
      if (sym) selectSymbol(sym);
    }
  });

  document.getElementById("paperQty")?.addEventListener("change", () => {
    const sym = document.getElementById("tickerInput")?.value.trim();
    if (sym && window.PaperBrief) window.PaperBrief.load(sym);
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        const descKeys = ["profit", "evPot", "dPot", "wPot", "mPot", ...FRAMES];
        state.sortDir = descKeys.includes(key) ? -1 : 1;
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

window.FlipBoard = {
  getRow: (sym) =>
    state.allRows.find((r) => r.id === sym || r.yahoo === sym || r.id === sym?.toUpperCase()),
  getAllRows: () => state.allRows,
  profitMeta,
  cohMeta,
  evPotForRow,
  selectSymbol,
  get cohUsd() {
    return state.cohUsd;
  },
  get watchlists() {
    return state.watchlists;
  },
  filteredCount: () => getFilteredRows().length,
};

if (STATIC) loadStatic();
else loadFiltersApi().then(loadBoardApi);
