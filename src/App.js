import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import UserLogin from "./pages/UserLogin.js";
import AdminLogin from "./pages/AdminLogin.js";
import MainApp from "./pages/MainApp.js";
import AdminDashboard from "./pages/AdminDashboard.js";

// ログイン必須ルート
const ProtectedRoute = ({ children, roleRequired }) => {
  const role = localStorage.getItem("userRole");
  if (!role) return <Navigate to="/" replace />;
  if (roleRequired && role !== roleRequired) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserLogin />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route
  path="/admin/dashboard"
  element={
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  }
/>
        <Route
          path="/app"
          element={
            <ProtectedRoute roleRequired="user">
              <MainApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roleRequired="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}