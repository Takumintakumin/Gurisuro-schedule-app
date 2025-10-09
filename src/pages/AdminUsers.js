// /src/pages/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/apiClient.js";

export default function AdminUsers() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState("user");
  const [msg, setMsg] = useState("");

  const roleGuard = () => {
    const r = localStorage.getItem("userRole");
    if (r !== "admin") { alert("管理者のみアクセス可能です"); nav("/admin"); return false; }
    return true;
  };

  const load = async () => {
    const { ok, data } = await apiFetch("/api/users");
    if (!ok) return setMsg(data.error || "取得エラー");
    setList(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (roleGuard()) load(); }, []);

  const addUser = async (e) => {
    e.preventDefault();
    setMsg("登録中…");
    const { ok, data } = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: pw, role }),
    });
    if (!ok) return setMsg(data.error || "登録失敗");
    setMsg("登録完了");
    setName(""); setPw(""); setRole("user");
    load();
  };

  const delUser = async (id) => {
    if (!window.confirm("削除しますか？")) return;
    const { ok, data } = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!ok) return alert(data.error || "削除失敗");
    load();
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">👤 ユーザー管理</h1>

      <form onSubmit={addUser} className="grid gap-3 mb-6 p-4 rounded border">
        <div>
          <label className="block text-sm mb-1">ユーザー名</label>
          <input className="border rounded p-2 w-full" value={name} onChange={(e)=>setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">パスワード</label>
          <input className="border rounded p-2 w-full" value={pw} onChange={(e)=>setPw(e.target.value)} type="password" />
        </div>
        <div>
          <label className="block text-sm mb-1">権限</label>
          <select className="border rounded p-2 w-full" value={role} onChange={(e)=>setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button className="bg-blue-600 text-white rounded px-4 py-2">追加</button>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </form>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border p-2">ID</th>
            <th className="border p-2">ユーザー名</th>
            <th className="border p-2">権限</th>
            <th className="border p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map(u => (
            <tr key={u.id}>
              <td className="border p-2 text-center">{u.id}</td>
              <td className="border p-2">{u.username}</td>
              <td className="border p-2 text-center">{u.role}</td>
              <td className="border p-2 text-center">
                <button onClick={()=>delUser(u.id)} className="bg-red-500 text-white rounded px-3 py-1">削除</button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td className="border p-2 text-center" colSpan={4}>データなし</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}