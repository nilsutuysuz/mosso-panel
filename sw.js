// App-shell cache so the panel opens without internet (data comes from the IndexedDB cache in cloud.js).
// Network first, so a new deploy is picked up on the next online visit. Supabase API calls are never cached.
const CACHE = 'mosso-shell-v2';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.min.js';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'cloud.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-512.png', SUPABASE_JS];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin && url.href !== SUPABASE_JS) return;
  e.respondWith(fetch(e.request)
    .then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
