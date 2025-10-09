import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const isAdmin = () => localStorage.getItem("userRole") === "admin";

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "NG");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg("一覧取得に失敗しました");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    setMsg("送信中…");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "登録に失敗しました");
      setForm({ username: "", password: "", role: "user" });
      setMsg("登録しました");
      await load();
    } catch (e) {
      setMsg(e.message);
      console.error(e);
    }
  };

  const delUser = async (id) => {
    if (!window.confirm("本当に削除しますか？")) return;
    setMsg("削除中…");
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "削除に失敗しました");
      setMsg("削除しました");
      await load();
    } catch (e) {
      setMsg(e.message);
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isAdmin()) {
      alert("管理者のみアクセス可能です");
      nav("/admin");
      return;
    }
    load();
  }, [nav]);

  if (loading) return <div className="p-4">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg sm:text-2xl font-bold">👤 ユーザー管理</h1>
          <button
            className="text-sm text-gray-500 underline"
            onClick={() => nav("/admin/dashboard")}
          >
            ← カレンダーへ
          </button>
        </div>

        {/* 追加フォーム */}
        <form onSubmit={addUser} className="grid gap-3 sm:grid-cols-4 mb-6">
          <input
            className="border rounded p-2 sm:col-span-1"
            placeholder="ユーザー名"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
          />
          <input
            className="border rounded p-2 sm:col-span-1"
            placeholder="パスワード"
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
          <select
            className="border rounded p-2 sm:col-span-1"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="bg-blue-600 text-white rounded p-2 sm:col-span-1">
            追加
          </button>
        </form>

        {msg && <p className="text-sm text-gray-600 mb-3">{msg}</p>}

        {/* 一覧 */}
        <div className="overflow-x-auto">
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
              {list.map((u) => (
                <tr key={u.id} className="text-center">
                  <td className="border p-2">{u.id}</td>
                  <td className="border p-2">{u.username}</td>
                  <td className="border p-2">{u.role}</td>
                  <td className="border p-2">
                    <button
                      className="bg-red-500 text-white rounded px-3 py-1"
                      onClick={() => delUser(u.id)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td className="border p-2 text-center" colSpan={4}>
                    ユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => {
              localStorage.clear();
              nav("/admin");
            }}
            className="text-gray-500 underline"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}