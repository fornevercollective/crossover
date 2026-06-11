/**
 * Lazy-load daily closes from static chart cache (or API fallback) for squeeze / ranking.
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";
  const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";

  const cache = new Map();
  const pending = new Map();

  function yahooFor(row) {
    return String(row?.yahoo || row?.id || "").toUpperCase();
  }

  function parseCompactCloses(compact) {
    const c = compact?.c;
    return c?.length >= 26 ? c : null;
  }

  async function loadFromCache(yahoo) {
    const url = `${BASE}/data/charts/${encodeURIComponent(yahoo)}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return parseCompactCloses(json.daily);
  }

  async function loadFromApi(symbol) {
    const p = new URLSearchParams({ symbol, tf: "day", limit: "200" });
    const res = await fetch(`/api/chart?${p}`);
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json.points?.map((pt) => pt.close).filter((v) => v != null);
    return closes?.length >= 26 ? closes : null;
  }

  function attach(row, closes) {
    if (!closes?.length) return null;
    const yahoo = yahooFor(row);
    cache.set(yahoo, closes);
    row._chartCloses = closes;
    return closes;
  }

  function getCloses(row) {
    if (!row) return null;
    const yahoo = yahooFor(row);
    if (cache.has(yahoo)) return cache.get(yahoo);
    if (row._chartCloses?.length >= 26) {
      cache.set(yahoo, row._chartCloses);
      return row._chartCloses;
    }
    return null;
  }

  async function ensureCloses(row) {
    const existing = getCloses(row);
    if (existing) return existing;

    const yahoo = yahooFor(row);
    if (!yahoo) return null;
    if (pending.has(yahoo)) return pending.get(yahoo);

    const job = (async () => {
      let closes = null;
      try {
        closes = await loadFromCache(yahoo);
        if (!closes && !STATIC) closes = await loadFromApi(row.id || yahoo);
      } catch {
        closes = null;
      }
      pending.delete(yahoo);
      return closes ? attach(row, closes) : null;
    })();

    pending.set(yahoo, job);
    return job;
  }

  async function prefetch(rows, opts = {}) {
    const max = opts.max ?? 300;
    const concurrency = opts.concurrency ?? 10;
    const seen = new Set();
    const queue = [];

    for (const row of rows || []) {
      const yahoo = yahooFor(row);
      if (!yahoo || seen.has(yahoo) || getCloses(row)) continue;
      seen.add(yahoo);
      queue.push(row);
      if (queue.length >= max) break;
    }

    for (let i = 0; i < queue.length; i += concurrency) {
      await Promise.all(queue.slice(i, i + concurrency).map(ensureCloses));
    }
  }

  window.ChartCloses = { getCloses, ensureCloses, prefetch, attach };
})();
