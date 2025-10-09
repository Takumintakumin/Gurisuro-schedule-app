import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// 500 でも HTML を受け止めて安全に JSON へ寄せる fetch ラッパ
async function safeFetch(url, init) {
  const res = await fetch(url, init);
  const txt = await res.text();
  let data = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

export default function UserLogin() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [regOpen, setRegOpen] = useState(false);
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");

  const login = async (e) => {
    e.preventDefault();
    setMsg("送信中…");
    const { ok, data } = await safeFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: pw }),
    });
    if (!ok) {
      setMsg(data?.error || "ログインに失敗しました");
      return;
    }
    localStorage.setItem("userRole", data.role || "user");
    localStorage.setItem("userName", data.username || name);
    setMsg("ログイン成功！");
    nav(data.role === "admin" ? "/admin/dashboard" : "/app");
  };

  const registerUser = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pw.trim()) return setMsg("お名前とパスワードを入力してください");
    if (pw !== pw2) return setMsg("確認用パスワードが一致しません");
    setMsg("登録中…");
    const { ok, status, data } = await safeFetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: pw }),
    });
    if (!ok) {
      // 409: 重複
      if (status === 409) return setMsg("このお名前は既に登録されています。別の名前にしてください。");
      return setMsg(data?.error || "登録に失敗しました");
    }
    setMsg("登録完了！そのままログインしてください。");
    setRegOpen(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-bold text-center mb-4">一般ユーザーログイン</h1>

        <form onSubmit={login} className="space-y-4">
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
          <button className="w-full bg-blue-600 text-white rounded p-2 hover:bg-blue-700">
            ログイン
          </button>
        </form>

        <div className="my-4 text-center">
          <button
            className="text-blue-600 underline text-sm"
            onClick={() => setRegOpen((v) => !v)}
          >
            {regOpen ? "登録フォームを閉じる" : "登録フォームを開く"}
          </button>
        </div>

        {regOpen && (
          <>
            <hr className="my-3" />
            <p className="text-sm text-gray-600 mb-2">
              入力した <strong>お名前</strong> と <strong>パスワード</strong> で登録します。
            </p>
            <form onSubmit={registerUser} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">パスワード（再入力）</label>
                <input
                  className="w-full border rounded p-2"
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="********"
                  autoComplete="new-password"
                />
              </div>
              <button className="w-full bg-green-600 text-white rounded p-2 hover:bg-green-700">
                登録する
              </button>
            </form>
          </>
        )}

        {msg && <p className="mt-4 text-center text-sm text-gray-700">{msg}</p>}

        <div className="text-center mt-6 text-sm">
          <Link to="/admin" className="text-gray-500 hover:underline">
            管理者ログインはこちら
          </Link>
        </div>
      </div>
    </div>
  );
}