// src/pages/AdminLogin.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ✅ JSONでもHTMLでも落ちない安全fetch
async function apiFetchSafe(url, options = {}) {
  const res = await fetch(url, options);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }
  // 500のHTMLなど非JSONも安全に
  let text = "";
  try { text = await res.text(); } catch {}
  return { ok: res.ok, status: res.status, data: { error: text?.slice(0, 200) || "非JSONレスポンス" } };
}

export default function AdminLogin() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    console.log("[AdminLogin] mounted");
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("送信中…");
    try {
      const { ok, status, data } = await apiFetchSafe("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: pw }),
      });

      if (!ok) {
        setMsg(data?.error || `ユーザーが見つかりません（${status}）`);
        return;
      }

      localStorage.setItem("userRole", data.role || "admin");
      localStorage.setItem("userName", data.username || name);
      setMsg("ログイン成功。ダッシュボードへ移動します");
      nav("/admin/dashboard");
    } catch (err) {
      console.error(err);
      setMsg("通信エラー");
    }
  };

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 420,
        margin: "40px auto",
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        管理者ログイン
      </h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div>ユーザー名</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="admin"
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              backgroundColor: "#fff9c4",
            }}
          />
        </label>
        <label>
          <div>パスワード</div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="admin123"
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: 0,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ログイン
        </button>
      </form>

      {msg && (
        <p style={{ marginTop: 12, color: msg.includes("成功") ? "green" : "red" }}>{msg}</p>
      )}

      {/* ✅ 一般ユーザーログインへのリンク */}
      <p style={{ marginTop: 20, fontSize: 14 }}>
        一般ユーザーログインは{" "}
        <span
          onClick={() => nav("/")}
          style={{
            color: "#2563eb",
            textDecoration: "underline",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          こちら
        </span>
      </p>

      <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        ヒント: Vercel でも /admin が白くならず、このフォームが見えればOK
      </p>
    </div>
  );
}