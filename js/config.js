/* Deck Vault — js/config.js
 *
 * Per-game configuration. Each game entry describes:
 *   - label: display name for the game tab
 *   - color: accent color used for that game's tab
 *   - searchPlaceholder: hint text in the card search box
 *   - supportsEdhrec: only Magic has EDHREC commander recommendations
 *   - formats: deck formats offered in the deck builder
 *   - stores: where "buy missing cards" links point, per game
 *   - notes: human-readable summary shown in the UI where relevant
 *
 * To add a 4th game later, add one entry here plus a search adapter
 * in js/api.js — the tabs, collection, decks and buy list all render
 * from this table automatically.
 */
window.DV_CONFIG = {
  games: {
    magic: {
      label: "Magic",
      short: "MTG",
      color: "#c07a3a",
      searchPlaceholder: "Search Magic cards… e.g. Sol Ring",
      supportsEdhrec: true,
      formats: ["Commander / EDH", "Standard", "Modern", "Pioneer", "Pauper", "Casual"],
      deckSizeHint: { "Commander / EDH": 100 },
      stores: [
        { name: "TCGplayer", url: q => `https://www.tcgplayer.com/search/magic/product?productName=${encodeURIComponent(q)}` },
        { name: "Card Kingdom", url: q => `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(q)}` },
        { name: "Cardmarket", url: q => `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(q)}` },
      ],
      notes: "Card data: Scryfall (free, no key). Recommendations: EDHREC (unofficial JSON)."
    },
    pokemon: {
      label: "Pokémon",
      short: "PKM",
      color: "#e3b341",
      searchPlaceholder: "Search Pokémon cards… e.g. Charizard",
      supportsEdhrec: false,
      formats: ["Standard", "Expanded", "Casual"],
      deckSizeHint: { "Standard": 60, "Expanded": 60 },
      stores: [
        { name: "TCGplayer", url: q => `https://www.tcgplayer.com/search/pokemon/product?productName=${encodeURIComponent(q)}` },
        { name: "Troll and Toad", url: q => `https://www.trollandtoad.com/pokemon/${encodeURIComponent(q.replace(/\s+/g, "-"))}/` },
        { name: "Cardmarket", url: q => `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}` },
      ],
      notes: "Card data: TCGdex (free, no key)."
    },
    yugioh: {
      label: "Yu-Gi-Oh!",
      short: "YGO",
      color: "#7a9cc6",
      searchPlaceholder: "Search Yu-Gi-Oh! cards… e.g. Blue-Eyes",
      supportsEdhrec: false,
      formats: ["Advanced", "Traditional", "Casual"],
      deckSizeHint: { "Advanced": 40, "Traditional": 40 },
      stores: [
        { name: "TCGplayer", url: q => `https://www.tcgplayer.com/search/yugioh/product?productName=${encodeURIComponent(q)}` },
        { name: "Troll and Toad", url: q => `https://www.trollandtoad.com/yu-gi-oh/${encodeURIComponent(q.replace(/\s+/g, "-"))}/` },
        { name: "Cardmarket", url: q => `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(q)}` },
      ],
      notes: "Card data: YGOPRODeck (free, no key)."
    }
  },

  // Order the game tabs appear in, left to right, above the header.
  gameOrder: ["pokemon", "magic", "yugioh"],

  // Main navigation views.
  views: [
    { id: "collection", label: "Collection", icon: "▦" },
    { id: "decks", label: "Deck Builder", icon: "◈" },
    { id: "buylist", label: "Buy List", icon: "$" },
  ],

  storageKey: "deckvault-v1",
};
