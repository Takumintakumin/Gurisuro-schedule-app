// src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// 500エラーでHTMLが返っても落ちないfetch
async function safeFetch(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data };
}

export default function AdminUsers() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 管理者チェック & 初回ロード
  useEffect(() => {
    const r = localStorage.getItem("userRole");
    if (r !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/admin");
      return;
    }
    load();
  }, [nav]);

  const load = async () => {
    setLoading(true);
    setErr("");
    const { ok, data } = await safeFetch("/api/users", {});
    if (!ok) {
      setErr(data?.error || "一覧取得に失敗しました");
      setList([]);
    } else {
      setList(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      alert("ユーザー名とパスワードを入力してください");
      return;
    }
    const { ok, status, data } = await safeFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password: password.trim(), role }),
    });
    if (!ok) {
      alert(`作成に失敗（${status}）：${data?.error || ""}`);
      return;
    }
    setUsername(""); setPassword(""); setRole("user");
    load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("削除しますか？")) return;
    const { ok, status, data } = await safeFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!ok) {
      alert(`削除に失敗（${status}）：${data?.error || ""}`);
      return;
    }
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto w-full max-w-4xl bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">👥 ユーザー管理</h1>
          <div className="flex gap-2">
            <Link to="/admin/dashboard" className="px-3 py-2 rounded border hover:bg-gray-50 text-sm">← カレンダー</Link>
            <button
              className="px-3 py-2 rounded border hover:bg-gray-50 text-sm"
              onClick={() => { localStorage.clear(); nav("/admin"); }}
            >ログアウト</button>
          </div>
        </div>

        {/* 新規作成 */}
        <form onSubmit={onCreate} className="border rounded-lg p-4 bg-gray-50 mb-6 grid sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">ユーザー名</label>
            <input className="w-full border rounded p-2" value={username} onChange={(e)=>setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">パスワード</label>
            <input className="w-full border rounded p-2" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">権限</label>
            <select className="w-full border rounded p-2" value={role} onChange={(e)=>setRole(e.target.value)}>
              <option value="user">一般</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <button className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">追加する</button>
          </div>
        </form>

        {/* 一覧 */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">登録ユーザー一覧</h2>
          <button onClick={load} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">更新</button>
        </div>

        {loading ? (
          <div className="text-gray-500">読み込み中…</div>
        ) : err ? (
          <div className="text-red-600">{err}</div>
        ) : list.length === 0 ? (
          <div className="text-gray-500">ユーザーがいません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border w-16">ID</th>
                  <th className="p-2 border">ユーザー名</th>
                  <th className="p-2 border w-28">権限</th>
                  <th className="p-2 border w-28">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(u=>(
                  <tr key={u.id} className="text-center">
                    <td className="p-2 border">{u.id}</td>
                    <td className="p-2 border break-all">{u.username}</td>
                    <td className="p-2 border">{u.role}</td>
                    <td className="p-2 border">
                      <button onClick={()=>onDelete(u.id)} className="px-3 py-1 rounded bg-red-500 hover:bg-red-600 text-white">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}