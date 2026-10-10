/* Deck Vault — js/store.js
 *
 * The entire app state lives in one object, persisted to localStorage
 * under DV_CONFIG.storageKey ("deckvault-v1"). No backend, no account —
 * the user's collection, decks and buy list stay in their own browser.
 *
 * State shape:
 *   {
 *     activeGame: "magic" | "pokemon" | "yugioh",
 *     collection: { magic: {...}, pokemon: {...}, yugioh: {...} },
 *        // key -> { key, name, set, number, image, imageLarge, price, qty, addedAt, scanPhoto? }
 *     decks: [ { id, game, name, format, commander, cards: { key -> {card, qty} }, createdAt } ],
 *     buylist: { magic: {...}, pokemon: {...}, yugioh: {...} },
 *        // key -> { card, qtyWanted, addedAt }
 *   }
 *
 * Core rule: a physical copy lives in exactly ONE place. moveToDeck()
 * subtracts from the collection; returnToCollection() adds it back.
 * Decks therefore never double-count cards that are still "in collection".
 */

(function () {
  "use strict";

  const KEY = window.DV_CONFIG.storageKey;

  function blank() {
    return {
      version: 1,
      activeGame: "magic",
      collection: { magic: {}, pokemon: {}, yugioh: {} },
      decks: [],
      buylist: { magic: {}, pokemon: {}, yugioh: {} },
    };
  }

  let state = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Shallow-merge over blank() so new fields survive version bumps.
      state = Object.assign(blank(), parsed);
      state.collection = Object.assign(blank().collection, parsed.collection || {});
      state.buylist = Object.assign(blank().buylist, parsed.buylist || {});
      if (!Array.isArray(state.decks)) state.decks = [];
    }
  } catch (e) { /* corrupted storage -> start fresh */ }

  const listeners = new Set();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    listeners.forEach(fn => { try { fn(); } catch (e) {} });
  }
  function onChange(fn) { listeners.add(fn); }

  function snapshot(card) {
    return {
      key: card.key, game: card.game, name: card.name,
      set: card.set || "", number: card.number || "",
      image: card.image || "", imageLarge: card.imageLarge || card.image || "",
      price: card.price || "",
    };
  }

  /* ---------- collection ---------- */

  function addToCollection(card, qty = 1) {
    const bag = state.collection[card.game];
    const entry = bag[card.key];
    if (entry) entry.qty += qty;
    else bag[card.key] = Object.assign(snapshot(card), { qty, addedAt: Date.now() });
    save();
  }

  function setCollectionQty(game, key, qty) {
    const bag = state.collection[game];
    if (!bag[key]) return;
    if (qty <= 0) delete bag[key]; else bag[key].qty = qty;
    save();
  }

  function collectionQty(game, key) {
    const e = state.collection[game][key];
    return e ? e.qty : 0;
  }

  /* ---------- decks ---------- */

  function createDeck(game, name, format, commander = "") {
    const deck = {
      id: "deck-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      game, name: name || "Untitled Deck", format: format || "", commander: commander || "",
      cards: {}, createdAt: Date.now(),
    };
    state.decks.push(deck);
    save();
    return deck;
  }

  function getDeck(id) { return state.decks.find(d => d.id === id) || null; }

  function deleteDeck(id) {
    const deck = getDeck(id);
    if (!deck) return;
    // Return every card to the collection before deleting.
    Object.keys(deck.cards).forEach(key => returnToCollection(id, key, Infinity));
    state.decks = state.decks.filter(d => d.id !== id);
    save();
  }

  function moveToDeck(deckId, card, qty = 1) {
    const deck = getDeck(deckId);
    if (!deck) return 0;
    const bag = state.collection[card.game];
    const have = bag[card.key] ? bag[card.key].qty : 0;
    const n = Math.max(0, Math.min(qty, have));
    if (n === 0) return 0;
    bag[card.key].qty -= n;
    if (bag[card.key].qty <= 0) delete bag[card.key];
    const slot = deck.cards[card.key];
    if (slot) slot.qty += n;
    else deck.cards[card.key] = { card: snapshot(card), qty: n };
    save();
    return n;
  }

  function returnToCollection(deckId, key, qty = Infinity) {
    const deck = getDeck(deckId);
    if (!deck || !deck.cards[key]) return 0;
    const slot = deck.cards[key];
    const n = Math.max(0, Math.min(qty, slot.qty));
    if (n === 0) return 0;
    slot.qty -= n;
    if (slot.qty <= 0) delete deck.cards[key];
    const bag = state.collection[slot.card.game];
    if (bag[key]) bag[key].qty += n;
    else bag[key] = Object.assign({}, slot.card, { qty: n, addedAt: Date.now() });
    save();
    return n;
  }

  function deckCount(deck) {
    return Object.values(deck.cards).reduce((s, slot) => s + slot.qty, 0);
  }

  /* ---------- buy list ---------- */

  function addToBuylist(card, qty = 1) {
    const bag = state.buylist[card.game];
    if (bag[card.key]) bag[card.key].qtyWanted += qty;
    else bag[card.key] = { card: snapshot(card), qtyWanted: qty, addedAt: Date.now() };
    save();
  }

  function removeFromBuylist(game, key) {
    delete state.buylist[game][key];
    save();
  }

  function markBought(game, key) {
    // User bought it -> leaves the buy list, enters the collection.
    const item = state.buylist[game][key];
    if (!item) return;
    removeFromBuylist(game, key);
    addToCollection(item.card, item.qtyWanted);
  }

  /* ---------- import / export ---------- */

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.collection) throw new Error("Not a Deck Vault backup file.");
    state = Object.assign(blank(), parsed);
    state.collection = Object.assign(blank().collection, parsed.collection || {});
    state.buylist = Object.assign(blank().buylist, parsed.buylist || {});
    if (!Array.isArray(state.decks)) state.decks = [];
    save();
  }

  window.DV_STORE = {
    get state() { return state; },
    onChange, save,
    setActiveGame(g) { state.activeGame = g; save(); },
    addToCollection, setCollectionQty, collectionQty,
    createDeck, getDeck, deleteDeck, moveToDeck, returnToCollection, deckCount,
    addToBuylist, removeFromBuylist, markBought,
    exportJSON, importJSON,
  };
})();
