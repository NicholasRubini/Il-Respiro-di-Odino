// Service worker: l'app funziona offline (es. in pista senza rete).
// Strategia: stale-while-revalidate. Si serve subito la cache e la si aggiorna in background,
// quindi un nuovo deploy è visibile al caricamento successivo.
const CACHE = 'valhalla-v2';
const SHELL = [
    './',
    'index.html',
    'css/styles.css',
    'js/calc.js',
    'js/app.js',
    'manifest.webmanifest',
    'icons/icon.svg',
    'icons/icon-192.png',
    'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
    if (!isSameOrigin && !isFont) return;

    // Le navigazioni con query string (?d=…&t=…) usano la stessa shell
    const cacheKey = request.mode === 'navigate' ? new Request('./', { credentials: 'same-origin' }) : request;

    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(cacheKey);
            const network = fetch(request)
                .then(response => {
                    if (response && (response.ok || response.type === 'opaque')) {
                        cache.put(cacheKey, response.clone());
                    }
                    return response;
                })
                .catch(() => cached);
            if (cached) {
                event.waitUntil(network);
                return cached;
            }
            return network;
        })
    );
});
