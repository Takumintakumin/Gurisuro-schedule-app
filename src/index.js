import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18からcreateRootを使用
import './index.css'; // Tailwind CSSを適用するためのCSSファイルをインポート
import App from './App.js'; // 作成したAppコンポーネントをインポート

// React 18の新しいAPIであるcreateRootを使用して、アプリケーションをレンダリング
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
} else {
  const root = ReactDOM.createRoot(rootElement);
  try {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('App rendered successfully');
  } catch (error) {
    console.error('Error rendering app:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h1>エラーが発生しました</h1>
        <pre>${error.toString()}</pre>
        <p>ブラウザのコンソールを確認してください。</p>
      </div>
    `;
  }
}

// Service Worker の登録（PWA）- 開発中は完全に無効化
// 本番環境のみで有効化（アプリのレンダリングを妨げない）
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
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
