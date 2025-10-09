// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import UserLogin from "./pages/UserLogin.js";
import AdminLogin from "./pages/AdminLogin.js";
import AdminDashboard from "./pages/AdminDashboard.js";
import AdminUsers from "./pages/AdminUsers.js";   // ← ここで一度だけ
import MainApp from "./pages/MainApp.js";

// 共通: ログイン必須
const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (!role) return <Navigate to="/" replace />;
  return children;
};

// 管理者のみ
const AdminOnlyRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (role !== "admin") return <Navigate to="/admin" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 一般ユーザー */}
        <Route path="/" element={<UserLogin />} />
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

        {/* 管理者用画面 */}
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

        {/* フォールバック */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}