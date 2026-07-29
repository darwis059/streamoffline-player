self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let the browser handle the request normally. 
  // This satisfies the PWA requirement for a fetch handler.
  event.respondWith(fetch(event.request));
});
