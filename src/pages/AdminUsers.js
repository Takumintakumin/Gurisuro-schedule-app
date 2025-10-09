// src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

// 500時のHTMLも安全に受ける軽量ラッパ
async function safeFetch(url, init) {
  const res = await fetch(url, init);
  const txt = await res.text();
  let data = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

export default function AdminUsers() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // 登録フォーム
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const mustBeAdmin = () => {
    const r = localStorage.getItem("userRole");
    if (r !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/admin");
      return false;
    }
    return true;
  };

  const load = async () => {
    setLoading(true);
    const { ok, data } = await safeFetch("/api/users");
    if (!ok) {
      setMsg(data?.error || "ユーザー一覧の取得に失敗しました");
    } else {
      setRows(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("登録中…");
    const { ok, status, data } = await safeFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    if (!ok) {
      if (status === 409) setMsg("このユーザー名は既に登録されています。");
      else setMsg(data?.error || "登録に失敗しました");
      return;
    }
    setMsg("登録しました");
    setUsername("");
    setPassword("");
    setRole("user");
    await load();
  };

  const remove = async (id) => {
    if (!window.confirm("本当に削除しますか？")) return;
    setMsg("削除中…");
    const { ok, data } = await safeFetch(`/api/users?id=${id}`, { method: "DELETE" });
    if (!ok) {
      setMsg(data?.error || "削除に失敗しました");
      return;
    }
    setMsg("削除しました");
    await load();
  };

  useEffect(() => {
    if (mustBeAdmin()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mustBeAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👥 ユーザー管理</h1>
          <div className="flex items-center gap-3">
            <Link className="text-blue-600 underline text-sm" to="/admin/dashboard">
              ← 管理カレンダーへ
            </Link>
            <button
              className="text-gray-500 underline text-sm"
              onClick={() => { localStorage.clear(); nav("/"); }}
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* 登録フォーム */}
        <form onSubmit={submit} className="grid gap-3 bg-gray-50 border rounded p-4 mb-6">
          <h2 className="font-semibold">新規ユーザー登録</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              className="border rounded p-2"
              placeholder="ユーザー名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              className="border rounded p-2"
              placeholder="パスワード"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <select
              className="border rounded p-2"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              追加する
            </button>
          </div>
          {msg && <p className="text-sm text-gray-700">{msg}</p>}
        </form>

        {/* 一覧 */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">登録ユーザー一覧</h2>
          <button
            onClick={load}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            更新
          </button>
        </div>

        {loading ? (
          <div>読み込み中…</div>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-sm">ユーザーがいません。</p>
        ) : (
          <table className="w-full border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">ID</th>
                <th className="border p-2">ユーザー名</th>
                <th className="border p-2">権限</th>
                <th className="border p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="text-center">
                  <td className="border p-2">{u.id}</td>
                  <td className="border p-2">{u.username}</td>
                  <td className="border p-2">{u.role}</td>
                  <td className="border p-2">
                    <button
                      onClick={() => remove(u.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}