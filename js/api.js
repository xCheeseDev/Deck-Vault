/* Deck Vault — js/api.js
 *
 * All network access lives here. Every card source used is free and
 * needs no API key:
 *   Magic    -> Scryfall            https://api.scryfall.com
 *   Pokémon  -> TCGdex              https://api.tcgdex.net
 *   Yu-Gi-Oh -> YGOPRODeck         https://db.ygoprodeck.com
 *   Commander recs -> EDHREC JSON   https://json.edhrec.com  (UNOFFICIAL)
 *
 * EDHREC has no official API. The endpoints below are the same JSON the
 * edhrec.com frontend loads, so they can change shape without notice.
 * edhrecCommander() therefore parses defensively and returns [] instead
 * of throwing. Responses are cached in memory for 24h.
 *
 * Normalized card shape returned by searchCards():
 *   { key, game, name, set, number, image, imageLarge, price, raw }
 */

(function () {
  "use strict";

  const cache = new Map(); // url -> { at, ttl, data }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function getJSON(url, { ttl = 0 } = {}) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    if (ttl > 0) cache.set(url, { at: Date.now(), ttl, data });
    return data;
  }

  /* ---------------- Magic: Scryfall ---------------- */

  async function searchMagic(query) {
    // Scryfall asks for ~100ms between requests.
    await sleep(120);
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name`;
    const json = await getJSON(url, { ttl: 5 * 60 * 1000 });
    return (json.data || []).slice(0, 24).map(c => ({
      key: `magic:${c.id}`,
      game: "magic",
      name: c.name,
      set: c.set_name || c.set || "",
      number: c.collector_number || "",
      image: (c.image_uris && (c.image_uris.small || c.image_uris.normal)) || "",
      imageLarge: (c.image_uris && (c.image_uris.large || c.image_uris.normal)) || "",
      price: c.prices && c.prices.usd ? `$${c.prices.usd}` : "",
      raw: c,
    }));
  }

  async function commanderAutocomplete(query) {
    await sleep(120);
    const url = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`;
    const json = await getJSON(url, { ttl: 5 * 60 * 1000 });
    return json.data || [];
  }

  /* ---------------- Pokémon: TCGdex ---------------- */

  async function searchPokemon(query) {
    const url = `https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(query)}`;
    const list = await getJSON(url, { ttl: 5 * 60 * 1000 });
    return (Array.isArray(list) ? list : []).slice(0, 24).map(c => ({
      key: `pokemon:${c.id}`,
      game: "pokemon",
      name: c.name,
      set: c.id ? String(c.id).split("-")[0] : "",
      number: c.localId || "",
      // TCGdex image base + quality suffix is their documented pattern.
      image: c.image ? `${c.image}/low.jpg` : "",
      imageLarge: c.image ? `${c.image}/high.jpg` : "",
      price: "",
      raw: c,
    }));
  }

  async function enrichPokemon(card) {
    // One detail call per card, only when the user adds/views it.
    try {
      const id = card.raw && card.raw.id;
      if (!id) return card;
      const d = await getJSON(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`, { ttl: 60 * 60 * 1000 });
      return Object.assign({}, card, {
        set: (d.set && d.set.name) || card.set,
        price: "",
        extra: { rarity: d.rarity || "", hp: d.hp || "", types: d.types || [] },
      });
    } catch (e) { return card; }
  }

  /* ---------------- Yu-Gi-Oh: YGOPRODeck ---------------- */

  async function searchYugioh(query) {
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`;
    const json = await getJSON(url, { ttl: 5 * 60 * 1000 });
    return ((json && json.data) || []).slice(0, 24).map(c => {
      const img = (c.card_images && c.card_images[0]) || {};
      return {
        key: `yugioh:${c.id}`,
        game: "yugioh",
        name: c.name,
        set: ((c.card_sets && c.card_sets[0] && c.card_sets[0].set_name) || ""),
        number: ((c.card_sets && c.card_sets[0] && c.card_sets[0].set_code) || ""),
        image: img.image_url_small || "",
        imageLarge: img.image_url || "",
        price: (c.card_prices && c.card_prices[0] && c.card_prices[0].tcgplayer_price)
          ? `$${c.card_prices[0].tcgplayer_price}` : "",
        raw: c,
      };
    });
  }

  /* ---------------- EDHREC (unofficial) ---------------- */

  function edhrecSlug(name) {
    return String(name).toLowerCase()
      .replace(/[’‘`]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  }

  // Pull every plausible "list of card entries" out of the EDHREC page JSON.
  function extractCardLists(json) {
    const root = (json && json.container && json.container.json_dict) ? json.container.json_dict : json;
    if (!root || typeof root !== "object") return [];
    const lists = [];
    if (Array.isArray(root.cardlists)) {
      for (const cl of root.cardlists) {
        const views = Array.isArray(cl.cardviews) ? cl.cardviews : [];
        lists.push({
          title: cl.header || cl.tag || "Cards",
          cards: views.map(v => ({
            name: v.name || v.card || "",
            inclusion: v.inclusion || v.inclusion_percent || "",
            synergy: (v.synergy !== undefined ? v.synergy : ""),
          })).filter(c => c.name),
        });
      }
    }
    return lists;
  }

  async function edhrecCommander(commanderName) {
    const slug = edhrecSlug(commanderName);
    const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
    try {
      const json = await getJSON(url, { ttl: 24 * 60 * 60 * 1000 });
      const lists = extractCardLists(json).map(l => ({
        title: l.title,
        cards: l.cards.slice(0, 30),
      })).filter(l => l.cards.length);
      const similar = Array.isArray(json && json.similar) ? json.similar.slice(0, 8) : [];
      return { ok: true, slug, categories: lists, similar };
    } catch (e) {
      // Bad slug, page missing, or shape changed — degrade gracefully.
      return { ok: false, slug, error: String(e && e.message || e), categories: [], similar: [] };
    }
  }

  async function edhrecAverageDeck(commanderName) {
    // Best-effort: precomputed ~99-card average decklist for a commander.
    const slug = edhrecSlug(commanderName);
    const url = `https://json.edhrec.com/pages/average-decks/${slug}.json`;
    try {
      const json = await getJSON(url, { ttl: 24 * 60 * 60 * 1000 });
      const root = (json && json.container && json.container.json_dict) ? json.container.json_dict : json;
      const names = [];
      const hunt = (node) => {
        if (!node || names.length > 120) return;
        if (Array.isArray(node)) { node.forEach(hunt); return; }
        if (typeof node === "object") {
          if (typeof node.name === "string" && node.name && !names.includes(node.name)) {
            // Only accept objects that look like deck entries, not metadata.
            if (node.inclusion !== undefined || node.quantity !== undefined || node.count !== undefined) names.push(node.name);
            else if (names.length === 0) { /* skip metadata-ish */ }
          }
          Object.values(node).forEach(hunt);
        }
      };
      hunt(root && (root.deck || root.list || root.cards || root));
      return { ok: names.length > 0, slug, cards: names.slice(0, 99) };
    } catch (e) {
      return { ok: false, slug, error: String(e && e.message || e), cards: [] };
    }
  }

  /* ---------------- dispatcher ---------------- */

  async function searchCards(game, query) {
    query = String(query || "").trim();
    if (query.length < 2) return [];
    if (game === "magic") return searchMagic(query);
    if (game === "pokemon") return searchPokemon(query);
    if (game === "yugioh") return searchYugioh(query);
    return [];
  }

  async function enrichCard(card) {
    if (!card) return card;
    if (card.game === "pokemon") return enrichPokemon(card);
    return card;
  }

  window.DV_API = {
    searchCards, enrichCard,
    commanderAutocomplete,
    edhrecCommander, edhrecAverageDeck, edhrecSlug,
  };
})();
