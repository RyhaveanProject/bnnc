
Action: file_editor create /app/frontend/src/App.js --file-text "import React from \"react\";
import \"./App.css\";
import { BrowserRouter, Routes, Route, Navigate } from \"react-router-dom\";
import { AuthProvider, useAuth } from \"./auth\";
import { Landing, Login, Register, AdminLogin } from \"./pages_auth\";
import { Markets, Wallet, Trade, Deposit, Withdraw, History, Support } from \"./pages_user\";
import Admin from \"./Admin\";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 60, textAlign: \"center\" }}><div className=\"spinner\" style={{ margin: \"0 auto\" }} /></div>;
  if (!user) return <Navigate to=\"/login\" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path=\"/\" element={<Landing />} />
          <Route path=\"/login\" element={<Login />} />
          <Route path=\"/register\" element={<Register />} />
          <Route path=\"/admin-login\" element={<AdminLogin />} />
          <Route path=\"/markets\" element={<Markets />} />
          <Route path=\"/trade\" element={<Protected><Trade /></Protected>} />
          <Route path=\"/wallet\" element={<Protected><Wallet /></Protected>} />
          <Route path=\"/deposit\" element={<Protected><Deposit /></Protected>} />
          <Route path=\"/withdraw\" element={<Protected><Withdraw /></Protected>} />
          <Route path=\"/history\" element={<Protected><History /></Protected>} />
          <Route path=\"/support\" element={<Protected><Support /></Protected>} />
          <Route path=\"/admin\" element={<Protected><Admin /></Protected>} />
          <Route path=\"*\" element={<Navigate to=\"/\" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
"
Observation: Overwrite successful: /app/frontend/src/App.js
