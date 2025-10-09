import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

// ここでは API サーバーは CRA の proxy を使う想定なので相対パスでOK
// package.json の "proxy": "http://localhost:4000" を利用

export default function UserLogin() {
  const nav = useNavigate();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("運転手");
  const [familiarity, setFamiliarity] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setPassword("");
    setRole("運転手");
    setFamiliarity(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password) return alert("名前とパスワードを入力してください。");
    try {
      setLoading(true);
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return alert(`ログインに失敗しました（${res.status}）\n${err?.error ?? ""}`);
      }
      const data = await res.json(); // { message, role }
      // 保存（簡易セッション）
      localStorage.setItem("userRole", data.role || "user");
      localStorage.setItem("userName", name.trim());
      localStorage.setItem("userFamiliarity", familiarity ? "1" : "0");
      // NOTE: userId はサーバーで付与して返す実装にしてもOK（簡易のためランダムにするなら↓）
      localStorage.setItem("userId", Math.random().toString(36).slice(2, 10));
      nav("/app");
    } catch (e2) {
      alert("ネットワークエラーでログインできませんでした。サーバーが起動しているか確認してください。");
      console.error(e2);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password) return alert("名前とパスワードを入力してください。");
    try {
      setLoading(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // サーバーは username/password/role を受け取る
        body: JSON.stringify({ username: name.trim(), password, role: "user" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return alert(`登録に失敗しました（${res.status}）\n${data?.error ?? ""}`);
      }
      alert("登録が完了しました。続けてログインしてください。");
      // 登録後はログインモードへ
      setMode("login");
      setPassword("");
    } catch (e2) {
      alert("ネットワークエラーで登録できませんでした。サーバーが起動しているか確認してください。");
      console.error(e2);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-bold text-center mb-4">
          {isLogin ? "一般ユーザーログイン" : "新規ユーザー登録"}
        </h1>

        <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">お名前</label>
            <input
              className="w-full border rounded p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
            />
          </div>

          {/* ロール/詳しさはローカル表示用。DBに保存するなら /api/register へ含める拡張可 */}
          {isLogin ? (
            <>
              <div>
                <label className="block text-sm mb-1">役割（アプリ内での表示用）</label>
                <select
                  className="w-full border rounded p-2"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option>運転手</option>
                  <option>添乗員</option>
                  <option>両方</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={familiarity}
                  onChange={(e) => setFamiliarity(e.target.checked)}
                />
                幕張に詳しい
              </label>
            </>
          ) : null}

          <div>
            <label className="block text-sm mb-1">パスワード</label>
            <input
              className="w-full border rounded p-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>

          <button
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded p-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "送信中..." : isLogin ? "ログイン" : "登録する"}
          </button>
        </form>

        <div className="text-center mt-4 text-sm">
          {isLogin ? (
            <>
              <button
                className="text-blue-600 hover:underline mr-3"
                onClick={() => {
                  setMode("register");
                  reset();
                }}
              >
                新規登録はこちら
              </button>
              <Link to="/admin" className="text-gray-500 hover:underline">
                管理者ログインはこちら
              </Link>
            </>
          ) : (
            <button
              className="text-gray-600 hover:underline"
              onClick={() => {
                setMode("login");
                reset();
              }}
            >
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}