/* Deck Vault — js/app.js
 *
 * App shell: builds the game tabs (Pokémon / Magic / Yu-Gi-Oh!) above the
 * header, switches the main views (Collection / Deck Builder / Buy List),
 * and owns the tiny shared UI helpers (toast notifications, nav badges).
 */

(function () {
  "use strict";

  const $ = sel => document.querySelector(sel);
  let activeView = "collection";

  function game() { return window.DV_STORE.state.activeGame; }

  /* ---------------- game tabs (above the header) ---------------- */

  function renderGameTabs() {
    const tabs = $("#game-tabs");
    tabs.innerHTML = window.DV_CONFIG.gameOrder.map(g => {
      const c = window.DV_CONFIG.games[g];
      return `<button class="game-tab ${g === game() ? "active" : ""}" data-game="${g}"
        style="--game-color:${c.color}">${c.label}</button>`;
    }).join("");
    tabs.querySelectorAll("[data-game]").forEach(btn => btn.onclick = () => {
      const g = btn.dataset.game;
      if (g === game()) return;
      window.DV_STORE.setActiveGame(g);
      window.DV_DECKS.onGameSwitch();
      renderGameTabs();
      renderView();
      refreshNavCounts();
    });
    document.body.dataset.game = game();
  }

  /* ---------------- main nav ---------------- */

  function renderNav() {
    const nav = $("#main-nav");
    nav.innerHTML = window.DV_CONFIG.views.map(v =>
      `<button class="nav-btn ${v.id === activeView ? "active" : ""}" data-view="${v.id}">
        <span class="nav-icon">${v.icon}</span>${v.label}
        <span class="nav-badge" id="badge-${v.id}"></span>
      </button>`).join("");
    nav.querySelectorAll("[data-view]").forEach(btn => btn.onclick = () => {
      activeView = btn.dataset.view;
      renderNav();
      renderView();
    });
    refreshNavCounts();
  }

  function refreshNavCounts() {
    const s = window.DV_STORE.state, g = game();
    const set = (id, n) => { const el = $("#badge-" + id); if (el) el.textContent = n > 0 ? n : ""; };
    set("collection", Object.values(s.collection[g]).reduce((a, e) => a + e.qty, 0));
    set("decks", s.decks.filter(d => d.game === g).length);
    set("buylist", Object.values(s.buylist[g]).reduce((a, i) => a + i.qtyWanted, 0));
    // Subtitle shows which game's data source is active.
    const sub = $("#game-source-note");
    if (sub) sub.textContent = window.DV_CONFIG.games[g].notes;
  }

  function renderView() {
    ["collection", "decks", "buylist"].forEach(v => {
      $("#view-" + v).hidden = v !== activeView;
    });
    if (activeView === "collection") window.DV_COLLECTION.render();
    if (activeView === "decks") window.DV_DECKS.render();
    if (activeView === "buylist") window.DV_BUYLIST.render();
  }

  /* ---------------- toast ---------------- */

  function toast(msg, isError) {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2600);
  }

  /* ---------------- init ---------------- */

  function init() {
    renderGameTabs();
    renderNav();
    window.DV_COLLECTION.bind();
    window.DV_DECKS.bind();
    window.DV_BUYLIST.bind();
    renderView();
    // Re-render the visible view when state changes elsewhere.
    window.DV_STORE.onChange(() => { /* badges refresh via explicit calls */ });
    // PWA: cache the app shell for installable/offline use.
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  window.DV_APP = { init, toast, refreshNavCounts, renderView };
  document.addEventListener("DOMContentLoaded", init);
})();
