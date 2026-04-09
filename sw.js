// ============================================================
// MAPHAR Mobility V12 — Service Worker
// Stratégie : Cache First + Stale-While-Revalidate
// Déployer ce fichier à la RACINE du repo GitHub Pages
// ============================================================

const CACHE_NAME = 'maphar-v12-cache-v1';

// Ressources à mettre en cache dès l'installation
const PRECACHE_URLS = [
  './',
  './index.html'
];

// INSTALL : pré-cache les ressources essentielles
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll en mode individuel pour éviter qu'une erreur bloque tout
        return Promise.allSettled(
          PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
        );
      })
      .then(() => self.skipWaiting())
  );
  console.log('[SW] ✅ Installation — cache initialisé');
});

// ACTIVATE : supprime les anciens caches, prend le contrôle immédiatement
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] 🗑️ Suppression ancien cache :', k);
            return caches.delete(k);
          })
      ))
      .then(() => clients.claim())
  );
  console.log('[SW] ✅ Activation — contrôle de toutes les pages');
});

// FETCH : Cache First → réseau → fallback offline
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET (POST JSONBin, etc.)
  if (event.request.method !== 'GET') return;

  // Ignorer les extensions Chrome et autres protocoles non-http
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {

      // ── CAS 1 : Ressource en cache ──────────────────────────
      if (cachedResponse) {
        // Mettre à jour en arrière-plan (stale-while-revalidate)
        fetch(event.request)
          .then(networkResp => {
            if (networkResp && networkResp.ok) {
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, networkResp.clone()));
            }
          })
          .catch(() => {}); // Silencieux si hors ligne

        return cachedResponse; // Réponse immédiate depuis le cache
      }

      // ── CAS 2 : Pas en cache → aller sur le réseau ──────────
      return fetch(event.request)
        .then(networkResp => {
          if (networkResp && networkResp.ok) {
            // Mettre en cache pour la prochaine fois
            const clone = networkResp.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone));
          }
          return networkResp;
        })
        .catch(() => {
          // ── CAS 3 : Hors ligne ET pas en cache ──────────────
          // Pour les navigations (HTML), retourner la page principale en cache
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./').then(fallback => {
              if (fallback) return fallback;
              return caches.match('./index.html');
            }).then(fallback => {
              if (fallback) return fallback;
              // Dernier recours : page offline basique
              return new Response(
                `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MAPHAR Mobility — Hors ligne</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 60px 20px;
           background: #0d1b2a; color: #e0e0e0; }
    h2 { color: #22863a; font-size: 1.6rem; }
    p { line-height: 1.7; }
    button { background: #22863a; color: white; border: none;
             padding: 12px 28px; border-radius: 8px; cursor: pointer;
             font-size: 1rem; margin-top: 20px; }
    button:hover { background: #1a6b2e; }
  </style>
</head>
<body>
  <h2>📴 MAPHAR Mobility — Mode hors ligne</h2>
  <p>Aucune connexion disponible.<br>
     Vos données locales restent accessibles une fois la page chargée.</p>
  <button onclick="location.reload()">🔄 Réessayer</button>
</body>
</html>`,
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            });
          }
          // Pour les autres ressources (images, etc.), retourner silencieusement
          return new Response('', { status: 408 });
        });
    })
  );
});
