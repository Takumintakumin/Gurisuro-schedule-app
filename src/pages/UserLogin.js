// src/pages/UserLogin.js
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function UserLogin() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // ログイン処理（/api/login）
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pw) {
      setMsg("お名前とパスワードを入力してください。");
      return;
    }
    setMsg("送信中…");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name.trim(), password: pw }),
      });

      // 失敗時にHTMLが返っても安全に扱えるようにまずテキストで受ける
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* HTMLなら空のまま */ }

      if (!res.ok) {
        const reason = data?.error || `HTTP ${res.status}`;
        setMsg(`ログインに失敗しました（${reason}）`);
        return;
      }

      const role = data.role || "user";
      localStorage.setItem("userRole", role);
      localStorage.setItem("userName", name.trim());

      setMsg("ログイン成功。画面へ移動します…");
      // 管理者はダッシュボード、一般はアプリ本体へ
      if (role === "admin") nav("/admin/dashboard");
      else nav("/app");
    } catch (err) {
      console.error(err);
      setMsg("通信エラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  // 参考: 同画面で新規登録もできる簡易フォーム
  const [showRegister, setShowRegister] = useState(false);
  const [regPw, setRegPw] = useState("");
  const [regMsg, setRegMsg] = useState("");

  const onRegister = async (e) => {
    e.preventDefault();
    if (!name.trim() || !regPw) {
      setRegMsg("お名前とパスワードを入力してください。");
      return;
    }
    setRegMsg("登録中…");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name.trim(), password: regPw, role: "user" }),
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) {
        setRegMsg(data?.error || `登録に失敗しました（HTTP ${res.status}）`);
        return;
      }
      setRegMsg("登録が完了しました。続けてログインしてください。");
      setShowRegister(false);
      setPw(regPw); // そのままログインしやすいように
    } catch (err) {
      console.error(err);
      setRegMsg("通信エラーが発生しました。");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-5">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-center text-xl font-bold mb-4">一般ユーザーログイン</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">お名前</label>
            <input
              className="w-full border rounded p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">パスワード</label>
            <input
              className="w-full border rounded p-2"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />
          </div>

          <button
            className="w-full rounded p-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
            disabled={loading}
          >
            {loading ? "送信中…" : "ログイン"}
          </button>

          {msg && <p className="text-sm text-center text-gray-700">{msg}</p>}
        </form>

        {/* 新規登録トグル */}
        <div className="mt-5 text-center">
          <button
            onClick={() => setShowRegister((v) => !v)}
            className="text-sm text-blue-600 underline"
          >
            {showRegister ? "登録フォームを閉じる" : "新規の方はこちらから登録"}
          </button>
        </div>

        {/* 簡易登録フォーム（任意） */}
        {showRegister && (
          <form onSubmit={onRegister} className="mt-3 space-y-3 border-t pt-4">
            <p className="text-sm text-gray-700">
              入力した <span className="font-semibold">お名前</span> と
              <span className="font-semibold"> パスワード</span> で登録します。
            </p>
            <div>
              <label className="block text-sm mb-1">パスワード（再入力）</label>
              <input
                className="w-full border rounded p-2"
                type="password"
                value={regPw}
                onChange={(e) => setRegPw(e.target.value)}
                placeholder="********"
                autoComplete="new-password"
              />
            </div>
            <button className="w-full rounded p-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700">
              登録する
            </button>
            {regMsg && <p className="text-sm text-center text-gray-700">{regMsg}</p>}
          </form>
        )}

        <div className="text-center mt-5 text-sm">
          <Link to="/admin" className="text-gray-500 hover:underline">
            管理者ログインはこちら
          </Link>
        </div>
      </div>
    </div>
  );
}