/**
 * Paper Trading Brief Card — confluence of TA stub + flip-board signal layer.
 * Entertainment / research only — not investment advice.
 */
(function () {
  const htmlRoot = document.documentElement;
  const STATIC = htmlRoot.dataset.static === "1" || htmlRoot.dataset.static === "true";

  let currentTicker = null;
  let loadedPayload = null;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtPrice(n) {
    if (n == null || Number.isNaN(n)) return "—";
    if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  }

  function normalizeBias(b) {
    if (!b) return "neutral";
    const s = String(b).toLowerCase();
    if (s.includes("bull")) return "bullish";
    if (s.includes("bear")) return "bearish";
    if (s === "long") return "bullish";
    if (s === "short") return "bearish";
    return "neutral";
  }

  /** Derive lightweight TA read from quote-only data (no mood engine). */
  function stubTaFromQuote(quote) {
    const chg = quote.dailyChangePct;
    let trend = "Sideways";
    if (chg != null) {
      if (chg > 1.5) trend = "Strong up";
      else if (chg > 0.25) trend = "Up";
      else if (chg < -1.5) trend = "Strong down";
      else if (chg < -0.25) trend = "Down";
    }

    const level =
      quote.last != null && quote.prev != null
        ? quote.last >= quote.prev
          ? "Above prev close"
          : "Below prev close"
        : quote.last != null
          ? "At market"
          : "—";

    let pattern = "—";
    if (chg != null) {
      if (Math.abs(chg) < 0.15) pattern = "Doji day";
      else if (chg > 2) pattern = "Expansion up";
      else if (chg < -2) pattern = "Expansion down";
      else pattern = "Range day";
    }

    let bias = "neutral";
    if (chg != null) {
      if (chg > 0.35) bias = "bullish";
      else if (chg < -0.35) bias = "bearish";
    }

    return { trend, level, pattern, bias };
  }

  /** Compare TA layer vs flip-board signal layer. */
  function confluenceReadout(taBias, signalBias) {
    const ta = normalizeBias(taBias);
    const sig = normalizeBias(signalBias);

    if (ta === "neutral" && sig === "neutral") {
      return {
        kind: "pending",
        readout: "No strong read on either layer.",
        hint: "Wait for clearer structure or MACD/BB alignment.",
      };
    }
    if (ta !== "neutral" && sig === "neutral") {
      return {
        kind: "ta-only",
        readout: "Price structure active; flip signal neutral.",
        hint: "TA leads — confirm with Q→D MACD stack before sizing.",
      };
    }
    if (ta === "neutral" && sig !== "neutral") {
      return {
        kind: "signal-only",
        readout: "Flip-board signal active; quote structure flat.",
        hint: "Signal track leads — watch RH official move for conflict.",
      };
    }
    if (ta === sig) {
      return {
        kind: "align",
        readout: `Both layers ${ta}.`,
        hint:
          ta === "bullish"
            ? "Aligned long bias — paper review only, not advice."
            : "Aligned short bias — paper review only, not advice.",
      };
    }
    return {
      kind: "conflict",
      readout: "TA and flip signal disagree.",
      hint: "Skip or reduce size until layers reconcile.",
    };
  }

  async function fetchQuote(ticker) {
    if (STATIC) {
      throw new Error("Quotes need local server (npm run board:serve)");
    }
    const qty = Number($("paperQty")?.value || 100);
    const res = await fetch(`/api/paper/probe?symbol=${encodeURIComponent(ticker)}&qty=${qty}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    const rh = data.robinhood;
    return {
      probe: data,
      last: rh.lastTradePrice,
      chg: rh.dailyChangePct,
      prev: rh.adjustedPreviousClose ?? rh.previousClose,
      source: rh.source,
      asOf: rh.asOf,
    };
  }

  function fetchSignal(ticker) {
    const row =
      window.FlipBoard?.getRow?.(ticker) ??
      window.FlipBoard?.getRow?.(ticker.toUpperCase());
    if (!row) {
      return {
        track: "day",
        score: null,
        status: "neutral",
        bias: "neutral",
        side: "neutral",
        bb: null,
        lastFlip: null,
      };
    }
    const meta = window.FlipBoard.profitMeta(row);
    const day = row.frames?.day;
    const bias =
      day?.macdBias ??
      (meta.side === "long" ? "bullish" : meta.side === "short" ? "bearish" : "neutral");
    let status = "neutral";
    if (meta.score >= 70) status = meta.side === "long" ? "bullish" : meta.side === "short" ? "bearish" : "active";
    else if (meta.score >= 40) status = "watch";
    else status = "weak";

    return {
      track: "Q→D MACD",
      score: meta.score,
      status,
      bias,
      side: meta.side,
      bb: day?.bbPosition ?? null,
      lastFlip: day?.lastFlip ?? null,
    };
  }

  async function fetchPosition(ticker) {
    if (STATIC) return null;
    const res = await fetch(`/api/paper/position?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    return res.json();
  }

  function setPill(el, kind, text) {
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function renderBrief(ticker, quoteWrap, signal, position, ta) {
    const conf = confluenceReadout(ta.bias, signal.bias);

    $("paperBrief").hidden = false;
    $("paperBriefTicker").textContent = ticker;
    $("paperBriefPhaseBadge").textContent = quoteWrap.source === "robinhood" ? "Paper · RH quote" : "Paper · Yahoo";

    $("paperBriefLast").textContent = fmtPrice(quoteWrap.last);
    $("paperBriefChg").textContent = fmtPct(quoteWrap.chg);
    $("paperBriefPrev").textContent = fmtPrice(quoteWrap.prev);

    const chgRow = $("paperBriefChg")?.closest(".paperBrief__quoteRow");
    document.querySelectorAll(".paperBrief__quoteRow").forEach((r) => {
      r.classList.remove("paperBrief__quoteRow--up", "paperBrief__quoteRow--down");
    });
    if (quoteWrap.chg != null && chgRow) {
      chgRow.classList.add(quoteWrap.chg >= 0 ? "paperBrief__quoteRow--up" : "paperBrief__quoteRow--down");
    }

    $("paperBriefTaTrend").textContent = ta.trend;
    $("paperBriefTaLevel").textContent = ta.level;
    $("paperBriefTaPattern").textContent = ta.pattern;
    setPill($("paperBriefTaBias"), ta.bias, ta.bias);

    $("paperBriefTrack").textContent = signal.track;
    $("paperBriefScore").textContent = signal.score != null ? `${signal.score}%` : "—";
    setPill($("paperBriefStatusPill"), signal.status, signal.status);
    $("paperBriefSignalBias").textContent = signal.bias;
    if (signal.lastFlip) {
      $("paperBriefSignalBias").title = `Last flip: ${signal.lastFlip.type} @ ${signal.lastFlip.date}`;
    }

    const confEl = $("paperBriefConfluence");
    confEl.dataset.kind = conf.kind;
    $("paperBriefConfluenceReadout").textContent = conf.readout;
    $("paperBriefActionHint").textContent = conf.hint;

    if (position?.position) {
      const p = position.position;
      const pnl = position.dayPnl;
      $("paperBriefPosShares").textContent = `${p.shares} sh`;
      $("paperBriefPosEntry").textContent = fmtPrice(p.entry);
      $("paperBriefPosPnl").textContent =
        pnl != null ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—";
    } else {
      $("paperBriefPosShares").textContent = "Flat";
      $("paperBriefPosEntry").textContent = "—";
      $("paperBriefPosPnl").textContent = "—";
    }

    $("paperBriefFootStatus").textContent = quoteWrap.asOf
      ? `Updated ${String(quoteWrap.asOf).slice(0, 19)} · ${quoteWrap.source}`
      : "Entertainment only — not financial advice.";

    $("paperBriefReviewBtn").disabled = false;
    $("paperBriefLogBtn").disabled = false;

    loadedPayload = { ticker, quoteWrap, signal, ta, conf, position, probe: quoteWrap.probe };
  }

  async function load(ticker) {
    if (!ticker) return;
    currentTicker = ticker.toUpperCase();
    $("paperBriefFootStatus").textContent = "Loading…";
    $("paperBriefReviewBtn").disabled = true;
    $("paperBriefLogBtn").disabled = true;

    try {
      const signal = fetchSignal(currentTicker);
      let quoteWrap = null;
      let position = null;

      if (!STATIC) {
        quoteWrap = await fetchQuote(currentTicker);
        position = await fetchPosition(currentTicker);
      } else {
        const row = window.FlipBoard?.getRow?.(currentTicker);
        quoteWrap = {
          last: row?.frames?.day?.close ?? null,
          chg: null,
          prev: null,
          source: "board",
          asOf: row?.frames?.day?.asOf ?? null,
          probe: null,
        };
      }

      const ta = stubTaFromQuote({
        last: quoteWrap.last,
        dailyChangePct: quoteWrap.chg,
        prev: quoteWrap.prev,
      });

      renderBrief(currentTicker, quoteWrap, signal, position, ta);
    } catch (e) {
      $("paperBriefFootStatus").textContent = String(e.message || e);
      $("paperBrief").hidden = false;
      $("paperBriefTicker").textContent = currentTicker;
    }
  }

  async function logDecision(action) {
    if (!loadedPayload || !currentTicker || STATIC) return;
    const body = {
      symbol: currentTicker,
      action,
      confluence: loadedPayload.conf.kind,
      taBias: loadedPayload.ta.bias,
      signalBias: loadedPayload.signal.bias,
      quote: loadedPayload.quoteWrap.last,
      note: loadedPayload.conf.hint,
      side: loadedPayload.probe?.paperTrade?.side,
    };
    await fetch("/api/paper/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    $("paperBriefFootStatus").textContent = `Logged ${action} @ ${new Date().toISOString().slice(0, 19)}`;
  }

  function bind() {
    $("paperBriefReviewBtn")?.addEventListener("click", async () => {
      if (!loadedPayload?.probe) return;
      const pt = loadedPayload.probe.paperTrade;
      const msg = [
        `Paper ${pt.side.toUpperCase()} ${pt.quantity} @ ${fmtPrice(pt.estFillPrice)}`,
        pt.rationale,
        `Confluence: ${loadedPayload.conf.kind}`,
      ].join("\n");
      alert(msg);
      if (!STATIC && pt.side !== "hold" && pt.estFillPrice != null) {
        const shares = pt.side === "buy" ? pt.quantity : -pt.quantity;
        await fetch("/api/paper/position", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: currentTicker,
            shares,
            entry: pt.estFillPrice,
          }),
        });
      }
      logDecision("review");
    });

    $("paperBriefLogBtn")?.addEventListener("click", () => logDecision("log"));

    $("tickerInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const sym = $("tickerInput").value.trim().toUpperCase();
        if (sym) load(sym);
      }
    });
  }

  window.PaperBrief = { load, stubTaFromQuote, confluenceReadout };
  bind();
})();
