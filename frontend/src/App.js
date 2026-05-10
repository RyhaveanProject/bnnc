 Now let's create the frontend files in parallel.
Action: file_editor create /app/frontend/src/App.js --file-text "import React, { useEffect } from \"react\";
import \"@/App.css\";
import { BrowserRouter, Routes, Route, Navigate } from \"react-router-dom\";
import { Toaster } from \"@/components/ui/sonner\";
import { AuthProvider, useAuth } from \"@/context/AuthContext\";
import Landing from \"@/pages/Landing\";
import Login from \"@/pages/Login\";
import Register from \"@/pages/Register\";
import AdminLogin from \"@/pages/AdminLogin\";
import Dashboard from \"@/pages/Dashboard\";
import Markets from \"@/pages/Markets\";
import Deposit from \"@/pages/Deposit\";
import Admin from \"@/pages/Admin\";
import AppLayout from \"@/components/AppLayout\";

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className=\"min-h-screen flex items-center justify-center bg-[#0B0F19] text-slate-400\">Loading…</div>;
  if (!user) return <Navigate to={adminOnly ? \"/admin-login\" : \"/login\"} replace />;
  if (adminOnly && user.role !== \"admin\") return <Navigate to=\"/dashboard\" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path=\"/\" element={<Landing />} />
          <Route path=\"/login\" element={<Login />} />
          <Route path=\"/register\" element={<Register />} />
          <Route path=\"/admin-login\" element={<AdminLogin />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path=\"/dashboard\" element={<Dashboard />} />
            <Route path=\"/markets\" element={<Markets />} />
            <Route path=\"/deposit\" element={<Deposit />} />
          </Route>
          <Route path=\"/admin\" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toaster theme=\"dark\" position=\"top-right\" />
    </AuthProvider>
  );
}

export default App;
"
Observation: Overwrite successful: /app/frontend/src/App.js
