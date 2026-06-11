/**
 * BB squeeze detection — shared by chart, trading-concepts, imminent-flips.
 * Squeeze ON: width in bottom N-period percentile. Release: was squeezed + expanding.
 */
(function () {
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
    return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  }

  function bandwidthSeries(closes, period = 20, mult = 2) {
    const middle = sma(closes, period);
    return closes.map((_, i) => {
      const mid = middle[i];
      if (mid == null || mid === 0) return null;
      const sd = stddev(closes, period, i);
      return (2 * mult * sd) / mid;
    });
  }

  function macdSeries(closes) {
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

  /**
   * @param {number[]} closes
   * @param {{ lookback?: number, pctThreshold?: number }} opts
   */
  function analyzeFromCloses(closes, opts = {}) {
    const lookback = opts.lookback ?? 120;
    const pctThreshold = opts.pctThreshold ?? 0.2;
    const empty = {
      on: false,
      release: false,
      predicted: false,
      expanding: false,
      widthPctile: 50,
      squeezeScore: 0,
      bandwidth: NaN,
      macdNearCross: false,
      histMomentum: 0,
    };
    if (!closes || closes.length < 26) return empty;

    const widths = bandwidthSeries(closes);
    const macd = macdSeries(closes);
    const i = closes.length - 1;
    const cur = widths[i];
    const prev = widths[i - 1];
    if (cur == null) return empty;

    const recent = widths.slice(-lookback).filter((w) => w != null);
    const rank = recent.filter((w) => w <= cur).length / Math.max(1, recent.length);
    const on = rank <= pctThreshold;
    const expanding = prev != null && cur > prev * 1.02;

    let wasSqueeze = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const w = widths[j];
      if (w == null) continue;
      const slice = widths.slice(Math.max(0, j - lookback + 1), j + 1).filter((x) => x != null);
      if (!slice.length) continue;
      const r = slice.filter((x) => x <= w).length / slice.length;
      if (r <= pctThreshold) {
        wasSqueeze = true;
        break;
      }
    }
    const release = wasSqueeze && expanding;

    const m = macd[i];
    const pm = macd[i - 1];
    const span = Math.max(Math.abs(m.signal), 1e-6);
    const macdNearCross = Math.abs(m.macd - m.signal) / span <= 0.15;
    const histMomentum = m.histogram - pm.histogram;
    const histAccel =
      (m.histogram >= 0 && histMomentum > 0) || (m.histogram < 0 && histMomentum < 0);

    let score = 0;
    if (on) score += 35;
    if (release) score += 30;
    if (expanding) score += 15;
    if (macdNearCross) score += 12;
    if (histAccel) score += 8;
    const predicted = release || (on && (macdNearCross || histAccel));

    return {
      on,
      release,
      predicted,
      expanding,
      widthPctile: Math.round(rank * 100),
      squeezeScore: Math.min(100, Math.round(score)),
      bandwidth: cur,
      macdNearCross,
      histMomentum,
    };
  }

  function label(state) {
    if (!state) return "—";
    if (state.release) return "Squeeze release";
    if (state.on) return "Squeeze ON";
    if (state.expanding) return "BB expanding";
    return "Normal";
  }

  window.BBSqueeze = { analyzeFromCloses, bandwidthSeries, label };
})();
