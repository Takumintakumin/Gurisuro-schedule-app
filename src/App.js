// 例: /src/App.js の一部
import AdminUsers from "./pages/AdminUsers.js";

const AdminOnlyRoute = ({ children }) => {
  const role = localStorage.getItem("userRole");
  if (role !== "admin") return <Navigate to="/admin" replace />;
  return children;
};

// ...
<Route
  path="/admin/users"
  element={
    <AdminOnlyRoute>
      <AdminUsers />
    </AdminOnlyRoute>
  }
/>