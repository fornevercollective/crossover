/**
 * Sector flip activity — aggregated Q/M/W/D/5h/1h heatmaps per Robinhood list.
 * Lazy-loads sector JSON (keeps mobile off 50MB+ ETF payloads until selected).
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";
  const MAX_SECTOR_BYTES = 8 * 1024 * 1024;

  function asset(path) {
    return `${BASE}${path}`;
  }

  function renderSectorActivity(data) {
    if (!window.TimelineCluster?.renderGroupsInto) return;
    const panel = document.getElementById("sectorActivityPanel");
    const title = document.getElementById("sectorActivityTitle");
    const meta = document.getElementById("sectorActivityMeta");
    const root = document.getElementById("sectorActivityBranches");
    if (!panel || !root) return;

    panel.hidden = false;
    if (title) title.textContent = data.title || `${data.sector} · Sector activity`;
    if (meta) {
      meta.textContent = `${data.eventCount ?? 0} flips · ${data.symbolCount ?? 0} symbols · ${data.window?.start ?? ""} → ${data.window?.end ?? ""}`;
    }

    window.TimelineCluster.renderGroupsInto(data, root);
  }

  async function loadIndex() {
    try {
      const res = await fetch(asset("/data/sector-activity/index.json"));
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async function loadSector(slug) {
    const res = await fetch(asset(`/data/sector-activity/${encodeURIComponent(slug)}.json`), {
      method: "HEAD",
    }).catch(() => null);
    const len = Number(res?.headers?.get("content-length") || 0);
    if (len > MAX_SECTOR_BYTES) {
      throw new Error(`Sector file too large for mobile (${Math.round(len / 1024 / 1024)}MB)`);
    }
    const full = await fetch(asset(`/data/sector-activity/${encodeURIComponent(slug)}.json`));
    if (!full.ok) return null;
    return full.json();
  }

  async function showSector(slug) {
    const root = document.getElementById("sectorActivityBranches");
    const meta = document.getElementById("sectorActivityMeta");
    if (root) {
      root.innerHTML = '<p class="muted" style="padding:12px">Loading sector flips…</p>';
    }
    try {
      const data = await loadSector(slug);
      if (data) renderSectorActivity(data);
    } catch (err) {
      if (root) {
        root.innerHTML = `<p class="muted" style="padding:12px">Sector heatmap unavailable (${err.message}). Pick a smaller list.</p>`;
      }
      if (meta) meta.textContent = "Pick another sector";
    }
  }

  async function init() {
    const index = await loadIndex();
    const chips = document.getElementById("sectorActivityChips");
    const panel = document.getElementById("sectorActivityPanel");
    if (!index?.sectors?.length) {
      if (panel) panel.hidden = true;
      return;
    }

    if (panel) panel.hidden = false;

    if (chips) {
      const sorted = [...index.sectors].sort((a, b) => a.eventCount - b.eventCount);
      chips.innerHTML = sorted
        .map(
          (s) =>
            `<button type="button" class="sector-activity-chip" data-slug="${s.slug}" title="${s.eventCount.toLocaleString()} flips">${s.sector}</button>`,
        )
        .join("");
      chips.querySelectorAll(".sector-activity-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          chips.querySelectorAll(".sector-activity-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          showSector(btn.dataset.slug);
        });
      });
      const first = chips.querySelector(".sector-activity-chip");
      if (first) {
        first.classList.add("active");
        showSector(first.dataset.slug);
      }
    }
  }

  window.SectorActivity = { init, showSector };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
