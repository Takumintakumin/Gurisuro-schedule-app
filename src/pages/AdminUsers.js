// src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/users");
      const text = await res.text();
      let data = [];
      try { data = text ? JSON.parse(text) : []; } catch {}
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setMsg("ユーザー一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("本当に削除しますか？")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchUsers();
      alert("削除しました");
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました");
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    fetchUsers();
  }, [nav]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👤 ユーザー管理</h1>
          <div className="flex gap-2">
            <button
              onClick={() => nav("/admin/dashboard")}
              className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
            >
              ← カレンダーへ
            </button>
            <button
              onClick={fetchUsers}
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              再読込
            </button>
          </div>
        </div>

        {loading ? (
          <div>読み込み中…</div>
        ) : msg ? (
          <div className="text-red-600">{msg}</div>
        ) : users.length === 0 ? (
          <div className="text-gray-600">ユーザーがいません。</div>
        ) : (
          <div className="overflow-x-auto">
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
                {users.map((u) => (
                  <tr key={u.id} className="text-center">
                    <td className="p-2 border">{u.id}</td>
                    <td className="p-2 border">{u.username}</td>
                    <td className="p-2 border">{u.role}</td>
                    <td className="p-2 border">
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-center mt-6">
          <button
            onClick={() => {
              localStorage.clear();
              nav("/");
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