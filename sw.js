const CACHE_NAME='studybuddy-cache-v1';
const ASSETS=['/','/index.html','/app.js','/sw.js'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(resp=> resp || fetch(e.request)));
});
