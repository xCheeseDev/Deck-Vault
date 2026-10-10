/* Deck Vault — js/buylist.js
 *
 * The Buy List view: every card the deck builder flagged as MISSING lands
 * here, aggregated by card with a wanted quantity. Each row links out to
 * real stores (per-game list in js/config.js) so the user can price-shop,
 * and "Bought ✓" moves the card straight into the collection.
 */

(function () {
  "use strict";

  const $ = sel => document.querySelector(sel);
  function game() { return window.DV_STORE.state.activeGame; }
  function cfg() { return window.DV_CONFIG.games[game()]; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function render() {
    const bag = window.DV_STORE.state.buylist[game()];
    const items = Object.values(bag).sort((a, b) => b.addedAt - a.addedAt);
    const box = $("#buylist-items");
    $("#buylist-count").textContent =
      items.reduce((s, i) => s + i.qtyWanted, 0) + " cards to buy";

    if (!items.length) {
      box.innerHTML = `<div class="hint">Nothing here yet. Build a deck and the cards you don’t own will land on this list automatically — or add them manually from a suggestion row.</div>`;
      return;
    }

    box.innerHTML = items.map(i => `
      <div class="buy-row">
        <div class="buy-main">
          <div class="buy-name">${esc(i.card.name)} <span class="qty-badge">×${i.qtyWanted}</span></div>
          <div class="muted small">${esc(i.card.set || "")}</div>
          <div class="store-links">
            ${cfg().stores.map(s => `<a class="store-link" href="${esc(s.url(i.card.name))}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join("")}
          </div>
        </div>
        <div class="row">
          <button class="btn small" data-bought="${esc(i.card.key)}">✓ Bought</button>
          <button class="btn small danger ghost" data-unbuy="${esc(i.card.key)}">Remove</button>
        </div>
      </div>`).join("");

    box.querySelectorAll("[data-bought]").forEach(btn => btn.onclick = () => {
      const item = window.DV_STORE.state.buylist[game()][btn.dataset.bought];
      window.DV_STORE.markBought(game(), btn.dataset.bought);
      window.DV_APP.toast(`Moved ${item ? item.qtyWanted : ""}× ${item ? item.card.name : "card"} to collection`);
      render();
      window.DV_APP.refreshNavCounts();
    });
    box.querySelectorAll("[data-unbuy]").forEach(btn => btn.onclick = () => {
      window.DV_STORE.removeFromBuylist(game(), btn.dataset.unbuy);
      render();
      window.DV_APP.refreshNavCounts();
    });
  }

  function bind() { /* all events bound inside render() */ }

  window.DV_BUYLIST = { render, bind };
})();
