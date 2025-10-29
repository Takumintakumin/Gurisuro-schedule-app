// service-worker.js (PWA)
// バージョンを更新するたびに新しいキャッシュが作成される
const CACHE_NAME = 'gurisuro-app-v2';

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 空のキャッシュで開始（プリキャッシュしない）
      console.log('SW: Cache opened:', CACHE_NAME);
      return Promise.resolve();
    })
  );
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // すべてのクライアントにコントロールを要求
      return self.clients.claim();
    })
  );
});

// フェッチ時にネットワーク優先（最新版を取得）、フォールバックでキャッシュ
self.addEventListener('fetch', (event) => {
  // APIリクエストは常にネットワーク優先（キャッシュしない）
  if (event.request.url.includes('/api')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // オフライン時はエラー
        return new Response(JSON.stringify({ error: 'オフラインです' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // HTMLファイルはネットワーク優先、フォールバックでキャッシュ
  if (event.request.destination === 'document' || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        // ネットワークから取得できた場合、キャッシュを更新
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // ネットワークエラー時はキャッシュから取得
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // その他のリソース（JS、CSS、画像など）はネットワーク優先、フォールバックでキャッシュ
  event.respondWith(
    fetch(event.request).then((response) => {
      // ネットワークから取得できた場合、キャッシュを更新
      if (response && response.status === 200) {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      // ネットワークエラー時はキャッシュから取得
      return caches.match(event.request);
    })
  );
});
