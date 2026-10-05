// Revision and resources are injected from the production build.
const REVISION = '__CW_REVISION__';
const PRECACHE = /* __CW_PRECACHE__ */ [];
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `complexweeper-web:${encodeURIComponent(SCOPE)}:`;
const CACHE = `${CACHE_PREFIX}${REVISION}`;
const RESOURCES = new Map(PRECACHE.map((entry) => [new URL(entry.path, SCOPE).href, entry]));
const SHELL_URL = new URL('index.html', SCOPE).href;

function resourceRequest(url, entry) {
  // Integrity keeps an old page on its own release while an update waits.
  return new Request(url, { cache: 'no-cache', integrity: entry.integrity });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([...RESOURCES].map(([url, entry]) => resourceRequest(url, entry))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  // Normal activation waits for old controlled pages to close; their cache
  // stays available until then. Other registrations own separate prefixes.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
});

async function serve(url, entry) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (entry.immutable && hit) return hit;
  try {
    const response = await fetch(resourceRequest(url, entry));
    if (response.ok) {
      await cache.put(url, response.clone());
      return response;
    }
    return hit || response;
  } catch (error) {
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(SCOPE).origin) return;
  url.search = '';
  const isShell = url.href === SCOPE || url.href === SHELL_URL;
  const resourceUrl = event.request.mode === 'navigate' && isShell ? SHELL_URL : url.href;
  const entry = RESOURCES.get(resourceUrl);
  if (entry) event.respondWith(serve(resourceUrl, entry));
});
