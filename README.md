# Deck Vault

A website (installable as a mobile app) for TCG storage and deck building across
**Pokémon**, **Magic: The Gathering**, and **Yu-Gi-Oh!**.

- **Scan cards into your collection** — search any card via free card APIs, or use
  your camera to capture a photo of the physical card.
- **Deck builder with EDHREC** — pick a Magic commander and EDHREC ranks the
  highest-synergy cards for it. Every suggestion is checked against *your*
  collection and badged **OWNED** or **MISSING**.
- **One-tap auto-build** — owned copies move from your collection into the deck
  (so they stop showing as available); everything missing lands on the **Buy List**.
- **Buy List** — missing cards aggregated with per-store search links
  (TCGplayer, Card Kingdom / Troll and Toad, Cardmarket) so you can price-shop.
- **Three game tabs** above the header swap the entire app between
  Pokémon / Magic / Yu-Gi-Oh! — collection, decks, and buy list are tracked
  separately per game.

No backend, no account, no API keys. Everything is stored in the browser's
`localStorage` (export/import JSON backup included). Host it on GitHub Pages as-is.

---

## File-by-file guide

| File | What it is | What it does |
|---|---|---|
| `index.html` | App shell | The page skeleton: game tabs above the header, header, main nav (Collection / Deck Builder / Buy List), the three view sections, modal + toast containers, and the `<script>` tags in load order. No logic lives here. |
| `css/styles.css` | All styling | Dark, phone-first theme. The active game's accent color is applied to its tab via `--game-color`. Card grids, deck sidebar, suggestion rows, buy rows, modals, and toasts. |
| `js/config.js` | Game configuration | The single table everything renders from: per-game label, tab color, search placeholder, deck formats, deck-size hints, **store links** (functions that build a store search URL from a card name), and which game supports EDHREC. Adding a 4th game = one entry here + one search adapter in `js/api.js`. |
| `js/api.js` | All network code | Free, keyless APIs only: **Scryfall** (Magic card search + commander autocomplete), **TCGdex** (Pokémon), **YGOPRODeck** (Yu-Gi-Oh!), and **EDHREC's unofficial JSON** (`json.edhrec.com/pages/commanders/<slug>.json`) for commander recommendations. Normalizes every source into one card shape. EDHREC is parsed *defensively* and cached 24h — if EDHREC changes its format, the builder degrades to manual mode instead of crashing. |
| `js/store.js` | Data layer | The whole app state in one object, persisted to `localStorage` under `deckvault-v1`: `collection`, `decks`, `buylist`, `activeGame`. Enforces the core rule — **a physical copy lives in exactly one place**: `moveToDeck()` subtracts from the collection, `returnToCollection()` adds it back, deleting a deck returns all its cards. Also: buy-list add/remove, "bought → moves to collection", and JSON export/import. |
| `js/collection.js` | Collection view | Card search (debounced, per-game API), add-to-collection with quantity steppers, **camera scan modal** (`getUserMedia` → capture → pick the matching search result → photo saved on the entry), and Export/Import backup buttons. |
| `js/deckbuilder.js` | Deck Builder view | Deck list sidebar + deck detail (rename, delete, return cards to collection). **Commander mode** (Magic): commander autocomplete → EDHREC suggestions grouped by category with inclusion % and synergy score, each row badged OWNED ×n / MISSING with "→ Deck" and "+ Buy" buttons, plus **⚡ Auto-build** (fills toward 100 cards: owned → deck, missing → buy list). Other formats/games: manual builder — search cards, move owned copies into the deck. |
| `js/buylist.js` | Buy List view | Aggregates every missing card with wanted quantity, renders per-game store search links from `config.js`, "✓ Bought" moves the card into the collection, "Remove" drops it. |
| `js/app.js` | App shell logic | Builds the game tabs above the header, switches views, nav badges (collection/deck/buy-list counts), toast notifications, registers the service worker. |
| `manifest.json` | PWA manifest | Makes the site installable as a mobile app (Add to Home Screen), standalone display, themed colors. |
| `sw.js` | Service worker | Caches the app shell for fast loads/offline UI. API calls and card images are **never** cached — prices and search stay fresh. |
| `assets/icons/icon.svg` | App icon | Placeholder vault icon (three fanned cards in game colors). Swap for real PNGs if you want full PWA icon coverage. |

---

## How the EDHREC flow works

1. In Deck Builder, create a deck with format **Commander / EDH**.
2. Type a commander name (autocomplete via Scryfall), hit **Get suggestions**.
3. The app fetches `https://json.edhrec.com/pages/commanders/<slug>.json`
   (slug = lowercase, punctuation stripped, spaces → hyphens, e.g.
   `atraxa-praetors-voice`), groups the high-synergy/top cards by category.
4. Each suggestion is matched against your collection **by normalized card name**
   and badged OWNED ×n or MISSING.
5. **⚡ Auto-build**: walks the suggestions in order — owned copies move into the
   deck (leaving your collection), missing ones go to the Buy List with store links.

> EDHREC has no official API; this uses the same JSON its website loads. It's
> unofficial and can change shape — the parser is defensive and the UI falls
> back to manual building if a fetch fails.

## Card scanning

The Scan button opens your camera, captures a photo, and attaches it to the
collection entry after you pick the matching card from search. Fully automatic
card recognition (photo → card name with no typing) needs a dedicated
recognition service — that's stubbed as the natural next step, not faked.

## Running it

No build step. Serve the folder (`npx serve .` / VS Code Live Server / GitHub
Pages) and open `index.html`. For the camera scan to work the page must be
served over HTTPS or `localhost`.

## Roadmap ideas

- True auto-recognition for scans (card-recognition API)
- Price totals on decks / collection value (Scryfall already returns USD prices for Magic)
- Deck import/export in Moxfield/Archidekt text format
- Native mobile wrapper (Capacitor) around this same codebase
