const CACHE_NAME = 'vib-offline-v2';
const APP_URL = new URL('/', self.location.origin).toString();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_URL, { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache app shell');
    const html = await response.clone().text();
    await cache.put(APP_URL, response);

    const bundledAssets = Array.from(html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g))
      .map((match) => new URL(match[1], APP_URL).toString())
      .filter((url) => new URL(url).origin === self.location.origin);
    await Promise.allSettled(bundledAssets.map(async (url) => {
      const asset = await fetch(url, { cache: 'reload' });
      if (asset.ok) await cache.put(url, asset);
    }));

    // Include lazy-loaded pages, document parsers and the PDF worker in the
    // offline install. They are emitted as separate hashed files by Vite.
    try {
      const manifestResponse = await fetch('/offline-assets.json', { cache: 'reload' });
      if (manifestResponse.ok) {
        const assets = await manifestResponse.json();
        await Promise.allSettled(assets.map(async (path) => {
          const url = new URL(path, APP_URL).toString();
          if (new URL(url).origin !== self.location.origin) return;
          const asset = await fetch(url, { cache: 'reload' });
          if (asset.ok) await cache.put(url, asset);
        }));
      }
    } catch (error) {
      console.warn('Some offline assets could not be cached during install.', error);
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('vib-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(APP_URL)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(?:js|css|mjs|wasm|png|jpe?g|svg|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(url.pathname)) || Response.error();
      }
    })());
  }
});
