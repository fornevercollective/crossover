/**
 * Coinbase Extended — crypto on Coinbase not in Robinhood watchlists.
 */
(function () {
  const LIMIT = 30;
  const SECTOR = "Coinbase Extended";

  function sectorColor() {
    return window.SectorColors?.colorFor(SECTOR) || "#0051C1";
  }

  function fmtPrice(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const x = Number(n);
    if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(x) >= 1) return x.toFixed(2);
    return x.toFixed(4);
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const x = Number(n);
    const sign = x > 0 ? "+" : "";
    return `${sign}${x.toFixed(2)}%`;
  }

  function macdBiasFromPoints(points) {
    if (!points?.length) return "unknown";
    const last = points[points.length - 1];
    if (last.macd == null || last.signal == null) return "unknown";
    return last.macd >= last.signal ? "bullish" : "bearish";
  }

  async function loadProducts() {
    const htmlRoot = document.documentElement;
    const BASE = htmlRoot.dataset.base || "";
    const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";
    if (STATIC) {
      const res = await fetch(`${BASE}/data/coinbase-products.json`);
      if (!res.ok) throw new Error("coinbase-products.json missing — run npm run coinbase:sync");
      const data = await res.json();
      const ext = new Set(data.extended || []);
      const products = (data.products || []).filter((p) => ext.has(p.product_id));
      return { products: products.slice(0, LIMIT), counts: data.counts, static: true };
    }
    const res = await fetch(`/api/coinbase/products?extended=1&limit=${LIMIT}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return { products: data.products || [], counts: data.counts, static: false };
  }

  async function enrichRow(product, staticMode) {
    const id = product.product_id;
    const price = Number(product.price);
    const chg = Number(product.price_percentage_change_24h);
    let macdBias = "unknown";
    if (!staticMode) {
      try {
        const res = await fetch(`/api/coinbase/chart?product=${encodeURIComponent(id)}&tf=day&limit=60`);
        const chart = await res.json();
        if (res.ok) macdBias = macdBiasFromPoints(chart.points);
      } catch {
        /* quote-only row */
      }
    }
    return {
      id,
      price,
      chg,
      macdBias,
      name: product.base_name || product.base_display_symbol || id,
    };
  }

  function renderRow(row) {
    const color = sectorColor();
    const biasClass =
      row.macdBias === "bullish" ? "bull" : row.macdBias === "bearish" ? "bear" : "flat";
    const el = document.createElement("button");
    el.type = "button";
    el.className = "imminent-row coinbase-ext-row";
    el.style.borderColor = color;
    el.innerHTML = `
      <span class="imminent-rank-score" style="color:${color}">CB</span>
      <span class="imminent-sym">${row.id}</span>
      <span class="imminent-meta muted">${row.name}</span>
      <span class="imminent-price">${fmtPrice(row.price)}</span>
      <span class="imminent-chg ${row.chg >= 0 ? "bull" : "bear"}">${fmtPct(row.chg)}</span>
      <span class="imminent-bias ${biasClass}">${row.macdBias === "unknown" ? "—" : row.macdBias.slice(0, 4)}</span>
      <span class="coinbase-ext-badge">extended</span>
    `;
    el.addEventListener("click", () => {
      if (window.FlipBoard?.selectSymbol) window.FlipBoard.selectSymbol(row.id);
      else if (window.FlipChart) window.FlipChart.select(row.id, row.id);
    });
    return el;
  }

  async function render() {
    const list = document.getElementById("coinbaseCryptoList");
    const countEl = document.getElementById("coinbaseCryptoCount");
    if (!list) return;

    list.innerHTML = "<p class=\"imminent-blurb muted\">Loading Coinbase extended…</p>";
    try {
      const { products, counts, static: staticMode } = await loadProducts();
      const extCount = counts?.coinbaseExtended ?? products.length;
      if (countEl) countEl.textContent = `${products.length} shown · ${extCount} extended`;

      if (!products.length) {
        list.innerHTML = "<p class=\"imminent-blurb muted\">No extended products — run npm run coinbase:sync</p>";
        return;
      }

      list.innerHTML = "";
      const rows = await Promise.all(products.map((p) => enrichRow(p, staticMode)));
      for (const row of rows) list.appendChild(renderRow(row));

      window.CoinbaseCrypto = {
        sector: SECTOR,
        extended: products.map((p) => p.product_id),
        isExtended: (sym) => products.some((p) => p.product_id === sym),
      };
    } catch (e) {
      list.innerHTML = `<p class="imminent-blurb muted">${e.message || e}</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => render());
  window.CoinbaseCrypto = { render, sector: SECTOR, isExtended: () => false };
})();
