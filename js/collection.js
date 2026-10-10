/* Deck Vault — js/collection.js
 *
 * The Collection view: search any card via the game's free API, add
 * copies to the collection, adjust quantities, and "scan" a physical
 * card with the device camera.
 *
 * Scan is honest about what it is: the camera captures a photo of the
 * card and attaches it to the collection entry, but identifying the card
 * from the photo is done by the user picking the search match. True
 * automatic recognition needs a card-recognition API/service, which is
 * stubbed as a future step (see README).
 */

(function () {
  "use strict";

  const $ = sel => document.querySelector(sel);
  let lastResults = [];
  let searchTimer = null;
  let stream = null;

  function game() { return window.DV_STORE.state.activeGame; }
  function cfg() { return window.DV_CONFIG.games[game()]; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function cardTile(card, opts = {}) {
    const qty = opts.qty;
    return `
      <div class="card-tile" data-key="${esc(card.key)}">
        <div class="card-img">${card.image ? `<img loading="lazy" src="${esc(card.image)}" alt="${esc(card.name)}">` : `<div class="card-img-fallback">${esc(card.name)}</div>`}</div>
        <div class="card-name">${esc(card.name)}</div>
        <div class="card-meta">${esc(card.set || "")}${card.number ? " · #" + esc(card.number) : ""}</div>
        ${card.price ? `<div class="card-price">${esc(card.price)}</div>` : ""}
        ${opts.actions || ""}
        ${qty !== undefined ? `<div class="qty-badge">×${qty}</div>` : ""}
      </div>`;
  }

  /* ---------------- search + add ---------------- */

  async function runSearch() {
    const input = $("#card-search");
    const q = input.value.trim();
    const box = $("#search-results");
    if (q.length < 2) { box.innerHTML = ""; lastResults = []; return; }
    box.innerHTML = `<div class="hint">Searching ${esc(cfg().label)} cards…</div>`;
    try {
      lastResults = await window.DV_API.searchCards(game(), q);
      if (!lastResults.length) {
        box.innerHTML = `<div class="hint">No cards found for “${esc(q)}”.</div>`;
        return;
      }
      box.innerHTML = lastResults.map(c =>
        cardTile(c, { actions: `<button class="btn small" data-add="${esc(c.key)}">+ Add</button>` })
      ).join("");
    } catch (e) {
      box.innerHTML = `<div class="hint error">Search failed: ${esc(e.message)}. Check your connection and try again.</div>`;
    }
  }

  async function addCard(key) {
    let card = lastResults.find(c => c.key === key);
    if (!card) return;
    card = await window.DV_API.enrichCard(card);
    window.DV_STORE.addToCollection(card, 1);
    window.DV_APP.toast(`Added 1× ${card.name} to collection`);
    renderCollectionGrid();
    window.DV_APP.refreshNavCounts();
  }

  /* ---------------- collection grid ---------------- */

  function renderCollectionGrid() {
    const bag = window.DV_STORE.state.collection[game()];
    const grid = $("#collection-grid");
    const entries = Object.values(bag).sort((a, b) => a.name.localeCompare(b.name));
    $("#collection-count").textContent = entries.reduce((s, e) => s + e.qty, 0) + " cards";
    if (!entries.length) {
      grid.innerHTML = `<div class="hint">Your ${esc(cfg().label)} collection is empty. Search above — or scan a card — to add your first one.</div>`;
      return;
    }
    grid.innerHTML = entries.map(e => cardTile(e, {
      qty: e.qty,
      actions: `
        <div class="qty-row">
          <button class="btn small ghost" data-dec="${esc(e.key)}">−</button>
          <button class="btn small ghost" data-inc="${esc(e.key)}">+</button>
          <button class="btn small danger ghost" data-del="${esc(e.key)}">Remove</button>
        </div>
        ${e.scanPhoto ? `<div class="scan-note">◉ scanned</div>` : ""}`,
    })).join("");
  }

  /* ---------------- scan modal ---------------- */

  function openScan() {
    const root = $("#modal-root");
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal" role="dialog" aria-label="Scan card">
          <h3>Scan card <span class="muted">(${esc(cfg().label)})</span></h3>
          <p class="muted small">Point the camera at the card, capture it, then pick the matching card below. The photo is saved with your collection entry.</p>
          <video id="scan-video" playsinline autoplay muted></video>
          <canvas id="scan-canvas" hidden></canvas>
          <div id="scan-preview"></div>
          <div class="row">
            <button class="btn" id="scan-capture">◉ Capture</button>
            <button class="btn ghost" data-close>Cancel</button>
          </div>
          <div id="scan-match" hidden>
            <input id="scan-name" placeholder="Type the card name to match…">
            <div id="scan-results" class="results-grid"></div>
          </div>
        </div>
      </div>`;
    startCamera();
    $("#scan-capture").onclick = capturePhoto;
    root.querySelectorAll("[data-close]").forEach(el => el.onclick = closeScan);
    const nameInput = $("#scan-name");
    nameInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => scanSearch(nameInput.value.trim()), 350);
    });
    $("#scan-results").addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-pick]");
      if (!btn) return;
      let card = scanMatches.find(c => c.key === btn.dataset.pick);
      if (!card) return;
      card = await window.DV_API.enrichCard(card);
      const photo = $("#scan-canvas").toDataURL("image/jpeg", 0.7);
      const full = Object.assign({}, card, { scanPhoto: photo });
      window.DV_STORE.addToCollection(full, 1);
      // stash the photo on the stored entry
      window.DV_STORE.state.collection[game()][card.key].scanPhoto = photo;
      window.DV_STORE.save();
      window.DV_APP.toast(`Scanned + added 1× ${card.name}`);
      closeScan();
      renderCollectionGrid();
      window.DV_APP.refreshNavCounts();
    });
  }

  let scanMatches = [];
  async function scanSearch(q) {
    const box = $("#scan-results");
    if (q.length < 2) { box.innerHTML = ""; scanMatches = []; return; }
    box.innerHTML = `<div class="hint">Searching…</div>`;
    try {
      scanMatches = await window.DV_API.searchCards(game(), q);
      box.innerHTML = scanMatches.length
        ? scanMatches.map(c => cardTile(c, { actions: `<button class="btn small" data-pick="${esc(c.key)}">This one</button>` })).join("")
        : `<div class="hint">No match found.</div>`;
    } catch (e) {
      box.innerHTML = `<div class="hint error">Search failed.</div>`;
    }
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = $("#scan-video");
      if (v) v.srcObject = stream;
    } catch (e) {
      const p = $("#scan-preview");
      if (p) p.innerHTML = `<div class="hint error">Camera unavailable: ${esc(e.message)}. You can still add cards via search.</div>`;
    }
  }

  function capturePhoto() {
    const v = $("#scan-video"), c = $("#scan-canvas");
    if (!v || !v.videoWidth) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    $("#scan-preview").innerHTML = `<img src="${c.toDataURL("image/jpeg", 0.7)}" alt="captured card" class="scan-thumb">`;
    $("#scan-match").hidden = false;
    $("#scan-name").focus();
  }

  function closeScan() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $("#modal-root").innerHTML = "";
  }

  /* ---------------- export / import ---------------- */

  function doExport() {
    const blob = new Blob([window.DV_STORE.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deck-vault-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        window.DV_STORE.importJSON(reader.result);
        window.DV_APP.toast("Backup restored");
        render();
        window.DV_APP.refreshNavCounts();
      } catch (e) { window.DV_APP.toast("Import failed: " + e.message, true); }
    };
    reader.readAsText(file);
  }

  /* ---------------- public ---------------- */

  function render() {
    $("#card-search").placeholder = cfg().searchPlaceholder;
    $("#card-search").value = "";
    $("#search-results").innerHTML = "";
    lastResults = [];
    renderCollectionGrid();
  }

  function bind() {
    $("#card-search").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 350);
    });
    $("#btn-scan").onclick = openScan;
    $("#btn-export").onclick = doExport;
    $("#import-file").addEventListener("change", ev => {
      if (ev.target.files[0]) doImport(ev.target.files[0]);
      ev.target.value = "";
    });
    $("#view-collection").addEventListener("click", ev => {
      const add = ev.target.closest("[data-add]");
      const inc = ev.target.closest("[data-inc]");
      const dec = ev.target.closest("[data-dec]");
      const del = ev.target.closest("[data-del]");
      if (add) addCard(add.dataset.add);
      else if (inc) { const g = game(); const e = window.DV_STORE.state.collection[g][inc.dataset.inc]; window.DV_STORE.setCollectionQty(g, inc.dataset.inc, e.qty + 1); renderCollectionGrid(); window.DV_APP.refreshNavCounts(); }
      else if (dec) { const g = game(); const e = window.DV_STORE.state.collection[g][dec.dataset.dec]; window.DV_STORE.setCollectionQty(g, dec.dataset.dec, e.qty - 1); renderCollectionGrid(); window.DV_APP.refreshNavCounts(); }
      else if (del) { if (confirm("Remove this card from your collection?")) { window.DV_STORE.setCollectionQty(game(), del.dataset.del, 0); renderCollectionGrid(); window.DV_APP.refreshNavCounts(); } }
    });
  }

  window.DV_COLLECTION = { render, bind, renderCollectionGrid };
})();
