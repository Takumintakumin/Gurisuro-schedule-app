// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import UserLogin from "./pages/UserLogin.js";
import AdminLogin from "./pages/AdminLogin.js";
import AdminDashboard from "./pages/AdminDashboard.js";
import AdminUsers from "./pages/AdminUsers.js";
import MainApp from "./pages/MainApp.js";

// ログイン済みならOK
const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (!role) return <Navigate to="/" replace />;
  return children;
};

// 管理者のみOK
const AdminOnlyRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (role !== "admin") return <Navigate to="/admin" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 公開 */}
        <Route path="/" element={<UserLogin />} />
        <Route path="/admin" element={<AdminLogin />} />

        {/* 一般ユーザー用アプリ（ログイン必須） */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          }
        />

        {/* 管理者専用 */}
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