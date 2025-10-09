// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import UserLogin from "./pages/UserLogin.js";
import AdminLogin from "./pages/AdminLogin.js";
import AdminDashboard from "./pages/AdminDashboard.js";
import AdminUsers from "./pages/AdminUsers.js";
import MainApp from "./pages/MainApp.js";

// 一般ユーザー用の保護ルート
const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (!role) return <Navigate to="/" replace />;
  return children;
};

// 管理者専用ルート
const AdminOnlyRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (role !== "admin") return <Navigate to="/admin" replace />;
  return children;
};

// 🚀 App本体（ここが default export！）
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 一般ユーザーログイン */}
        <Route path="/" element={<UserLogin />} />

        {/* 一般ユーザー用ページ */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          }
        />

        {/* 管理者ログイン */}
        <Route path="/admin" element={<AdminLogin />} />

        {/* 管理者ページ群 */}
        <Route
          path="/admin/dashboard"
          element={
            <AdminOnlyRoute>
              <AdminDashboard />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminOnlyRoute>
              <AdminUsers />
            </AdminOnlyRoute>
          }
        />

        {/* その他のルートはログイン画面へ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}