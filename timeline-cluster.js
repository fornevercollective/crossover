/**
 * Timeline cluster — flip/squeeze milestones with activity heatmap + branch accordion.
 * Ported from fornevercollective/grok-repo-template activity-branches pattern.
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";

  const BRANCH_COLORS = {
    quarter: "#e6c068",
    month: "#7aa2f7",
    week: "#3dd68c",
    day: "#bb9af7",
    macd: "#7aa2f7",
    histogram: "#bb9af7",
    bollinger: "#e6c068",
    squeeze: "#f07178",
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
    squeeze_on: "Sq ON",
    squeeze_release: "Sq REL",
  };

  const state = { symbol: null, data: null, charts: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function asset(path) {
    return `${BASE}${path}`;
  }

  function formatSpan(events) {
    if (!events.length) return "—";
    const sorted = [...events].sort((a, b) => a.sort.localeCompare(b.sort));
    return `${sorted[0].date} – ${sorted[sorted.length - 1].date}`;
  }

  function branchColor(branchId, branch) {
    return branch?.color || BRANCH_COLORS[branchId] || "#7aa2f7";
  }

  function heatmapScale(color) {
    return ["#1a1f28", color + "33", color + "88", color];
  }

  function expandEventsToCalendarData(events) {
    const data = new Map();
    for (const ev of events) {
      const d = ev.date?.slice(0, 10);
      if (!d) continue;
      data.set(d, (data.get(d) || 0) + (ev.id?.includes("squeeze") ? 2 : 1));
    }
    return [...data.entries()].map(([date, count]) => [date, count]);
  }

  function calendarRange(events) {
    if (!events.length) {
      const y = new Date().getFullYear();
      return [String(y), String(y)];
    }
    const sorts = events.map((e) => e.sort || e.date).sort();
    return [sorts[0].slice(0, 4), sorts[sorts.length - 1].slice(0, 4)];
  }

  function renderEventList(events, branchId) {
    return events
      .slice()
      .sort((a, b) => (b.sort || b.date).localeCompare(a.sort || a.date))
      .map((ev) => {
        const slug = FLIP_SHORT[ev.id] || ev.id;
        const pct =
          ev.pct != null ? `<span class="tl-event-pct" title="Signal strength">${ev.pct}%</span>` : "";
        const spark =
          ev.sparkline?.length > 1
            ? `<canvas class="tl-event-spark" data-spark="${ev.sparkline.join(",")}" width="64" height="20" aria-hidden="true"></canvas>`
            : "";
        return `<li class="tl-event-item" data-branch="${branchId}">
          <span class="tl-event-date">${ev.date}</span>
          <span class="tl-event-id">${slug}</span>
          ${pct}
          ${spark}
          <span class="tl-event-desc">${ev.title}</span>
        </li>`;
      })
      .join("");
  }

  function drawCalendarHeatmap(canvas, events, color) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.fillStyle = "#12151a";
    ctx.fillRect(0, 0, w, h);

    const calData = expandEventsToCalendarData(events);
    if (!calData.length) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("No events in range", 12, h / 2);
      return;
    }

    const [yStart, yEnd] = calendarRange(events);
    const years = [];
    for (let y = parseInt(yStart, 10); y <= parseInt(yEnd, 10); y++) years.push(y);

    const scale = heatmapScale(color);
    const maxVal = Math.max(2, ...calData.map((d) => d[1]));
    const dataMap = new Map(calData);

    const padL = 28;
    const padT = 14;
    const padR = 8;
    const padB = 8;
    const cellH = Math.min(12, Math.max(8, (h - padT - padB) / years.length - 4));
    const innerW = w - padL - padR;

    ctx.fillStyle = "#9aa0a6";
    ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
    const dayLabels = ["", "M", "", "W", "", "F", ""];
    for (let di = 0; di < 7; di++) {
      if (!dayLabels[di]) continue;
      ctx.fillText(dayLabels[di], 4, padT + cellH * 0.7);
    }

    years.forEach((year, yi) => {
      const yearTop = padT + yi * (cellH + 6);
      ctx.fillStyle = "#9aa0a6";
      ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(year), padL, yearTop - 2);

      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31));
      const days = Math.ceil((end - start) / 86400000) + 1;
      const cellW = Math.max(2, innerW / 53);

      for (let d = 0; d < days; d++) {
        const dt = new Date(start.getTime() + d * 86400000);
        const key = dt.toISOString().slice(0, 10);
        const val = dataMap.get(key) || 0;
        const dow = dt.getUTCDay();
        const week = Math.floor(d / 7);
        const x = padL + week * cellW;
        const y = yearTop + dow * (cellH / 7);
        const idx = val <= 0 ? 0 : Math.min(scale.length - 1, Math.round((val / maxVal) * (scale.length - 1)));
        ctx.fillStyle = scale[idx];
        ctx.fillRect(x, y, Math.max(1, cellW - 1), Math.max(2, cellH / 7 - 0.5));
      }
    });
  }

  function drawSparklines(root) {
    root.querySelectorAll(".tl-event-spark").forEach((canvas) => {
      const raw = canvas.dataset.spark;
      if (!raw) return;
      const vals = raw.split(",").map(Number).filter((n) => !Number.isNaN(n));
      if (vals.length < 2) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const pad = 2;
      ctx.strokeStyle = "#7aa2f7";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
        const y = pad + ((max - v) / (max - min || 1)) * (h - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function renderGroups(data) {
    const root = $("timelineClusterBranches");
    if (!root) return;
    state.charts = [];

    const groups = (data.groups || []).map((group, index) => ({
      ...group,
      open: index === 0,
      meta: `${group.branches.reduce((n, b) => n + (b.events?.length || 0), 0)} events · ${group.branches.length} branches`,
    }));

    root.innerHTML = groups
      .map((group) => {
        const branchPanels = group.branches
          .map((branch) => {
            const events = branch.events || [];
            const span = formatSpan(events);
            const color = branchColor(branch.id, branch);
            return `
          <details class="tl-branch" data-branch="${branch.id}" style="--branch-accent:${color}">
            <summary>
              <span class="tl-branch-swatch" aria-hidden="true"></span>
              <span class="tl-branch-name">${branch.label}</span>
              <span class="tl-branch-meta">${events.length} events · ${span}</span>
            </summary>
            <div class="tl-branch-body">
              <canvas class="tl-branch-heatmap" aria-label="${branch.label} activity heatmap"></canvas>
              <ol class="tl-event-list">${renderEventList(events, branch.id)}</ol>
            </div>
          </details>`;
          })
          .join("");

        const openAttr = group.open ? " open" : "";
        const swatches = group.branches
          .map(
            (b) =>
              `<span class="tl-group-swatch" style="background:${branchColor(b.id, b)}" aria-hidden="true"></span>`,
          )
          .join("");

        return `
        <details class="tl-group" data-group="${group.id}"${openAttr}>
          <summary>
            <span class="tl-group-title-wrap">
              <span class="tl-group-swatches">${swatches}</span>
              <span>${group.label}</span>
            </span>
            <span class="tl-group-meta">${group.meta}</span>
          </summary>
          <div class="tl-branch-list">${branchPanels}</div>
        </details>`;
      })
      .join("");

    root.querySelectorAll(".tl-branch").forEach((details) => {
      const branchId = details.dataset.branch;
      const branch = groups.flatMap((g) => g.branches).find((b) => b.id === branchId);
      const tryInit = () => {
        if (!details.open || !branch) return;
        const canvas = details.querySelector(".tl-branch-heatmap");
        drawCalendarHeatmap(canvas, branch.events || [], branchColor(branchId, branch));
        drawSparklines(details);
      };
      details.addEventListener("toggle", tryInit);
      if (details.open) tryInit();
    });

    drawSparklines(root);
  }

  function renderHeader(data) {
    const title = $("timelineClusterTitle");
    const meta = $("timelineClusterMeta");
    const panel = $("timelineClusterPanel");
    if (!panel) return;

    panel.hidden = false;
    if (title) title.textContent = data.title || `${data.sector || "—"} · ${data.symbol} · Flips · Timeline`;

    const parts = [];
    const totalEvents = (data.groups || []).reduce(
      (n, g) => n + g.branches.reduce((m, b) => m + (b.events?.length || 0), 0),
      0,
    );
    parts.push(`${totalEvents} milestones`);
    if (data.backtest?.trades) {
      parts.push(`backtest ${data.backtest.winRate}% win (${data.backtest.trades}t)`);
    }
    if (meta) meta.textContent = parts.join(" · ");
  }

  async function loadTimeline(symbol, yahoo) {
    const sym = symbol?.toUpperCase();
    if (!sym) return null;
    const y = encodeURIComponent(yahoo || sym);
    try {
      const res = await fetch(asset(`/data/timelines/${y}.json`));
      if (res.ok) return res.json();
    } catch {
      /* fallback below */
    }
    return null;
  }

  function hide() {
    const panel = $("timelineClusterPanel");
    if (panel) panel.hidden = true;
    state.symbol = null;
    state.data = null;
  }

  async function update(symbol, yahoo, chartData) {
    if (!symbol) {
      hide();
      return;
    }
    state.symbol = symbol.toUpperCase();
    const row = window.FlipBoard?.getRow?.(symbol);
    let data = await loadTimeline(symbol, yahoo || row?.yahoo || symbol);

    if (!data && chartData) {
      data = {
        symbol: state.symbol,
        sector: row?.sector || "Other",
        title: `${row?.sector || "Other"} · ${state.symbol} · Flips · Timeline`,
        groups: [
          {
            id: "live",
            label: `${chartData.timeframe?.toUpperCase() || "D"} · live chart`,
            branches: [
              {
                id: chartData.timeframe || "day",
                label: (chartData.timeframe || "day").toUpperCase(),
                color: BRANCH_COLORS[chartData.timeframe] || BRANCH_COLORS.day,
                events: (chartData.flips || []).map((f) => ({
                  sort: f.date?.slice(0, 10),
                  date: f.date?.slice(0, 10) || f.barDate?.slice(0, 10),
                  id: f.type,
                  title: `${FLIP_SHORT[f.type] || f.type} · $${f.price?.toFixed?.(2) ?? "?"}`,
                  pct: null,
                })),
              },
            ],
          },
        ],
      };
      if (chartData.squeeze) {
        const sq = chartData.squeeze;
        data.groups[0].branches.push({
          id: "squeeze",
          label: "Squeeze",
          color: BRANCH_COLORS.squeeze,
          events: [
            {
              sort: chartData.asOf?.slice(0, 10),
              date: chartData.asOf?.slice(0, 10),
              id: sq.release ? "squeeze_release" : sq.on ? "squeeze_on" : "squeeze_on",
              title: `${window.BBSqueeze?.label(sq) || "Squeeze"} · score ${sq.squeezeScore}`,
              pct: sq.squeezeScore,
            },
          ],
        });
      }
    }

    if (!data) {
      hide();
      return;
    }

    state.data = data;
    renderHeader(data);
    renderGroups(data);
  }

  function bind() {
    window.addEventListener("resize", () => {
      if (!state.data) return;
      document.querySelectorAll(".tl-branch[open]").forEach((details) => {
        const branchId = details.dataset.branch;
        const branch = state.data.groups
          ?.flatMap((g) => g.branches)
          .find((b) => b.id === branchId);
        if (!branch) return;
        drawCalendarHeatmap(
          details.querySelector(".tl-branch-heatmap"),
          branch.events || [],
          branchColor(branchId, branch),
        );
      });
    });
  }

  window.TimelineCluster = { update, hide };
  bind();
})();
