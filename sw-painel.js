/* Service worker do PRO Dashboard (escopo: apenas DASHBOARD-PROSERVICE_APP.html) */
var CACHE = 'proservice-painel-v7';
var PAGE = 'DASHBOARD-PROSERVICE_APP.html';
var SHELL = [
  PAGE,
  'manifest-painel.json?v=7',
  'icon-192.png?v=7',
  'icon-512.png?v=7',
  'icon-32.png?v=7',
  'apple-touch-icon.png?v=7'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll falha tudo se um item faltar; adiciona um a um para não travar a instalação
      return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('proservice-painel-') === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Supabase, fontes e CDNs passam direto pela rede (dados sempre atuais)
  if (url.origin !== self.location.origin) return;

  // Página: rede primeiro, cache como reserva (funciona offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(PAGE, copy); });
        return res;
      }).catch(function () {
        return caches.match(PAGE);
      })
    );
    return;
  }

  // Ícones e manifest: cache primeiro
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
