// Guarda os arquivos do app no aparelho para funcionar sem internet.
// Ao mudar qualquer arquivo do app, aumente a VERSAO para os aparelhos baixarem a nova.
const VERSAO = 'recibo-rapido-v4';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'recibo.js', 'pdf.js', 'extenso.js', 'assinatura-foto.js',
  'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
