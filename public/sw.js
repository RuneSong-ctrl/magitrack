// Offline: halaman = jaringan dulu lalu cache; aset & model = cache dulu.
// API tidak di-cache: data offline sudah ada di IndexedDB.
const CACHE = 'magitrack-v2'
const SHELL = ['/', '/model.json', '/mark.png', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return
  const put = res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match('/')))
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(put)))
  }
})
