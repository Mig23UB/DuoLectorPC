// DuoLector Service Worker v2.0
const CACHE_NAME = 'duolector-v2';
const VAPID_PUBLIC_KEY = 'BHlAznUOFa3h_pdtfhqcnHPnEB1LJArGFS9JtXQ-JxeLMnTD2UV6cmfL23O9Pe0jXpNhptmENOXxhughsDlafAg';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=Caveat:wght@400;600&display=swap'
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => cache.add('/index.html'));
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH — Network first, cache fallback ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('ko-fi.com') ||
    url.hostname.includes('storage.ko-fi.com')
  ) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'DuoLector', body: event.data.text() }; }

  const options = {
    body: data.body || 'Tienes un nuevo mensaje 💛',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'DuoLector 💛', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── PUSH SUBSCRIPTION HELPER — exposed via postMessage ──
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VAPID_KEY') {
    event.source?.postMessage({ type: 'VAPID_KEY', key: VAPID_PUBLIC_KEY });
  }
});
