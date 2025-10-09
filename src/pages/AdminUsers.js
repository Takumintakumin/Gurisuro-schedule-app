// /src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/apiClient.js";

export default function AdminUsers() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const { ok, data } = await apiFetch("/api/users");
    if (!ok) setError("一覧取得に失敗しました");
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const addUser = async (e) => {
    e.preventDefault();
    const { ok, status, data } = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: pw, role }),
    });
    if (!ok) {
      alert(data?.error || `追加に失敗しました (HTTP ${status})`);
      return;
    }
    setName(""); setPw(""); setRole("user");
    await load();
  };

  const delUser = async (id) => {
    if (!window.confirm("このユーザーを削除しますか？")) return;
    const { ok, status, data } = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!ok) {
      alert(data?.error || `削除に失敗しました (HTTP ${status})`);
      return;
    }
    await load();
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/admin");
      return;
    }
    load();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中…</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">👤 ユーザー管理</h1>
          <div className="flex gap-3">
            <button
              className="text-sm text-blue-600 underline"
              onClick={() => nav("/admin/dashboard")}
            >
              ← カレンダーへ
            </button>
            <button
              className="text-sm text-gray-500 underline"
              onClick={() => { localStorage.clear(); nav("/admin"); }}
            >
              ログアウト
            </button>
          </div>
        </div>

        <form onSubmit={addUser} className="mt-4 grid gap-3 sm:grid-cols-4">
          <input
            className="border rounded p-2 sm:col-span-2"
            placeholder="ユーザー名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="パスワード"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <select
            className="border rounded p-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="bg-blue-600 text-white rounded p-2 sm:col-span-4 hover:bg-blue-700">
            追加
          </button>
        </form>

        <h2 className="mt-6 font-semibold">登録ユーザー一覧</h2>
        <table className="w-full mt-2 border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">ユーザー名</th>
              <th className="p-2 border">権限</th>
              <th className="p-2 border">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="text-center">
                <td className="p-2 border">{u.id}</td>
                <td className="p-2 border">{u.username}</td>
                <td className="p-2 border">{u.role}</td>
                <td className="p-2 border">
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                    onClick={() => delUser(u.id)}
                    disabled={u.username === "admin"} // admin誤削除防止
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td className="p-3 text-gray-500" colSpan={4}>ユーザーがいません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}