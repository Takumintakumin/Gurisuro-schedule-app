import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18からcreateRootを使用
import './index.css'; // Tailwind CSSを適用するためのCSSファイルをインポート
import App from './App.js'; // 作成したAppコンポーネントをインポート

// React 18の新しいAPIであるcreateRootを使用して、アプリケーションをレンダリング
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker の登録（PWA）- 開発中は無効化、かつ既存SWを削除
if ('serviceWorker' in navigator) {
  // 既存のService Workerを削除（キャッシュクリア）
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
  
  // 本番環境でのみ登録
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration);
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
    });
  }
}
