// src/pages/AdminUsers.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// 500エラー時のHTMLにも耐える軽量fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
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
      const fam = (u.familiar || u.familiarity || "unknown");
      if (famFilter !== "all" && fam !== famFilter) return false;
      if (!needle) return true;
      return String(u.username || "").includes(needle);
    });
  }, [list, q, famFilter]);

  // 件数サマリ
  const counts = useMemo(() => {
    const c = { total: list.length, familiar: 0, unfamiliar: 0, unknown: 0 };
    for (const u of list) {
      const fam = u.familiar || u.familiarity || "unknown";
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

  // 通知を取得
  const [notifications, setNotifications] = useState([]);
  
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/");
      return;
    }
    refresh();
    // 通知を取得
    (async () => {
      try {
        const notifs = await apiFetch("/api?path=notifications");
        if (notifs.ok && Array.isArray(notifs.data)) {
          setNotifications(notifs.data);
        }
      } catch {}
    })();
  }, [nav]);

  // 通知の未読数
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read_at).length;
  }, [notifications]);

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <>
    <div 
      className="min-h-screen p-4 sm:p-6"
      style={{ 
        backgroundColor: '#f0fdf4',
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        marginBottom: 0
      }}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👥 ユーザー管理</h1>
          <div className="flex gap-3">
            <button
              onClick={() => {
                localStorage.clear();
                nav("/");
              }}
              className="text-gray-600 underline"
            >
              ログアウト
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
                    <select
                      className="border rounded p-1 text-xs"
                      value={u.familiar || u.familiarity || "unknown"}
                      onChange={async (e) => {
                        try {
                          const r = await apiFetch("/api/users", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              username: u.username,
                              familiar: e.target.value === "unknown" ? null : e.target.value,
                            }),
                          });
                          if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                          await refresh();
                        } catch (err) {
                          alert(`更新に失敗しました: ${err.message}`);
                        }
                      }}
                    >
                      <option value="unknown">不明</option>
                      <option value="familiar">詳しい</option>
                      <option value="unfamiliar">詳しくない</option>
                    </select>
                    <FamBadge value={u.familiar || u.familiarity || "unknown"} />
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
    
    {/* 固定タブバー */}
    <div 
      id="admin-users-tab-bar"
      style={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        minHeight: '64px',
        backgroundColor: '#ffffff',
        borderTop: '2px solid #d1d5db',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
        WebkitBoxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
        zIndex: 99999,
        display: 'flex',
        WebkitDisplay: 'flex',
        alignItems: 'center',
        WebkitAlignItems: 'center',
        visibility: 'visible',
        opacity: 1,
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <div style={{ 
        maxWidth: '896px', 
        margin: '0 auto', 
        display: 'grid', 
        WebkitDisplay: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)', 
        WebkitGridTemplateColumns: 'repeat(4, 1fr)',
        width: '100%', 
        height: '100%', 
        minHeight: '64px' 
      }}>
        <button
          onClick={() => nav("/admin/dashboard?tab=calendar")}
          style={{
            display: 'flex',
            WebkitDisplay: 'flex',
            flexDirection: 'column',
            WebkitFlexDirection: 'column',
            alignItems: 'center',
            WebkitAlignItems: 'center',
            justifyContent: 'center',
            WebkitJustifyContent: 'center',
            marginBottom: '4px',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            color: '#4b5563',
            fontWeight: '400',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>カレンダー</span>
        </button>
        <button
          onClick={() => nav("/admin/dashboard?tab=apply")}
          style={{
            display: 'flex',
            WebkitDisplay: 'flex',
            flexDirection: 'column',
            WebkitFlexDirection: 'column',
            alignItems: 'center',
            WebkitAlignItems: 'center',
            justifyContent: 'center',
            WebkitJustifyContent: 'center',
            marginBottom: '4px',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            color: '#4b5563',
            fontWeight: '400',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h6v6M9 21h6a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>イベント一覧</span>
        </button>
        <button
          onClick={() => nav("/admin/dashboard?tab=notifications")}
          style={{
            display: 'flex',
            WebkitDisplay: 'flex',
            flexDirection: 'column',
            WebkitFlexDirection: 'column',
            alignItems: 'center',
            WebkitAlignItems: 'center',
            justifyContent: 'center',
            WebkitJustifyContent: 'center',
            marginBottom: '4px',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            color: '#4b5563',
            fontWeight: '400',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s',
            position: 'relative'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>通知</span>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '8px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '10px',
              borderRadius: '10px',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600'
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => nav("/admin/users")}
          style={{
            display: 'flex',
            WebkitDisplay: 'flex',
            flexDirection: 'column',
            WebkitFlexDirection: 'column',
            alignItems: 'center',
            WebkitAlignItems: 'center',
            justifyContent: 'center',
            WebkitJustifyContent: 'center',
            marginBottom: '4px',
            padding: '12px 16px',
            backgroundColor: '#dbeafe',
            color: '#2563eb',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>ユーザー管理</span>
        </button>
      </div>
    </div>
    </>
  );
}