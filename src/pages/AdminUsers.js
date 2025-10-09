// src/pages/AdminUsers.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("ユーザー取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!username || !password) {
      alert("名前とパスワードを入力してください");
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error("登録に失敗しました");
      setUsername("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm("このユーザーを削除しますか？")) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    fetchUsers();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto bg-white shadow rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-4">👥 ユーザー管理</h1>

        <form onSubmit={addUser} className="flex gap-3 mb-6">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ユーザー名"
            className="border p-2 rounded flex-1"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="border p-2 rounded flex-1"
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            登録
          </button>
        </form>

        <h2 className="font-semibold mb-2">登録済みユーザー一覧</h2>
        {users.length === 0 ? (
          <p className="text-gray-500 text-sm">まだユーザーがいません。</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {users.map((u) => (
              <li key={u.id} className="flex justify-between py-2">
                <span>{u.username} ({u.role})</span>
                <button
                  onClick={() => deleteUser(u.id)}
                  className="text-red-600 hover:underline"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}