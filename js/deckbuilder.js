/* Deck Vault — js/deckbuilder.js
 *
 * The Deck Builder view.
 *
 * Magic Commander flow (the EDHREC integration):
 *   1. Type a commander -> Scryfall autocomplete.
 *   2. Pick one -> EDHREC's unofficial JSON gives high-synergy / top cards.
 *   3. Every suggestion is checked against YOUR collection (matched by
 *      normalized card name) and badged "OWNED ×n" or "MISSING".
 *   4. "Auto-build": owned copies move from collection into the deck,
 *      everything missing goes onto the Buy List with store links.
 *
 * Other formats / games: manual builder — search cards and move copies
 * from the collection into the deck.
 *
 * A copy lives in exactly one place: moving to a deck subtracts from the
 * collection (see store.js), so decked cards no longer show as available.
 */

(function () {
  "use strict";

  const $ = sel => document.querySelector(sel);
  let selectedDeckId = null;
  let edhrec = { commander: "", data: null, loading: false };
  let acTimer = null;

  function game() { return window.DV_STORE.state.activeGame; }
  function cfg() { return window.DV_CONFIG.games[game()]; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  /* Name -> total owned qty across all printings in the collection. */
  function ownedByName() {
    const map = new Map();
    for (const e of Object.values(window.DV_STORE.state.collection[game()])) {
      const k = norm(e.name);
      map.set(k, (map.get(k) || 0) + e.qty);
    }
    return map;
  }

  /* First collection entry whose name matches (for moving copies). */
  function findCollectionEntry(name) {
    const n = norm(name);
    return Object.values(window.DV_STORE.state.collection[game()])
      .find(e => norm(e.name) === n) || null;
  }

  /* ---------------- deck list panel ---------------- */

  function renderDeckList() {
    const decks = window.DV_STORE.state.decks.filter(d => d.game === game());
    const box = $("#deck-list");
    box.innerHTML = decks.length ? decks.map(d => {
      const n = window.DV_STORE.deckCount(d);
      const target = d.format && cfg().deckSizeHint[d.format] ? ` / ${cfg().deckSizeHint[d.format]}` : "";
      return `
        <div class="deck-item ${d.id === selectedDeckId ? "active" : ""}" data-deck="${d.id}">
          <div class="deck-item-name">${esc(d.name)}</div>
          <div class="deck-item-meta">${esc(d.format || "")}${d.commander ? " · " + esc(d.commander) : ""} · ${n}${target}</div>
        </div>`;
    }).join("") : `<div class="hint">No ${esc(cfg().label)} decks yet. Create one to start building.</div>`;
  }

  /* ---------------- deck detail ---------------- */

  function renderDeckDetail() {
    const deck = selectedDeckId ? window.DV_STORE.getDeck(selectedDeckId) : null;
    const box = $("#deck-detail");
    if (!deck) {
      box.innerHTML = `<div class="hint">Select a deck on the left, or create a new one.</div>`;
      return;
    }
    const slots = Object.values(deck.cards).sort((a, b) => a.card.name.localeCompare(b.card.name));
    box.innerHTML = `
      <div class="deck-head">
        <h3>${esc(deck.name)}</h3>
        <div class="muted small">${esc(deck.format || "")}${deck.commander ? " · Commander: " + esc(deck.commander) : ""} · ${window.DV_STORE.deckCount(deck)} cards</div>
        <div class="row">
          <button class="btn small ghost" id="deck-rename">Rename</button>
          <button class="btn small danger ghost" id="deck-delete">Delete deck</button>
        </div>
      </div>
      ${slots.length ? `<div class="deck-cards">` + slots.map(s => `
        <div class="deck-row">
          <span class="deck-row-qty">×${s.qty}</span>
          <span class="deck-row-name">${esc(s.card.name)}</span>
          <span class="muted small">${esc(s.card.set || "")}</span>
          <button class="btn small ghost" data-return="${esc(s.card.key)}">↩ to collection</button>
        </div>`).join("") + `</div>`
        : `<div class="hint">Deck is empty. Use the builder below to add cards.</div>`}
      <div id="builder-area"></div>`;

    $("#deck-rename").onclick = () => {
      const name = prompt("Deck name:", deck.name);
      if (name && name.trim()) { deck.name = name.trim(); window.DV_STORE.save(); render(); }
    };
    $("#deck-delete").onclick = () => {
      if (confirm(`Delete “${deck.name}”? Its cards return to your collection.`)) {
        window.DV_STORE.deleteDeck(deck.id);
        selectedDeckId = null;
        render();
        window.DV_APP.refreshNavCounts();
      }
    };
    box.querySelectorAll("[data-return]").forEach(btn => btn.onclick = () => {
      window.DV_STORE.returnToCollection(deck.id, btn.dataset.return, Infinity);
      render();
      window.DV_APP.refreshNavCounts();
    });
    renderBuilder(deck);
  }

  /* ---------------- builder ---------------- */

  function renderBuilder(deck) {
    const area = $("#builder-area");
    const isCommander = deck.game === "magic" && /commander/i.test(deck.format || "");
    if (isCommander) {
      area.innerHTML = `
        <div class="builder-block">
          <h4>EDHREC suggestions</h4>
          <p class="muted small">Pick a commander — EDHREC ranks the most-played, highest-synergy cards for it. Owned cards move into this deck; missing ones go to your Buy List.</p>
          <div class="row">
            <input id="commander-input" placeholder="Commander name… e.g. Atraxa" value="${esc(edhrec.commander || deck.commander || "")}" autocomplete="off">
            <button class="btn" id="btn-edhrec">Get suggestions</button>
          </div>
          <div id="commander-ac" class="ac-list"></div>
          <div id="edhrec-results"></div>
        </div>`;
      const input = $("#commander-input");
      input.addEventListener("input", () => {
        clearTimeout(acTimer);
        acTimer = setTimeout(async () => {
          const q = input.value.trim();
          const ac = $("#commander-ac");
          if (q.length < 2) { ac.innerHTML = ""; return; }
          try {
            const names = await window.DV_API.commanderAutocomplete(q);
            ac.innerHTML = names.slice(0, 8).map(n =>
              `<div class="ac-item" data-name="${esc(n)}">${esc(n)}</div>`).join("");
          } catch (e) { ac.innerHTML = ""; }
        }, 300);
      });
      $("#commander-ac").addEventListener("click", ev => {
        const it = ev.target.closest("[data-name]");
        if (it) { input.value = it.dataset.name; $("#commander-ac").innerHTML = ""; }
      });
      $("#btn-edhrec").onclick = () => loadEdhrec(deck, input.value.trim());
      if (edhrec.data) paintEdhrec(deck);
      else if (deck.commander) loadEdhrec(deck, deck.commander);
    } else {
      area.innerHTML = `
        <div class="builder-block">
          <h4>Add cards manually</h4>
          <p class="muted small">Search ${esc(cfg().label)} cards — only copies you own can be moved into the deck.</p>
          <div class="row">
            <input id="builder-search" placeholder="${esc(cfg().searchPlaceholder)}">
          </div>
          <div id="builder-results" class="results-grid"></div>
        </div>`;
      const input = $("#builder-search");
      let t = null;
      input.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => builderSearch(deck, input.value.trim()), 350);
      });
    }
  }

  let builderResults = [];
  async function builderSearch(deck, q) {
    const box = $("#builder-results");
    if (q.length < 2) { box.innerHTML = ""; builderResults = []; return; }
    box.innerHTML = `<div class="hint">Searching…</div>`;
    try {
      builderResults = await window.DV_API.searchCards(deck.game, q);
      const owned = ownedByName();
      box.innerHTML = builderResults.length ? builderResults.map(c => {
        const have = ["magic", "pokemon", "yugioh"].includes(deck.game)
          ? (owned.get(norm(c.name)) || 0) : 0;
        return `
          <div class="card-tile">
            <div class="card-img">${c.image ? `<img loading="lazy" src="${esc(c.image)}" alt="${esc(c.name)}">` : ""}</div>
            <div class="card-name">${esc(c.name)}</div>
            <div class="card-meta">${esc(c.set || "")}</div>
            <span class="badge ${have ? "owned" : "missing"}">${have ? `OWNED ×${have}` : "MISSING"}</span>
            <button class="btn small" data-mv="${esc(c.key)}" ${have ? "" : "disabled"}>→ Deck</button>
          </div>`;
      }).join("") : `<div class="hint">No cards found.</div>`;
      box.querySelectorAll("[data-mv]").forEach(btn => btn.onclick = async () => {
        let card = builderResults.find(c => c.key === btn.dataset.mv);
        card = await window.DV_API.enrichCard(card);
        const entry = findCollectionEntry(card.name);
        if (!entry) return;
        const moved = window.DV_STORE.moveToDeck(deck.id, entry, 1);
        if (moved) {
          window.DV_APP.toast(`Moved 1× ${card.name} into ${deck.name}`);
          render();
          window.DV_APP.refreshNavCounts();
        }
      });
    } catch (e) {
      box.innerHTML = `<div class="hint error">Search failed: ${esc(e.message)}</div>`;
    }
  }

  /* ---------------- EDHREC ---------------- */

  async function loadEdhrec(deck, commanderName) {
    if (!commanderName) return;
    edhrec = { commander: commanderName, data: null, loading: true };
    deck.commander = commanderName;
    window.DV_STORE.save();
    paintEdhrec(deck, true);
    const data = await window.DV_API.edhrecCommander(commanderName);
    edhrec = { commander: commanderName, data, loading: false };
    paintEdhrec(deck);
  }

  function suggestionRow(deck, s, owned) {
    const have = owned.get(norm(s.name)) || 0;
    const pct = s.inclusion !== "" && s.inclusion != null ? `${s.inclusion}% in decks` : "";
    const syn = s.synergy !== "" && s.synergy != null ? `synergy ${s.synergy}` : "";
    return `
      <div class="sug-row">
        <span class="sug-name">${esc(s.name)}</span>
        <span class="muted small">${esc([pct, syn].filter(Boolean).join(" · "))}</span>
        <span class="badge ${have ? "owned" : "missing"}">${have ? `OWNED ×${have}` : "MISSING"}</span>
        <button class="btn small" data-sug-deck="${esc(s.name)}" ${have ? "" : "disabled"}>→ Deck</button>
        <button class="btn small ghost" data-sug-buy="${esc(s.name)}" ${have ? "disabled" : ""}>+ Buy</button>
      </div>`;
  }

  function paintEdhrec(deck, loadingOnly) {
    const box = $("#edhrec-results");
    if (!box) return;
    if (loadingOnly || edhrec.loading) {
      box.innerHTML = `<div class="hint">Loading EDHREC recommendations for ${esc(edhrec.commander)}…</div>`;
      return;
    }
    const data = edhrec.data;
    if (!data || !data.ok || !data.categories.length) {
      box.innerHTML = `<div class="hint error">Couldn’t load EDHREC data for “${esc(edhrec.commander)}”. The commander name may not match EDHREC’s page, or EDHREC changed its unofficial JSON format. You can still build manually below.</div>`
        + manualFallback(deck);
      bindSugButtons(deck, box);
      return;
    }
    const owned = ownedByName();
    const totalSug = data.categories.reduce((s, c) => s + c.cards.length, 0);
    const ownedCount = data.categories.reduce((s, c) => s + c.cards.filter(x => owned.get(norm(x.name))).length, 0);
    box.innerHTML = `
      <div class="row edhrec-summary">
        <span><strong>${totalSug}</strong> suggestions · <strong class="owned-text">${ownedCount}</strong> owned · <strong class="missing-text">${totalSug - ownedCount}</strong> missing</span>
        <button class="btn" id="btn-autobuild">⚡ Auto-build deck</button>
      </div>
      ${data.similar && data.similar.length ? `<div class="muted small">Similar commanders: ${data.similar.map(esc).join(", ")}</div>` : ""}
      ${data.categories.map(cat => `
        <details class="sug-cat" ${cat.title.toLowerCase().includes("high synergy") || cat.title.toLowerCase().includes("top") ? "open" : ""}>
          <summary>${esc(cat.title)} <span class="muted">(${cat.cards.length})</span></summary>
          ${cat.cards.map(s => suggestionRow(deck, s, owned)).join("")}
        </details>`).join("")}`;
    bindSugButtons(deck, box);
    const ab = $("#btn-autobuild");
    if (ab) ab.onclick = () => autoBuild(deck, data);
  }

  function manualFallback() {
    return `<div class="builder-block"><h4>Add cards manually</h4>
      <div class="row"><input id="builder-search" placeholder="Search Magic cards…"></div>
      <div id="builder-results" class="results-grid"></div></div>`;
  }

  function bindSugButtons(deck, scope) {
    scope.querySelectorAll("[data-sug-deck]").forEach(btn => btn.onclick = () => {
      const entry = findCollectionEntry(btn.dataset.sugDeck);
      if (!entry) return;
      if (window.DV_STORE.moveToDeck(deck.id, entry, 1)) {
        window.DV_APP.toast(`Moved 1× ${entry.name} into ${deck.name}`);
        render(); window.DV_APP.refreshNavCounts();
      }
    });
    scope.querySelectorAll("[data-sug-buy]").forEach(btn => btn.onclick = () => {
      window.DV_STORE.addToBuylist({ key: "magic:" + norm(btn.dataset.sugBuy), game: "magic", name: btn.dataset.sugBuy }, 1);
      window.DV_APP.toast(`Added ${btn.dataset.sugBuy} to buy list`);
      render(); window.DV_APP.refreshNavCounts();
    });
    const bs = scope.querySelector("#builder-search");
    if (bs) {
      let t = null;
      bs.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => builderSearch(deck, bs.value.trim()), 350); });
    }
  }

  async function autoBuild(deck, data) {
    // Commander decks want ~99 + commander. Take suggestions in category
    // order, 1 copy each; owned copies move into the deck, the rest hit the
    // buy list. Lands are included like any other suggestion.
    const target = (cfg().deckSizeHint[deck.format] || 99) - 1;
    let moved = 0, wanted = 0, skipped = 0;
    const seen = new Set();
    outer:
    for (const cat of data.categories) {
      for (const s of cat.cards) {
        const n = norm(s.name);
        if (seen.has(n)) continue;
        seen.add(n);
        if (moved + wanted >= target) break outer;
        const entry = findCollectionEntry(s.name);
        if (entry && entry.qty > 0) {
          // Move one copy at a time; basic lands would want more, but the
          // user can bump quantities manually afterwards.
          window.DV_STORE.moveToDeck(deck.id, entry, 1);
          moved++;
        } else {
          window.DV_STORE.addToBuylist({ key: "magic:" + n, game: "magic", name: s.name }, 1);
          wanted++;
        }
      }
    }
    window.DV_APP.toast(`Auto-build: ${moved} owned → deck, ${wanted} missing → buy list`);
    render();
    window.DV_APP.refreshNavCounts();
  }

  /* ---------------- new deck modal ---------------- */

  function openNewDeck() {
    const root = $("#modal-root");
    const formats = cfg().formats.map(f => `<option>${esc(f)}</option>`).join("");
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal" role="dialog" aria-label="New deck">
          <h3>New ${esc(cfg().label)} deck</h3>
          <label>Deck name<input id="nd-name" placeholder="My deck"></label>
          <label>Format<select id="nd-format">${formats}</select></label>
          ${cfg().supportsEdhrec ? `<label>Commander (optional)<input id="nd-commander" placeholder="e.g. Atraxa, Praetors' Voice"></label>` : ""}
          <div class="row">
            <button class="btn" id="nd-create">Create deck</button>
            <button class="btn ghost" data-close>Cancel</button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll("[data-close]").forEach(el => el.onclick = () => root.innerHTML = "");
    $("#nd-create").onclick = () => {
      const name = $("#nd-name").value.trim() || "Untitled Deck";
      const format = $("#nd-format").value;
      const commander = cfg().supportsEdhrec ? $("#nd-commander").value.trim() : "";
      const deck = window.DV_STORE.createDeck(game(), name, format, commander);
      selectedDeckId = deck.id;
      edhrec = { commander: "", data: null, loading: false };
      root.innerHTML = "";
      render();
      window.DV_APP.refreshNavCounts();
    };
  }

  /* ---------------- public ---------------- */

  function render() {
    if (selectedDeckId && !window.DV_STORE.getDeck(selectedDeckId)) selectedDeckId = null;
    renderDeckList();
    renderDeckDetail();
  }

  function bind() {
    $("#btn-new-deck").onclick = openNewDeck;
    $("#deck-list").addEventListener("click", ev => {
      const it = ev.target.closest("[data-deck]");
      if (it) {
        selectedDeckId = it.dataset.deck;
        const d = window.DV_STORE.getDeck(selectedDeckId);
        edhrec = { commander: "", data: null, loading: false };
        render();
      }
    });
    // Switching games resets the builder selection.
    window.DV_STORE.onChange(() => {});
  }

  function onGameSwitch() {
    selectedDeckId = null;
    edhrec = { commander: "", data: null, loading: false };
  }

  window.DV_DECKS = { render, bind, onGameSwitch };
})();
