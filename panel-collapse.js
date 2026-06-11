/**
 * Collapsible dashboard panels — state persisted in sessionStorage.
 */
(function () {
  const PREFIX = "flipboard:collapse:";

  function setExpanded(panel, expanded) {
    panel.classList.toggle("is-collapsed", !expanded);
    const toggle = panel.querySelector(".panel-collapse-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    sessionStorage.setItem(PREFIX + panel.id, expanded ? "1" : "0");
  }

  function initPanel(panel, defaultExpanded = true) {
    if (!panel?.id) return;
    const stored = sessionStorage.getItem(PREFIX + panel.id);
    const expanded = stored === null ? defaultExpanded : stored === "1";
    setExpanded(panel, expanded);

    const toggle = panel.querySelector(".panel-collapse-toggle");
    toggle?.addEventListener("click", (e) => {
      e.preventDefault();
      setExpanded(panel, panel.classList.contains("is-collapsed"));
    });
  }

  function init() {
    for (const id of ["imminentFlipsPanel", "skimScannerPanel"]) {
      initPanel(document.getElementById(id));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PanelCollapse = { init };
})();
