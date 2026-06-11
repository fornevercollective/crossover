/**
 * MACD + Bollinger chart for selected ticker (canvas, no deps).
 * Local server: /api/chart. Static site: direct Yahoo fetch + client indicators.
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";
  const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";

  const TF_LABELS = {
    quarter: "Q",
    month: "M",
    week: "W",
    day: "D",
    "5h": "5h",
    "1h": "1h",
  };

  const FLIP_COLORS = {
    macd_bullish: "#3dd68c",
    macd_bearish: "#f07178",
    histogram_bullish: "#7aa2f7",
    histogram_bearish: "#bb9af7",
    bb_upper_breakout: "#e6c068",
    bb_upper_reentry: "#c0a060",
    bb_lower_breakdown: "#f07178",
    bb_lower_reentry: "#3dd68c",
    bb_middle_bullish: "#3dd68c",
    bb_middle_bearish: "#f07178",
  };

  const FLIP_SHORT = {
    macd_bullish: "MACD↑",
    macd_bearish: "MACD↓",
    histogram_bullish: "Hist↑",
    histogram_bearish: "Hist↓",
    bb_upper_breakout: "BB↑brk",
    bb_upper_reentry: "BB↑↩",
    bb_lower_breakdown: "BB↓brk",
    bb_lower_reentry: "BB↓↩",
    bb_middle_bullish: "SMA↑",
    bb_middle_bearish: "SMA↓",
  };

  const state = {
    symbol: null,
    yahoo: null,
    tf: "day",
    limit: 120,
    data: null,
    loading: false,
    reqId: 0,
    flipHits: [],
    pad: { l: 48, r: 12, t: 8, b: 18 },
  };

  // ── Indicators (static / client fallback) ─────────────────────────────

  function ema(values, period) {
    const k = 2 / (period + 1);
    const out = [values[0]];
    let prev = values[0];
    for (let i = 1; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  }

  function sma(values, period) {
    const out = Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      out[i] = sum / period;
    }
    return out;
  }

  function stddev(values, period, idx) {
    const slice = values.slice(idx - period + 1, idx + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  }

  function computeMacd(closes) {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = ema(macdLine, 9);
    return macdLine.map((macd, i) => ({
      macd,
      signal: signalLine[i],
      histogram: macd - signalLine[i],
    }));
  }

  function computeBollinger(closes, period = 20, mult = 2) {
    const middle = sma(closes, period);
    return closes.map((_, i) => {
      const mid = middle[i];
      if (mid == null) return { middle: NaN, upper: NaN, lower: NaN };
      const sd = stddev(closes, period, i);
      return { middle: mid, upper: mid + mult * sd, lower: mid - mult * sd };
    });
  }

  function crossedAbove(pa, pb, a, b) {
    return pa <= pb && a > b;
  }
  function crossedBelow(pa, pb, a, b) {
    return pa >= pb && a < b;
  }

  function findFlips(bars, macd, bb) {
    const events = [];
    for (let i = 1; i < bars.length; i++) {
      const bar = bars[i];
      const prev = macd[i - 1];
      const cur = macd[i];
      if (crossedAbove(prev.macd, prev.signal, cur.macd, cur.signal)) {
        events.push({ date: bar.date, type: "macd_bullish", indicator: "macd", price: bar.close });
      } else if (crossedBelow(prev.macd, prev.signal, cur.macd, cur.signal)) {
        events.push({ date: bar.date, type: "macd_bearish", indicator: "macd", price: bar.close });
      }
      if (crossedAbove(prev.histogram, 0, cur.histogram, 0)) {
        events.push({ date: bar.date, type: "histogram_bullish", indicator: "macd", price: bar.close });
      } else if (crossedBelow(prev.histogram, 0, cur.histogram, 0)) {
        events.push({ date: bar.date, type: "histogram_bearish", indicator: "macd", price: bar.close });
      }

      const pb = bars[i - 1];
      const pbb = bb[i - 1];
      const cbb = bb[i];
      if (Number.isNaN(cbb.middle)) continue;
      if (crossedAbove(pb.close, pbb.upper, bar.close, cbb.upper)) {
        events.push({ date: bar.date, type: "bb_upper_breakout", indicator: "bollinger", price: bar.close });
      } else if (crossedBelow(pb.close, pbb.upper, bar.close, cbb.upper)) {
        events.push({ date: bar.date, type: "bb_upper_reentry", indicator: "bollinger", price: bar.close });
      }
      if (crossedBelow(pb.close, pbb.lower, bar.close, cbb.lower)) {
        events.push({ date: bar.date, type: "bb_lower_breakdown", indicator: "bollinger", price: bar.close });
      } else if (crossedAbove(pb.close, pbb.lower, bar.close, cbb.lower)) {
        events.push({ date: bar.date, type: "bb_lower_reentry", indicator: "bollinger", price: bar.close });
      }
      if (crossedAbove(pb.close, pbb.middle, bar.close, cbb.middle)) {
        events.push({ date: bar.date, type: "bb_middle_bullish", indicator: "bollinger", price: bar.close });
      } else if (crossedBelow(pb.close, pbb.middle, bar.close, cbb.middle)) {
        events.push({ date: bar.date, type: "bb_middle_bearish", indicator: "bollinger", price: bar.close });
      }
    }
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  function bucketKey(date, frame) {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (frame === "day") return date;
    if (frame === "week") {
      const day = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() - day + 1);
      return dt.toISOString().slice(0, 10);
    }
    if (frame === "month") return `${y}-${String(m).padStart(2, "0")}`;
    const q = Math.floor((m - 1) / 3) + 1;
    return `${y}-Q${q}`;
  }

  function resampleDaily(bars, frame) {
    if (frame === "day") return bars;
    const buckets = new Map();
    for (const bar of bars) {
      const key = bucketKey(bar.date, frame);
      const ex = buckets.get(key);
      if (!ex) buckets.set(key, { ...bar, date: key });
      else {
        ex.high = Math.max(ex.high, bar.high);
        ex.low = Math.min(ex.low, bar.low);
        ex.close = bar.close;
        ex.volume += bar.volume;
      }
    }
    return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function resampleHourly(bars, group) {
    const out = [];
    for (let i = group - 1; i < bars.length; i += group) {
      const chunk = bars.slice(i - group + 1, i + 1);
      out.push({
        date: chunk[chunk.length - 1].date,
        open: chunk[0].open,
        high: Math.max(...chunk.map((b) => b.high)),
        low: Math.min(...chunk.map((b) => b.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, b) => s + b.volume, 0),
      });
    }
    return out;
  }

  function parseYahooBars(result, useDateTime) {
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote?.close?.length) return [];
    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      if (close == null || open == null || high == null || low == null) continue;
      const ts = timestamps[i] * 1000;
      bars.push({
        date: useDateTime
          ? new Date(ts).toISOString().slice(0, 16).replace("T", " ")
          : new Date(ts).toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume: quote.volume?.[i] ?? 0,
      });
    }
    return bars;
  }

  function parseCompactBars(compact, useDateTime) {
    if (!compact?.d?.length) return [];
    const bars = [];
    for (let i = 0; i < compact.d.length; i++) {
      bars.push({
        date: compact.d[i],
        open: compact.o[i],
        high: compact.h[i],
        low: compact.l[i],
        close: compact.c[i],
        volume: compact.v[i] ?? 0,
      });
    }
    return bars;
  }

  async function loadStaticChartCache(yahoo) {
    const url = `${BASE}/data/charts/${encodeURIComponent(yahoo)}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchYahooClient(yahoo, interval, range, useDateTime) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?` +
      new URLSearchParams({ interval, range });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json = await res.json();
    const err = json.chart?.error?.description;
    if (err) throw new Error(err);
    const result = json.chart?.result?.[0];
    if (!result) throw new Error("No chart data");
    return parseYahooBars(result, useDateTime);
  }

  /** Snap flip date to exact bar index in chart window (handles resampled keys). */
  function snapFlipIndex(flipDate, pointDates) {
    const fd = flipDate.slice(0, 10);
    let idx = pointDates.findIndex((d) => d === flipDate || d.slice(0, 10) === fd);
    if (idx >= 0) return idx;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < pointDates.length; i++) {
      const d = pointDates[i].slice(0, 10);
      const dist = Math.abs(new Date(d).getTime() - new Date(fd).getTime());
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function enrichFlips(flips, pointDates, tableLastFlip) {
    const seen = new Set();
    const out = [];
    for (const f of flips) {
      const idx = snapFlipIndex(f.date, pointDates);
      if (idx < 0 || seen.has(idx)) continue;
      seen.add(idx);
      out.push({
        ...f,
        barIndex: idx,
        barDate: pointDates[idx],
        tableMatch: Boolean(
          tableLastFlip &&
            tableLastFlip.type === f.type &&
            tableLastFlip.date.slice(0, 10) === f.date.slice(0, 10),
        ),
      });
    }
    if (tableLastFlip) {
      const idx = snapFlipIndex(tableLastFlip.date, pointDates);
      const exists = out.some((f) => f.barIndex === idx && f.type === tableLastFlip.type);
      if (idx >= 0 && !exists) {
        out.push({
          date: tableLastFlip.date,
          type: tableLastFlip.type,
          indicator: tableLastFlip.type.startsWith("bb_") ? "bollinger" : "macd",
          price: tableLastFlip.price,
          barIndex: idx,
          barDate: pointDates[idx],
          tableMatch: true,
        });
      }
    }
    return out.sort((a, b) => a.barIndex - b.barIndex);
  }

  function buildPayloadFromBars(bars, symbol, yahoo, tf, limit) {
    const closes = bars.map((b) => b.close);
    const macd = computeMacd(closes);
    const bb = computeBollinger(closes);
    const squeeze = window.BBSqueeze?.analyzeFromCloses(closes) ?? null;
    const start = Math.max(0, bars.length - limit);
    const windowStart = bars[start].date;
    const points = [];
    for (let i = start; i < bars.length; i++) {
      const m = macd[i];
      const b = bb[i];
      const mid = b.middle;
      const bw =
        mid != null && !Number.isNaN(mid) && mid !== 0 ? (b.upper - b.lower) / mid : null;
      points.push({
        date: bars[i].date,
        close: bars[i].close,
        bbUpper: Number.isNaN(b.upper) ? null : b.upper,
        bbMiddle: Number.isNaN(b.middle) ? null : b.middle,
        bbLower: Number.isNaN(b.lower) ? null : b.lower,
        bbWidth: bw,
        macd: m.macd,
        signal: m.signal,
        histogram: m.histogram,
      });
    }
    const pointDates = points.map((p) => p.date);
    const row = window.FlipBoard?.getRow?.(symbol);
    const tableLastFlip = row?.frames?.[tf]?.lastFlip ?? null;
    const rawFlips = findFlips(bars, macd, bb).filter((f) => f.date >= windowStart);
    const flips = enrichFlips(rawFlips, pointDates, tableLastFlip);
    const last = bars[bars.length - 1];
    return {
      symbol,
      yahoo,
      timeframe: tf,
      asOf: last.date,
      close: last.close,
      points,
      flips,
      squeeze,
      closes,
    };
  }

  async function fetchChartClient(yahoo, symbol, tf, limit) {
    if (STATIC) {
      const cached = await loadStaticChartCache(yahoo);
      if (!cached?.daily) {
        throw new Error("Chart cache missing — run npm run charts:export then site:publish");
      }
      let bars;
      if (tf === "1h" || tf === "5h") {
        if (!cached.hourly) {
          throw new Error("1h/5h charts need npm run board:serve locally");
        }
        const hourly = parseCompactBars(cached.hourly, true);
        bars = tf === "5h" ? resampleHourly(hourly, 5) : hourly;
      } else {
        bars = resampleDaily(parseCompactBars(cached.daily, false), tf);
      }
      if (bars.length < 26) throw new Error(`Insufficient bars (${bars.length})`);
      return buildPayloadFromBars(bars, symbol, yahoo, tf, limit);
    }

    let bars;
    if (tf === "1h" || tf === "5h") {
      const hourly = await fetchYahooClient(yahoo, "60m", "60d", true);
      bars = tf === "5h" ? resampleHourly(hourly, 5) : hourly;
    } else {
      const daily = await fetchYahooClient(yahoo, "1d", "5y", false);
      bars = resampleDaily(daily, tf);
    }
    if (bars.length < 26) throw new Error(`Insufficient bars (${bars.length})`);
    return buildPayloadFromBars(bars, symbol, yahoo, tf, limit);
  }

  function enrichChartPayload(data) {
    if (!data.closes?.length && data.points?.length) {
      data.closes = data.points.map((p) => p.close).filter((v) => v != null);
    }
    if (!data.squeeze && data.closes?.length >= 26) {
      data.squeeze = window.BBSqueeze?.analyzeFromCloses(data.closes) ?? null;
    }
    return data;
  }

  function useCoinbaseChart(sym) {
    if (!sym || !/^[A-Z0-9]+-USD$/.test(sym)) return false;
    if (window.CoinbaseCrypto?.isExtended?.(sym)) return true;
    const row = window.FlipBoard?.getRow?.(sym);
    return !row;
  }

  async function loadChart() {
    if (!state.symbol) return;
    const reqId = ++state.reqId;
    state.loading = true;
    setStatus("Loading…");
    try {
      let data;
      if (STATIC) {
        data = await fetchChartClient(state.yahoo || state.symbol, state.symbol, state.tf, state.limit);
      } else if (useCoinbaseChart(state.symbol)) {
        const p = new URLSearchParams({
          product: state.symbol,
          tf: state.tf,
          limit: String(state.limit),
        });
        const res = await fetch(`/api/coinbase/chart?${p}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        data = enrichChartPayload(json);
        setStatus("Coinbase · extended");
      } else {
        const p = new URLSearchParams({
          symbol: state.symbol,
          tf: state.tf,
          limit: String(state.limit),
        });
        const res = await fetch(`/api/chart?${p}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        data = enrichChartPayload(json);
      }
      if (reqId !== state.reqId) return;
      state.data = data;
      const row = window.FlipBoard?.getRow?.(state.symbol);
      if (row && data.closes?.length >= 26) {
        window.ChartCloses?.attach(row, data.closes);
      }
      renderChart(data);
      renderFlips(data.flips);
      updateHeader(data);
    } catch (e) {
      if (reqId !== state.reqId) return;
      state.data = null;
      clearCanvas();
      setStatus(String(e.message || e));
      renderFlips([]);
    } finally {
      if (reqId === state.reqId) state.loading = false;
    }
  }

  // ── Canvas rendering ──────────────────────────────────────────────────

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg) {
    const el = $("chartStatus");
    if (el) el.textContent = msg;
  }

  function squeezeChipHtml(sq) {
    if (!sq) return "";
    const label = window.BBSqueeze?.label(sq) || "—";
    const cls = sq.release ? "squeeze-chip--release" : sq.on ? "squeeze-chip--on" : "squeeze-chip--off";
    return `<span class="squeeze-chip ${cls}" title="Width pctile ${sq.widthPctile}% · score ${sq.squeezeScore}">${label} ${sq.squeezeScore}</span>`;
  }

  function predictedFlipHint(data) {
    const sq = data.squeeze;
    if (!sq?.predicted && !sq?.macdNearCross) return "";
    const dir = data.points.at(-1)?.histogram >= 0 ? "bullish" : "bearish";
    if (sq.release) return ` · release → ${dir} flip likely`;
    if (sq.on && sq.macdNearCross) return ` · MACD near cross (${dir})`;
    return "";
  }

  function updateHeader(data) {
    $("chartSymbol").textContent = data.symbol;
    const sq = data.squeeze;
    const sqPart = sq ? ` · ${window.BBSqueeze?.label(sq)} ${sq.squeezeScore}` : "";
    $("chartMeta").innerHTML =
      `${TF_LABELS[data.timeframe] || data.timeframe} · as of ${data.asOf} · close ${formatPrice(data.close)}${sqPart}${predictedFlipHint(data)}`;
    const chipEl = $("chartSqueezeChip");
    if (chipEl) {
      chipEl.innerHTML = squeezeChipHtml(sq);
      if (sq) {
        chipEl.title = `squeeze=${sq.on ? "ON" : "off"} release=${sq.release} score=${sq.squeezeScore} widthPctile=${sq.widthPctile}% predicted=${sq.predicted}${predictedFlipHint(data)}`;
      }
    }
    setStatus(`${data.flips.length} flips · hover lines for detail`);
  }

  function formatPrice(n) {
    if (n >= 1000) return n.toFixed(2);
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function clearCanvas() {
    for (const id of ["chartPrice", "chartMacd"]) {
      const c = $(id);
      if (!c) continue;
      const { ctx, w, h } = setupCanvas(c);
      ctx.fillStyle = "#12151a";
      ctx.fillRect(0, 0, w, h);
    }
  }

  function scaleRange(values, padPct = 0.06) {
    const nums = values.filter((v) => v != null && !Number.isNaN(v));
    if (!nums.length) return { min: 0, max: 1 };
    let min = Math.min(...nums);
    let max = Math.max(...nums);
    const pad = (max - min || max * 0.01) * padPct;
    return { min: min - pad, max: max + pad };
  }

  function xAt(i, n, padL, padR, w) {
    const inner = w - padL - padR;
    return padL + (i / Math.max(1, n - 1)) * inner;
  }

  function yAt(v, min, max, padT, padB, h) {
    const inner = h - padT - padB;
    return padT + ((max - v) / (max - min || 1)) * inner;
  }

  function drawLine(ctx, pts, min, max, pad, w, h, color, width = 1.5) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i];
      if (v == null || Number.isNaN(v)) {
        started = false;
        continue;
      }
      const x = xAt(i, pts.length, pad.l, pad.r, w);
      const y = yAt(v, min, max, pad.t, pad.b, h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawFlipMarkers(ctx, flips, n, pad, w, h, hits) {
    for (const flip of flips) {
      const idx = flip.barIndex;
      if (idx == null || idx < 0) continue;
      const x = xAt(idx, n, pad.l, pad.r, w);
      ctx.strokeStyle = flip.tableMatch ? "#f07178" : FLIP_COLORS[flip.type] || "#9aa0a6";
      ctx.globalAlpha = flip.tableMatch ? 0.85 : 0.5;
      ctx.lineWidth = flip.tableMatch ? 1.5 : 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, h - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      hits.push({
        x,
        flip,
        label: FLIP_SHORT[flip.type] || flip.type,
      });
    }
  }

  function renderPricePanel(data, hits) {
    const canvas = $("chartPrice");
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const pad = state.pad;
    const pts = data.points;
    const closes = pts.map((p) => p.close);
    const uppers = pts.map((p) => p.bbUpper);
    const lowers = pts.map((p) => p.bbLower);
    const mids = pts.map((p) => p.bbMiddle);
    const range = scaleRange([...closes, ...uppers, ...lowers, ...mids]);

    ctx.fillStyle = "#12151a";
    ctx.fillRect(0, 0, w, h);

    // BB fill
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const u = uppers[i];
      if (u == null) continue;
      const x = xAt(i, pts.length, pad.l, pad.r, w);
      const y = yAt(u, range.min, range.max, pad.t, pad.b, h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const l = lowers[i];
      if (l == null) continue;
      const x = xAt(i, pts.length, pad.l, pad.r, w);
      const y = yAt(l, range.min, range.max, pad.t, pad.b, h);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(122, 162, 247, 0.08)";
    ctx.fill();

    drawLine(ctx, lowers, range.min, range.max, pad, w, h, "rgba(122, 162, 247, 0.45)", 1);
    drawLine(ctx, mids, range.min, range.max, pad, w, h, "rgba(154, 160, 166, 0.55)", 1);
    drawLine(ctx, uppers, range.min, range.max, pad, w, h, "rgba(122, 162, 247, 0.45)", 1);
    drawLine(ctx, closes, range.min, range.max, pad, w, h, "#e8eaed", 2);

    drawFlipMarkers(ctx, data.flips, pts.length, pad, w, h, hits);

    // Y labels
    ctx.fillStyle = "#9aa0a6";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const v = range.min + ((range.max - range.min) * i) / 3;
      const y = yAt(v, range.min, range.max, pad.t, pad.b, h);
      ctx.fillText(formatPrice(v), pad.l - 4, y + 3);
    }

    // X labels
    ctx.textAlign = "center";
    const labels = [0, Math.floor(pts.length / 2), pts.length - 1];
    for (const i of labels) {
      if (!pts[i]) continue;
      const x = xAt(i, pts.length, pad.l, pad.r, w);
      ctx.fillText(shortDate(pts[i].date), x, h - 4);
    }
  }

  function renderMacdPanel(data, hits) {
    const canvas = $("chartMacd");
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const pad = state.pad;
    const pts = data.points;
    const macd = pts.map((p) => p.macd);
    const signal = pts.map((p) => p.signal);
    const hist = pts.map((p) => p.histogram);
    const range = scaleRange([...macd, ...signal, ...hist, 0]);

    ctx.fillStyle = "#12151a";
    ctx.fillRect(0, 0, w, h);

    // Zero line
    const y0 = yAt(0, range.min, range.max, pad.t, pad.b, h);
    ctx.strokeStyle = "#2a3038";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, y0);
    ctx.lineTo(w - pad.r, y0);
    ctx.stroke();

    // Histogram
    const barW = Math.max(1, ((w - pad.l - pad.r) / pts.length) * 0.65);
    for (let i = 0; i < pts.length; i++) {
      const v = hist[i];
      if (v == null) continue;
      const x = xAt(i, pts.length, pad.l, pad.r, w) - barW / 2;
      const y = yAt(v, range.min, range.max, pad.t, pad.b, h);
      ctx.fillStyle = v >= 0 ? "rgba(61, 214, 140, 0.55)" : "rgba(240, 113, 120, 0.55)";
      ctx.fillRect(x, Math.min(y, y0), barW, Math.abs(y - y0));
    }

    drawLine(ctx, macd, range.min, range.max, pad, w, h, "#7aa2f7", 1.5);
    drawLine(ctx, signal, range.min, range.max, pad, w, h, "#e6c068", 1.2);

    drawFlipMarkers(
      ctx,
      data.flips.filter((f) => f.indicator === "macd"),
      pts.length,
      pad,
      w,
      h,
      hits,
    );

    ctx.fillStyle = "#9aa0a6";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MACD", pad.l + 4, pad.t + 10);
    ctx.fillStyle = "#e6c068";
    ctx.fillText("Signal", pad.l + 44, pad.t + 10);
  }

  function shortDate(d) {
    if (d.includes(" ")) return d.slice(5, 16);
    if (d.includes("Q")) return d;
    return d.slice(2);
  }

  function showFlipTooltip(hit, canvas) {
    const tip = $("chartFlipTooltip");
    if (!tip || !hit) {
      if (tip) tip.hidden = true;
      return;
    }
    const f = hit.flip;
    tip.hidden = false;
    tip.textContent = `${hit.label} · ${f.barDate || f.date} · $${formatPrice(f.price)}`;
    const rect = canvas.getBoundingClientRect();
    const panel = canvas.closest(".chart-canvases")?.getBoundingClientRect();
    if (!panel) return;
    tip.style.left = `${rect.left - panel.left + hit.x}px`;
    tip.style.top = `${rect.top - panel.top + 4}px`;
  }

  function flipAtX(x, hits, tol = 8) {
    let best = null;
    let bestDist = tol;
    for (const h of hits) {
      const d = Math.abs(h.x - x);
      if (d <= bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  function onChartHover(e) {
    if (!state.data?.flips?.length) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const hit = flipAtX(x, state.flipHits);
    showFlipTooltip(hit, canvas);
  }

  function renderChart(data) {
    state.flipHits = [];
    renderPricePanel(data, state.flipHits);
    renderMacdPanel(data, state.flipHits);
  }

  function renderFlips(flips) {
    const el = $("chartFlips");
    if (!el) return;
    if (!flips.length) {
      el.innerHTML = '<span class="muted">No flips in chart window</span>';
      return;
    }
    const recent = flips.slice(-12).reverse();
    el.innerHTML = recent
      .map((f) => {
        const color = FLIP_COLORS[f.type] || "#9aa0a6";
        const label = FLIP_SHORT[f.type] || f.type;
        return `<span class="flip-chip" style="--chip:${color}" title="${f.date} · ${f.type}">${label} <small>${shortDate(f.date)}</small></span>`;
      })
      .join("");
  }

  function select(symbol, yahoo) {
    if (!symbol) return;
    state.symbol = symbol.toUpperCase();
    state.yahoo = (yahoo || symbol).toUpperCase();
    document.querySelectorAll("#board tbody tr[data-symbol]").forEach((tr) => {
      tr.classList.toggle("selected", tr.dataset.symbol === state.symbol);
    });
    loadChart();
  }

  function setTimeframe(tf) {
    state.tf = tf;
    document.querySelectorAll(".chart-tf").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tf === tf);
    });
    if (state.symbol) loadChart();
  }

  function bind() {
    document.querySelectorAll(".chart-tf").forEach((btn) => {
      btn.addEventListener("click", () => setTimeframe(btn.dataset.tf));
    });
    for (const id of ["chartPrice", "chartMacd"]) {
      const c = $(id);
      if (!c) continue;
      c.addEventListener("mousemove", onChartHover);
      c.addEventListener("mouseleave", () => showFlipTooltip(null));
    }
    window.addEventListener("resize", () => {
      if (state.data) renderChart(state.data);
    });
  }

  window.FlipChart = { select, setTimeframe, getState: () => ({ ...state }) };
  bind();
})();
