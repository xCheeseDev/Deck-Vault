/* Deck Vault — sw.js
 * Minimal service worker: caches the app shell so the installed PWA
 * opens fast and the UI works offline. Card images and API data are
 * network-first (never cached) so prices and search results stay fresh.
 */
const CACHE = "deck-vault-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/api.js",
  "./js/store.js",
  "./js/collection.js",
  "./js/deckbuilder.js",
  "./js/buylist.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls or card images — always go to network.
  if (/api\.scryfall\.com|api\.tcgdex\.net|db\.ygoprodeck\.com|json\.edhrec\.com|assets\.tcgdex\.net|images\.ygoprodeck\.com|cards\.scryfall\.io/.test(url.host)) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
