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
