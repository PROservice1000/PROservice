// sw.js — Service Worker único do PRO Service (Agendamento + Gerenciamento)
// Faz o "app shell" (HTML, ícones, manifests e as bibliotecas externas) abrir
// mesmo SEM internet. Os DADOS ficam no Supabase e nunca são guardados aqui:
// eles só carregam/salvam com conexão (evita dados velhos sobrescreverem os novos).
//
// Estratégia: rede primeiro (o app sempre atualiza quando há internet) e, se a
// rede falhar ou demorar, usa a cópia guardada. Para as bibliotecas externas
// (Supabase JS e Chart.js) usa a cópia guardada primeiro, pois são versões fixas.

const VERSAO = 'v8';
const CACHE = 'proservice-app-' + VERSAO;
const TEMPO_REDE_MS = 6000; // se a rede passar disso, abre a cópia guardada

const ARQUIVOS_LOCAIS = [
  './app-cliente.html',
  './DASHBOARD-PROSERVICE_APP.html',
  './manifest-cliente.json',
  './manifest-gerenciamento.json',
  './icon-192.png',
  './icon-512.png',
  './icon-32.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './icon-cliente-192.png',
  './icon-cliente-512.png',
  './icon-cliente-32.png',
  './icon-cliente-maskable-512.png',
  './apple-touch-icon-cliente.png'
];

const BIBLIOTECAS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];
const HOSTS_BIBLIOTECAS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Um por um: se algum arquivo falhar, os outros continuam sendo guardados.
    const todos = [...ARQUIVOS_LOCAIS, ...BIBLIOTECAS];
    await Promise.all(todos.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* segue sem esse arquivo */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter((n) => n.startsWith('proservice') && n !== CACHE) // limpa versões antigas
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

function comTempo(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    promessa.then((r) => { clearTimeout(t); resolve(r); },
                  (e) => { clearTimeout(t); reject(e); });
  });
}

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await comTempo(fetch(req), TEMPO_REDE_MS);
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (e) {
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    if (req.mode === 'navigate') {
      // Página desconhecida dentro do app: abre o app do cliente como padrão
      const padrao = await cache.match('./app-cliente.html');
      if (padrao) return padrao;
    }
    return Response.error();
  }
}

async function guardadoPrimeiro(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req, { ignoreVary: true });
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Dados do banco: nunca interceptar (sempre direto na rede)
  if (url.hostname.endsWith('supabase.co')) return;

  if (HOSTS_BIBLIOTECAS.includes(url.hostname)) {
    event.respondWith(guardadoPrimeiro(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(redePrimeiro(req));
  }
  // qualquer outro endereço (WhatsApp etc.) segue normal
});
