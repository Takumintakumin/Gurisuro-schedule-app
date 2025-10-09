// src/pages/AdminDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";

const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior", label: "シニア体操", icon: "/icons/senior.png" },
  { key: "eat", label: "食べようの会", icon: "/icons/eat.png" },
  { key: "mamatomo", label: "ママ友の会", icon: "/icons/mamatomo.png" },
  { key: "cafe", label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus", label: "コーラス", icon: "/icons/chorus.png" },
];

export default function AdminDashboard() {
  const nav = useNavigate();

  // タブ
  const [tab, setTab] = useState("calendar"); // calendar | users

  // カレンダー用
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");

  // ユーザー管理用
  const [users, setUsers] = useState([]);
  const [uName, setUName] = useState("");
  const [uPass, setUPass] = useState("");
  const [uRole, setURole] = useState("user");
  const [loading, setLoading] = useState(true);

  // --- 共通 ---
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    // 初期表示はカレンダー＆ユーザー両方ロード
    fetchEvents();
    fetchUsers();
  }, [nav]);

  // --- イベント ---
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      const body = {
        date: selectedDate.toISOString().split("T")[0],
        label: selectedEvent.label,
        icon: selectedEvent.icon,
        start_time: start,
        end_time: end,
      };
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("イベントを登録しました");
      fetchEvents();
    } catch (err) {
      alert("登録エラー: " + err.message);
    }
  };

  // --- ユーザー ---
  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetch users error:", e);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!uName.trim() || !uPass.trim()) {
      alert("ユーザー名とパスワードは必須です");
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uName.trim(), password: uPass, role: uRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUName(""); setUPass(""); setURole("user");
      await fetchUsers();
      alert("ユーザーを追加しました");
    } catch (err) {
      alert("追加エラー: " + err.message);
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("削除してよろしいですか？")) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await fetchUsers();
    } catch (err) {
      alert("削除エラー: " + err.message);
    }
  };

  // --- 表示 ---
  if (loading && tab === "calendar") return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">管理者ダッシュボード</h1>
          <button
            onClick={() => { localStorage.clear(); nav("/"); }}
            className="text-gray-500 underline"
          >
            ログアウト
          </button>
        </div>

        {/* タブ */}
        <div className="flex gap-2 border-b mb-4">
          <button
            className={`px-3 py-2 ${tab === "calendar" ? "border-b-2 border-blue-600 font-semibold" : "text-gray-500"}`}
            onClick={() => setTab("calendar")}
          >
            募集（カレンダー）
          </button>
          <button
            className={`px-3 py-2 ${tab === "users" ? "border-b-2 border-blue-600 font-semibold" : "text-gray-500"}`}
            onClick={() => setTab("users")}
          >
            ユーザー管理
          </button>
        </div>

        {tab === "calendar" && (
          <>
            <Calendar
              currentMonth={selectedDate.getMonth()}
              currentYear={selectedDate.getFullYear()}
              selectedDate={selectedDate}
              onMonthChange={(delta) => {
                const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
                setSelectedDate(d);
              }}
              onDateSelect={setSelectedDate}
              events={events}
            />

            <form onSubmit={handleCreateEvent} className="mt-4 border rounded p-4 bg-gray-50">
              <h2 className="font-semibold mb-2">
                {selectedDate.toISOString().split("T")[0]} の募集を追加
              </h2>

              <div className="mb-3">
                <label className="block text-sm mb-1">イベント種類</label>
                <select
                  className="border rounded p-2 w-full"
                  value={selectedEvent.key}
                  onChange={(e) =>
                    setSelectedEvent(FIXED_EVENTS.find((f) => f.key === e.target.value))
                  }
                >
                  {FIXED_EVENTS.map((e) => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <label className="block text-sm mb-1">開始</label>
                  <input type="time" className="border rounded p-2 w-full"
                         value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm mb-1">終了</label>
                  <input type="time" className="border rounded p-2 w-full"
                         value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>

              <button className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                登録する
              </button>
            </form>

            <div className="mt-6">
              <h3 className="font-semibold mb-2">登録済みイベント</h3>
              {events.length === 0 ? (
                <p className="text-sm text-gray-500">まだありません。</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {events.map((ev) => (
                    <li key={ev.id}>📅 {ev.date}：{ev.label}（{ev.start_time}〜{ev.end_time}）</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "users" && (
          <div className="space-y-6">
            {/* 追加フォーム */}
            <form onSubmit={createUser} className="border rounded p-4 bg-gray-50">
              <h2 className="font-semibold mb-3">新規ユーザー追加</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  className="border rounded p-2"
                  placeholder="ユーザー名"
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                />
                <input
                  className="border rounded p-2"
                  placeholder="パスワード"
                  value={uPass}
                  onChange={(e) => setUPass(e.target.value)}
                />
                <select
                  className="border rounded p-2"
                  value={uRole}
                  onChange={(e) => setURole(e.target.value)}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button className="mt-3 bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                追加
              </button>
            </form>

            {/* 一覧 */}
            <div className="overflow-x-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
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
                          className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td className="p-3 text-gray-500" colSpan={4}>データなし</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}