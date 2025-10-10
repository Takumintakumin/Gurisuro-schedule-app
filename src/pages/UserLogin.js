// src/pages/UserLogin.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * シンプルな API 呼び出しユーティリティ（500時のHTMLにも耐える）
 */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    // 非JSON（エラーページなど）の場合は無視
  }
  return { ok: res.ok, status: res.status, data, text };
}

export default function UserLogin() {
  const nav = useNavigate();

  // ログイン用
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [loginMsg, setLoginMsg] = useState("");
  const [logLoading, setLogLoading] = useState(false);

  // 登録用
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regPw2, setRegPw2] = useState("");
  const [regMsg, setRegMsg] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // ---- ログイン ----
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginMsg("");
    const username = name.trim();
    if (!username || !pw) {
      setLoginMsg("お名前とパスワードを入力してください。");
      return;
    }
    setLogLoading(true);
    try {
      const { ok, data, status } = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw }),
      });

      if (!ok) {
        setLoginMsg(data?.error || `ログインに失敗しました（${status}）`);
        return;
      }

      // ログイン成功
      localStorage.setItem("userRole", data.role || "user");
      localStorage.setItem("userName", username);
      setLoginMsg("ログイン成功！");
      nav(data.role === "admin" ? "/admin/dashboard" : "/app");
    } catch (err) {
      console.error(err);
      setLoginMsg("通信エラーが発生しました。ネットワークを確認してください。");
    } finally {
      setLogLoading(false);
    }
  };

  // ---- 新規登録 ----
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegMsg("");
    const username = regName.trim();

    // クライアント側バリデーション
    if (!username || !regPw || !regPw2) {
      setRegMsg("お名前・パスワードをすべて入力してください。");
      return;
    }
    if (username.length < 2) {
      setRegMsg("お名前は2文字以上で入力してください。");
      return;
    }
    if (regPw.length < 4) {
      setRegMsg("パスワードは4文字以上で入力してください。");
      return;
    }
    if (regPw !== regPw2) {
      setRegMsg("パスワードが一致しません。");
      return;
    }

    setRegLoading(true);
    try {
      const { ok, data, status } = await apiFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: regPw, role: "user" }),
      });

      if (!ok) {
        setRegMsg(data?.error || `登録に失敗しました（${status}）`);
        return;
      }

      // 登録成功 → そのままログイン処理
      setRegMsg("登録が完了しました。ログインしています…");
      const login = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: regPw }),
      });

      if (!login.ok) {
        setRegMsg("登録は成功しましたが、ログインに失敗しました。ログイン欄からお試しください。");
        return;
      }

      localStorage.setItem("userRole", login.data.role || "user");
      localStorage.setItem("userName", username);
      nav("/app");
    } catch (err) {
      console.error(err);
      setRegMsg("通信エラーが発生しました。");
    } finally {
      setRegLoading(false);
    }
  };

  // 共通スタイル（依存を増やさないためinlineで）
  const card = {
    width: "100%",
    maxWidth: 420,
    margin: "40px auto",
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 6px 24px rgba(0,0,0,.06)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
  };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
  };
  const btn = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };
  const divider = {
    height: 1,
    background: "#e5e7eb",
    margin: "18px 0",
  };
  const small = { fontSize: 12, color: "#6b7280" };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16 }}>
      <div style={card}>
        <h1 style={{ textAlign: "center", fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          一般ユーザーログイン
        </h1>

        {/* ログイン */}
        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <label>
            <div style={{ marginBottom: 6, fontSize: 14 }}>お名前</div>
            <input
              style={input}
              placeholder="山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label>
            <div style={{ marginBottom: 6, fontSize: 14 }}>パスワード</div>
            <input
              style={input}
              type="password"
              placeholder="********"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button type="submit" style={btn} disabled={logLoading}>
            {logLoading ? "ログイン中…" : "ログイン"}
          </button>

          {loginMsg && (
            <div style={{ color: loginMsg.includes("成功") ? "green" : "#dc2626", fontSize: 14 }}>
              {loginMsg}
            </div>
          )}
        </form>

        {/* 登録フォームのトグル */}
        <div style={{ ...divider, marginTop: 16 }} />
        <button
          type="button"
          onClick={() => {
            setShowRegister((v) => !v);
            setLoginMsg("");
            setRegMsg("");
          }}
          style={{
            ...btn,
            background: "transparent",
            color: "#2563eb",
            border: "1px solid #bfdbfe",
          }}
        >
          {showRegister ? "登録フォームを閉じる" : "新規ユーザー登録を開く"}
        </button>

        {/* 新規登録 */}
        {showRegister && (
          <form onSubmit={handleRegister} style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <p style={small}>入力した お名前 と パスワード で登録します。</p>

            <label>
              <div style={{ marginBottom: 6, fontSize: 14 }}>お名前（2文字以上）</div>
              <input
                style={input}
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="例：佐藤 花子"
                autoComplete="off"
              />
            </label>

            <label>
              <div style={{ marginBottom: 6, fontSize: 14 }}>パスワード（4文字以上）</div>
              <input
                style={input}
                type="password"
                value={regPw}
                onChange={(e) => setRegPw(e.target.value)}
                placeholder="********"
                autoComplete="new-password"
              />
            </label>

            <label>
              <div style={{ marginBottom: 6, fontSize: 14 }}>パスワード（再入力）</div>
              <input
                style={input}
                type="password"
                value={regPw2}
                onChange={(e) => setRegPw2(e.target.value)}
                placeholder="********"
                autoComplete="new-password"
              />
            </label>

            <button type="submit" style={{ ...btn, background: "#2f855a" }} disabled={regLoading}>
              {regLoading ? "登録中…" : "登録する"}
            </button>

            {regMsg && (
              <div style={{ color: regMsg.includes("完了") ? "green" : "#dc2626", fontSize: 14 }}>
                {regMsg}
              </div>
            )}
          </form>
        )}

        {/* 管理者リンク */}
        <div style={{ ...divider, marginTop: 18 }} />
        <p style={{ textAlign: "center", ...small }}>
          <span
            onClick={() => nav("/admin")}
            style={{ color: "#2563eb", textDecoration: "underline", cursor: "pointer" }}
          >
            管理者ログインはこちら
          </span>
        </p>
      </div>
    </div>
  );
}