// src/pages/AdminLogin.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/apiClient.js";

export default function AdminLogin() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log("[AdminLogin] mounted");
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("送信中…");
    setLoading(true);
    try {
      const { ok, status, data } = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: pw }),
      });

      if (!ok) {
        setMsg(data?.error || `ログイン失敗 (HTTP ${status})`);
        return;
      }

      const role = data.role || "admin";
      localStorage.setItem("userRole", role);
      localStorage.setItem("userName", name);

      setMsg("ログイン成功。ダッシュボードへ移動します");
      nav("/admin/dashboard");
    } catch (err) {
      console.error(err);
      setMsg("通信エラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>管理者ログイン</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div>ユーザー名</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="admin"
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </label>
        <label>
          <div>パスワード</div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="admin123"
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: 0,
            background: loading ? "#94a3b8" : "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "送信中…" : "ログイン"}
        </button>
      </form>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      <p style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        ヒント: Vercel でも /admin が白くならず、このフォームが見えればOK
      </p>
    </div>
  );
}