// /src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("読み込み中…");
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "取得失敗");
      setRows(Array.isArray(data) ? data : []);
      setMsg("");
    } catch (e) {
      setMsg(`取得に失敗: ${e.message}`);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    setMsg("登録中…");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "登録失敗");
      setForm({ username: "", password: "", role: "user" });
      await load();
      setMsg("登録しました");
    } catch (e) {
      setMsg(`登録に失敗: ${e.message}`);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("本当に削除しますか？")) return;
    setMsg("削除中…");
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "削除失敗");
      await load();
      setMsg("削除しました");
    } catch (e) {
      setMsg(`削除に失敗: ${e.message}`);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    load();
  }, [nav]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👤 ユーザー管理</h1>
          <div className="flex gap-3">
            <button
              className="text-blue-600 underline"
              onClick={() => nav("/admin/dashboard")}
            >
              ← カレンダーへ
            </button>
            <button
              className="text-gray-500 underline"
              onClick={() => { localStorage.clear(); nav("/"); }}
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* 追加フォーム */}
        <form onSubmit={addUser} className="border rounded p-4 mb-6 bg-gray-50">
          <h2 className="font-semibold mb-3">新規ユーザー追加</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="border rounded p-2"
              placeholder="ユーザー名"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              className="border rounded p-2"
              type="password"
              placeholder="パスワード"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <select
              className="border rounded p-2"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            登録
          </button>
          {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
        </form>

        {/* 一覧 */}
        <div>
          <h2 className="font-semibold mb-2">登録ユーザー一覧</h2>
          {rows.length === 0 ? (
            <p className="text-gray-500 text-sm">ユーザーがいません。</p>
          ) : (
            <table className="w-full border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">ID</th>
                  <th className="p-2 border">ユーザー名</th>
                  <th className="p-2 border">権限</th>
                  <th className="p-2 border">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="text-center">
                    <td className="p-2 border">{u.id}</td>
                    <td className="p-2 border">{u.username}</td>
                    <td className="p-2 border">{u.role}</td>
                    <td className="p-2 border">
                      <button
                        onClick={() => remove(u.id)}
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3">
            <button
              className="text-blue-600 underline"
              onClick={load}
            >
              再読み込み
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}