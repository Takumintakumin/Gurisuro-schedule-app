// src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 一般ユーザー一覧を取得
  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      console.error("ユーザー取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  // ユーザー削除
  const handleDelete = async (id) => {
    if (!window.confirm("このユーザーを削除しますか？")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("削除しました");
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } else {
        alert("削除に失敗しました");
      }
    } catch (err) {
      console.error(err);
      alert("通信エラーが発生しました");
    }
  };

  // 管理者権限チェック & データ読み込み
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/admin", { replace: true });
      return;
    }
    fetchUsers();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <div className="flex justify-between mb-4 items-center">
          <h1 className="text-2xl font-bold">👥 ユーザー管理</h1>
          <button
            onClick={() => nav("/admin/dashboard")}
            className="text-blue-600 underline"
          >
            ← イベント管理へ戻る
          </button>
        </div>

        {users.length === 0 ? (
          <p className="text-gray-500">登録ユーザーはいません。</p>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2">ID</th>
                <th className="border p-2">名前</th>
                <th className="border p-2">メール</th>
                <th className="border p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="border p-2">{u.id}</td>
                  <td className="border p-2">{u.name}</td>
                  <td className="border p-2">{u.email}</td>
                  <td className="border p-2 text-center">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
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