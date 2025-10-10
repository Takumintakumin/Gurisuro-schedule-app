// src/pages/AdminUsers.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// 500エラー時のHTMLにも耐える軽量fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

function FamBadge({ value }) {
  const map = {
    familiar: { label: "詳しい", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    unfamiliar: { label: "詳しくない", cls: "bg-orange-100 text-orange-700 border-orange-200" },
    unknown: { label: "不明", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  };
  const v = map[value] || map.unknown;
  return (
    <span className={`px-2 py-0.5 text-xs border rounded ${v.cls}`}>
      {v.label}
    </span>
  );
}

export default function AdminUsers() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);

  // 表示強化用UI状態
  const [q, setQ] = useState("");                 // 検索
  const [famFilter, setFamFilter] = useState("all"); // familiar/unfamiliar/unknown/all

  // （任意）追加・削除が元々ある想定
  const [newName, setNewName] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newFam, setNewFam] = useState("unknown");

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/");
      return;
    }
    refresh();
  }, [nav]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/users");
      setList(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 絞り込み＆検索
  const filtered = useMemo(() => {
    const needle = q.trim();
    return (list || []).filter((u) => {
      const fam = (u.familiarity || "unknown");
      if (famFilter !== "all" && fam !== famFilter) return false;
      if (!needle) return true;
      return String(u.username || "").includes(needle);
    });
  }, [list, q, famFilter]);

  // 件数サマリ
  const counts = useMemo(() => {
    const c = { total: list.length, familiar: 0, unfamiliar: 0, unknown: 0 };
    for (const u of list) {
      const fam = u.familiarity || "unknown";
      if (fam === "familiar") c.familiar++;
      else if (fam === "unfamiliar") c.unfamiliar++;
      else c.unknown++;
    }
    return c;
  }, [list]);

  // 追加（すでに存在するならそのUIのまま利用）
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName || !newPw) {
      alert("ユーザー名とパスワードを入力してください");
      return;
    }
    try {
      const r = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newName,
          password: newPw,
          role: newRole,
          familiarity: newFam,
        }),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      setNewName(""); setNewPw("");
      setNewRole("user"); setNewFam("unknown");
      await refresh();
    } catch (e) {
      alert(`追加に失敗しました: ${e.message}`);
    }
  };

  // 削除（既存のまま）
  const handleDelete = async (id) => {
    if (!window.confirm("このユーザーを削除しますか？")) return;
    try {
      const r = await apiFetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  };

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👥 ユーザー管理</h1>
          <div className="flex gap-3">
            <button onClick={() => nav("/admin/dashboard")} className="text-gray-600 underline">
              カレンダーへ戻る
            </button>
            <button onClick={() => nav("/")} className="text-gray-600 underline">
              一般ログインへ
            </button>
          </div>
        </div>

        {/* サマリ＆フィルタ */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
            <div className="border rounded p-2">
              合計 <span className="font-semibold">{counts.total}</span>
            </div>
            <div className="border rounded p-2">
              詳しい <span className="font-semibold text-emerald-700">{counts.familiar}</span>
            </div>
            <div className="border rounded p-2">
              詳しくない <span className="font-semibold text-orange-700">{counts.unfamiliar}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="border rounded p-2 text-sm"
              placeholder="名前で検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="border rounded p-2 text-sm"
              value={famFilter}
              onChange={(e) => setFamFilter(e.target.value)}
            >
              <option value="all">すべて</option>
              <option value="familiar">詳しい</option>
              <option value="unfamiliar">詳しくない</option>
              <option value="unknown">不明</option>
            </select>
          </div>
        </div>

        {/* 一覧（モバイル優先カードUI） */}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">該当するユーザーがいません。</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((u) => (
              <li key={u.id} className="border rounded p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.username}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      役割: {u.role || "user"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FamBadge value={u.familiarity || "unknown"} />
                    <button
                      className="px-3 py-1 rounded bg-red-600 text-white text-xs"
                      onClick={() => handleDelete(u.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* （任意）追加フォーム：既存がある場合はそのUIに合わせてOK */}
        <form onSubmit={handleAdd} className="mt-6 bg-gray-50 border rounded p-4">
          <h2 className="font-semibold mb-2 text-sm">新規ユーザー登録</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              className="border rounded p-2 text-sm"
              placeholder="ユーザー名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="border rounded p-2 text-sm"
              type="password"
              placeholder="パスワード"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <select
              className="border rounded p-2 text-sm"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="user">一般</option>
              <option value="admin">管理者</option>
            </select>
            <select
              className="border rounded p-2 text-sm"
              value={newFam}
              onChange={(e) => setNewFam(e.target.value)}
            >
              <option value="unknown">不明</option>
              <option value="familiar">詳しい</option>
              <option value="unfamiliar">詳しくない</option>
            </select>
          </div>
          <div className="mt-3">
            <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm">
              登録する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}