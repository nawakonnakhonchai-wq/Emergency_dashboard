/* This site is no longer an installable app. Browsers that installed the old offline helper
   fetch this file, which clears what it saved and removes itself. Safe to delete this file
   a few weeks after 21 Oct 2026, once everyone has opened the site again. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
