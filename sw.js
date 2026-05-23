// MatchMaker Pro Service Worker
// 오프라인 모드 지원 + 빠른 로딩을 위한 캐시 관리

const CACHE_VERSION = 'matchmaker-pro-v1.0.3';
const CACHE_NAME = `${CACHE_VERSION}-static`;

// 앱 핵심 파일
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 외부 CDN
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
];

// ============================================================
//  설치
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] MatchMaker Pro 캐싱 시작');
        return cache.addAll(STATIC_ASSETS).then(() => {
          return Promise.allSettled(
            CDN_ASSETS.map((url) =>
              fetch(url, { mode: 'no-cors' }).then((res) => cache.put(url, res))
                .catch(() => {})
            )
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
//  활성화 — 오래된 캐시 삭제
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('matchmaker-pro-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 오래된 캐시 삭제:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
//  Fetch 전략
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Firebase — 항상 네트워크
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebasedatabase.app') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // GAS — 항상 네트워크
  if (url.hostname.includes('script.google.com')) {
    return;
  }

  // 정적 자산 — Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 외부 CDN — Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ============================================================
//  메시지
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
