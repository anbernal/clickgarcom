const DRIVER_SHELL_CACHE = 'clickgarcom-driver-shell-v6';
const DRIVER_SHELL_ASSETS = ['/driver.html', '/css/driver.css?v=20260822-driver-location1', '/css/driver-extra.css?v=20260822-driver-location1', '/js/driver.js?v=20260822-driver-location1', '/assets/driver-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(DRIVER_SHELL_CACHE).then((cache) => cache.addAll(DRIVER_SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('clickgarcom-driver-shell-') && key !== DRIVER_SHELL_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // APIs, endereços, filas e qualquer dado operacional nunca entram no cache.
  if (url.pathname.startsWith('/admin/api/') || url.origin !== self.location.origin) return;
  if (!DRIVER_SHELL_ASSETS.some((asset) => url.pathname === new URL(asset, self.location.origin).pathname)) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: false }).then((cached) => cached || fetch(event.request)));
});
