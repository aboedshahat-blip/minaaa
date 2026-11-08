const CACHE_NAME = 'vib-offline-v3';
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
    const manifestResponse = await fetch('/offline-assets.json', { cache: 'reload' });
    if (!manifestResponse.ok) throw new Error('Could not load offline asset list');
    const assets = await manifestResponse.json();
    if (!Array.isArray(assets) || assets.length === 0) throw new Error('Offline asset list is empty');

    // Keep the number of parallel downloads modest for mobile and slower links.
    for (let start = 0; start < assets.length; start += 6) {
      const batch = assets.slice(start, start + 6);
      const results = await Promise.all(batch.map(async (path) => {
        const url = new URL(path, APP_URL).toString();
        if (new URL(url).origin !== self.location.origin) return false;
        const asset = await fetch(url, { cache: 'reload' });
        if (!asset.ok) return false;
        await cache.put(url, asset);
        return true;
      }));
      if (results.some((cached) => !cached)) throw new Error('A required offline file could not be cached');
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
        const cachedPage = (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match(APP_URL, { ignoreSearch: true }));
        if (cachedPage) return cachedPage;
        return new Response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لا يوجد اتصال</title><body style="font-family:Arial,sans-serif;padding:2rem;color:#101a31"><h2>تعذر فتح التطبيق دون اتصال</h2><p>اتصل بالإنترنت وافتح التطبيق مرة واحدة حتى يكتمل حفظ ملفات التشغيل على هذا الجهاز.</p></body></html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
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
