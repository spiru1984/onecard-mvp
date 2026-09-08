const CACHE = 'onecard-v9';
const ASSETS = ['./', './index.html', './style.css', './onecard-app.webp', './nearby.js', './app.js', './import.js', './account.js', './config.js', './supabase-2.115.0.js', './manifest.webmanifest', './zxing-browser-0.1.5.min.js', './bwip-js-4.7.0.min.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
 for (const key of await caches.keys()) if (key.startsWith('onecard-') && key !== CACHE) await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE), hit = await cache.match(event.request);
  if (hit) return hit;
  try { return await fetch(event.request); }
  catch (error) { if (event.request.mode === 'navigate') return cache.match('./index.html'); throw error; }
 })());
});
