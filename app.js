const FRAMES = ["quarter", "month", "week", "day", "5h", "1h", "live"];
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
  sortKey: "id",
  sortDir: 1,
  manifest: {},
  watchlists: { lists: [] },
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

function biasRank(bias) {
  if (bias === "bullish") return 2;
  if (bias === "bearish") return 1;
  return 0;
}

function sortValue(row, key) {
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

  return rows.filter((row) => {
    if (country && row.country !== country) return false;
    if (exchange && row.exchange !== exchange) return false;
    if (watchlist && !(row.lists || []).includes(watchlist)) return false;
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
  return `<tr>
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

function renderBoard() {
  const filtered = sortRows(applyFilters(state.allRows));
  state.total = filtered.length;
  state.rows = filtered.slice(state.offset, state.offset + PAGE);

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = state.rows.map(renderRow).join("");

  const page = Math.floor(state.offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(state.total / PAGE));
  document.getElementById("pager").textContent = `Page ${page} / ${pages} · ${state.total} symbols`;

  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = state.offset + PAGE >= state.total;
  updateSortHeaders();
}

function populateFilters(rows) {
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))].sort();
  const exchanges = [...new Set(rows.map((r) => r.exchange).filter(Boolean))].sort();
  const cSel = document.getElementById("country");
  const eSel = document.getElementById("exchange");
  const wSel = document.getElementById("watchlist");

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
  for (const lst of state.watchlists.lists || []) {
    const o = document.createElement("option");
    o.value = lst.display_name;
    const n = lst.item_count ?? lst.symbols?.length ?? 0;
    o.textContent = `${lst.display_name} (${n})`;
    wSel.appendChild(o);
  }
}

function updateMeta() {
  const man = state.manifest;
  const wl = state.watchlists.lists?.length ?? 0;
  document.getElementById("meta").textContent =
    `${man.symbolCount ?? state.allRows.length} symbols · ${wl} watchlists · ${man.generatedAt?.slice(0, 19) ?? ""} · preset ${man.preset ?? "?"}`;
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
  const { countries, exchanges, watchlists } = await res.json();
  const cSel = document.getElementById("country");
  const eSel = document.getElementById("exchange");
  const wSel = document.getElementById("watchlist");
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
  for (const lst of watchlists || []) {
    const o = document.createElement("option");
    o.value = lst.display_name;
    o.textContent = `${lst.display_name} (${lst.item_count ?? 0})`;
    wSel.appendChild(o);
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

async function loadBoard() {
  if (STATIC) return loadStatic();
  return loadBoardApi();
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
    btn.textContent = "Refresh live (page)";
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

  for (const id of ["country", "exchange", "biasFilter", "watchlist"]) {
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

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = FRAMES.includes(key) ? -1 : 1;
      }
      state.offset = 0;
      renderBoard();
    });
  });
}

bind();
if (STATIC) loadStatic();
else loadFiltersApi().then(loadBoardApi);
