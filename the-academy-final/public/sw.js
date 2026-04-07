const CACHE_NAME = 'academy-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/styles/global.css',
  '/src/data/faculty.js',
  '/src/data/curriculum.js',
  '/src/data/lectures.js',
  '/src/data/glossary.js',
  '/src/data/timeline.js',
  '/src/data/assessments.js',
  '/src/utils/storage.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for API calls, cache-first for assets
  if (event.request.url.includes('api.anthropic.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — AI features require internet' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
  }
});
