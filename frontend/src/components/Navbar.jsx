Now create the main components and pages:
Action: file_editor create /app/frontend/src/components/Navbar.jsx --file-text "import React from \"react\";
import { Link, useLocation, useNavigate } from \"react-router-dom\";
import { useAuth } from \"../lib/auth\";

export default function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isAdmin = user && user.role === \"admin\";

  const cls = (p) => \"nav-link\" + (loc.pathname === p ? \" active\" : \"\");

  return (
    <header className=\"nav\" data-testid=\"navbar\">
      <div style={{display:\"flex\", alignItems:\"center\", gap:32}}>
        <Link to=\"/\" className=\"brand\" data-testid=\"brand-link\">
          <span className=\"b1\">ADX</span><span className=\"b2\">AMERICA</span>
        </Link>
        <nav className=\"nav-links hide-mobile\">
          <Link to=\"/markets\" className={cls(\"/markets\")} data-testid=\"nav-markets\">Markets</Link>
          {user && user.role !== \"admin\" && <>
            <Link to=\"/trade\" className={cls(\"/trade\")} data-testid=\"nav-trade\">Trade</Link>
            <Link to=\"/deposit\" className={cls(\"/deposit\")} data-testid=\"nav-deposit\">Deposit</Link>
            <Link to=\"/withdraw\" className={cls(\"/withdraw\")} data-testid=\"nav-withdraw\">Withdraw</Link>
            <Link to=\"/history\" className={cls(\"/history\")} data-testid=\"nav-history\">History</Link>
            <Link to=\"/support\" className={cls(\"/support\")} data-testid=\"nav-support\">Live Support</Link>
          </>}
          {isAdmin && <Link to=\"/admin\" className={cls(\"/admin\")} data-testid=\"nav-admin\">Admin</Link>}
        </nav>
      </div>
      <div style={{display:\"flex\", gap:10, alignItems:\"center\"}}>
        {!user ? (
          <>
            <Link to=\"/login\"><button className=\"btn btn-ghost btn-sm\" data-testid=\"login-btn\">Login</button></Link>
            <Link to=\"/register\"><button className=\"btn btn-primary btn-sm\" data-testid=\"register-btn\">Register</button></Link>
          </>
        ) : (
          <>
            <span className=\"text-dim hide-mobile\" data-testid=\"user-email\" style={{fontSize:13}}>{user.email}</span>
            <button className=\"btn btn-ghost btn-sm\" data-testid=\"logout-btn\" onClick={async () => { await logout(); nav(\"/\"); }}>Logout</button>
          </>
        )}
      </div>
    </header>
  );
}
"
Observation: Create successful: /app/frontend/src/components/Navbar.jsx
