// src/pages/UserLogin.js（ポイントのみ）
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function UserLogin() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const safeJson = async (res) => {
    const text = await res.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  };

  const login = async (username, password) => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await safeJson(res);
    return { ok: res.ok, data, status: res.status };
  };

  const register = async (username, password) => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role: "user" }),
    });
    const data = await safeJson(res);
    return { ok: res.ok, data, status: res.status };
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("送信中…");
    setLoading(true);
    try {
      // まずログイン試行
      let r = await login(name, pw);
      if (!r.ok) {
        // 404（未登録）のときは自動登録→再ログイン
        if (r.status === 404) {
          const reg = await register(name, pw);
          if (!reg.ok) throw new Error(reg.data?.error || "登録に失敗しました");
          r = await login(name, pw);
        }
      }
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);

      // 保存→一般画面へ
      localStorage.setItem("userRole", r.data.role || "user");
      localStorage.setItem("userName", name);
      setMsg("ログイン成功");
      nav("/app");
    } catch (err) {
      setMsg(`ログイン失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      {/* 名前/パスワード入力UI（省略可） */}
      {/* ... */}
      <button disabled={loading}>{loading ? "送信中…" : "ログイン"}</button>
      {msg && <p>{msg}</p>}
    </form>
  );
}