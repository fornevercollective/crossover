/**
 * Sector flip activity — aggregated Q/M/W/D/5h/1h heatmaps per Robinhood list.
 * Mirrors grok-repo-template #activity activity-branches layout.
 */
(function () {
  const htmlRoot = document.documentElement;
  const BASE = htmlRoot.dataset.base || "";

  function asset(path) {
    return `${BASE}${path}`;
  }

  function renderSectorActivity(data) {
    if (!window.TimelineCluster?.renderGroups) return;
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

    window.TimelineCluster.renderGroups(data, root);
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
    try {
      const res = await fetch(asset(`/data/sector-activity/${encodeURIComponent(slug)}.json`));
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async function showSector(slug) {
    const data = await loadSector(slug);
    if (data) renderSectorActivity(data);
  }

  async function init() {
    const index = await loadIndex();
    const chips = document.getElementById("sectorActivityChips");
    if (!index?.sectors?.length) {
      const panel = document.getElementById("sectorActivityPanel");
      if (panel) panel.hidden = true;
      return;
    }

    if (chips) {
      chips.innerHTML = index.sectors
        .sort((a, b) => b.eventCount - a.eventCount)
        .map(
          (s) =>
            `<button type="button" class="sector-activity-chip" data-slug="${s.slug}" title="${s.eventCount} flips">${s.sector}</button>`,
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
