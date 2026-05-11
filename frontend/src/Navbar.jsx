 
Action: file_editor create /app/frontend/src/Navbar.jsx --file-text "import React from \"react\";
import { Link, useLocation, useNavigate } from \"react-router-dom\";
import { useAuth } from \"./auth\";

export default function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p || loc.pathname.startsWith(p + \"/\");

  const handleLogout = () => {
    logout();
    nav(\"/\");
  };

  return (
    <header style={{ background: \"var(--bnnc-panel)\", borderBottom: \"1px solid var(--bnnc-border)\" }}>
      <div style={{ display: \"flex\", alignItems: \"center\", padding: \"14px 24px\", gap: 28, maxWidth: 1440, margin: \"0 auto\" }}>
        <Link to=\"/\" style={{ display: \"flex\", alignItems: \"center\", gap: 8 }} data-testid=\"logo-link\">
          <span style={{ fontSize: 24, fontWeight: 800, color: \"var(--bnnc-gold)\" }}>BNNC</span>
          <span style={{ fontSize: 11, color: \"var(--bnnc-text-dim)\", letterSpacing: \".1em\" }}>EXCHANGE</span>
        </Link>
        <nav style={{ display: \"flex\", gap: 4, flex: 1 }}>
          <Link to=\"/markets\" className={`nav-link ${isActive(\"/markets\") ? \"active\" : \"\"}`} data-testid=\"nav-markets\">Markets</Link>
          {user && (
            <>
              <Link to=\"/trade\" className={`nav-link ${isActive(\"/trade\") ? \"active\" : \"\"}`} data-testid=\"nav-trade\">Trade</Link>
              <Link to=\"/wallet\" className={`nav-link ${isActive(\"/wallet\") ? \"active\" : \"\"}`} data-testid=\"nav-wallet\">Wallet</Link>
              <Link to=\"/deposit\" className={`nav-link ${isActive(\"/deposit\") ? \"active\" : \"\"}`} data-testid=\"nav-deposit\">Deposit</Link>
              <Link to=\"/withdraw\" className={`nav-link ${isActive(\"/withdraw\") ? \"active\" : \"\"}`} data-testid=\"nav-withdraw\">Withdraw</Link>
              <Link to=\"/history\" className={`nav-link ${isActive(\"/history\") ? \"active\" : \"\"}`} data-testid=\"nav-history\">History</Link>
              <Link to=\"/support\" className={`nav-link ${isActive(\"/support\") ? \"active\" : \"\"}`} data-testid=\"nav-support\">Live Chat</Link>
            </>
          )}
          {user?.role === \"admin\" && (
            <Link to=\"/admin\" className={`nav-link ${isActive(\"/admin\") ? \"active\" : \"\"}`} data-testid=\"nav-admin\">Admin</Link>
          )}
        </nav>
        <div style={{ display: \"flex\", gap: 10, alignItems: \"center\" }}>
          {!user && (
            <>
              <Link to=\"/login\" data-testid=\"header-login-link\">
                <button className=\"bnnc-btn-ghost bnnc-btn\" style={{ padding: \"8px 16px\" }}>Login</button>
              </Link>
              <Link to=\"/register\" data-testid=\"header-register-link\">
                <button className=\"bnnc-btn\" style={{ padding: \"8px 16px\" }}>Register</button>
              </Link>
            </>
          )}
          {user && (
            <>
              <span style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }} data-testid=\"user-greeting\">{user.username || user.email}</span>
              <button className=\"bnnc-btn-ghost bnnc-btn\" style={{ padding: \"8px 16px\" }} onClick={handleLogout} data-testid=\"logout-btn\">Logout</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
"
Observation: Create successful: /app/frontend/src/Navbar.jsx
