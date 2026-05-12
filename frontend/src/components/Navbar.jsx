import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isAdmin = user && user.role === "admin";
  const [open, setOpen] = useState(false);

  const cls = (p) => "nav-link" + (loc.pathname === p ? " active" : "");
  const close = () => setOpen(false);

  const userLinks = (
    <>
      <Link to="/markets" className={cls("/markets")} data-testid="nav-markets" onClick={close}>Markets</Link>
      {user && user.role !== "admin" && <>
        <Link to="/trade" className={cls("/trade")} data-testid="nav-trade" onClick={close}>Trade</Link>
        <Link to="/deposit" className={cls("/deposit")} data-testid="nav-deposit" onClick={close}>Deposit</Link>
        <Link to="/withdraw" className={cls("/withdraw")} data-testid="nav-withdraw" onClick={close}>Withdraw</Link>
        <Link to="/history" className={cls("/history")} data-testid="nav-history" onClick={close}>History</Link>
        <Link to="/support" className={cls("/support")} data-testid="nav-support" onClick={close}>Live Support</Link>
      </>}
      {isAdmin && <Link to="/admin" className={cls("/admin")} data-testid="nav-admin" onClick={close}>Admin</Link>}
    </>
  );

  return (
    <header className="nav" data-testid="navbar">
      <div style={{display:"flex", alignItems:"center", gap:32}}>
        <Link to="/" className="brand" data-testid="brand-link" onClick={close}>
          <span className="b1">ADX</span><span className="b2">DUBAI</span>
        </Link>
        <nav className="nav-links hide-mobile">
          {userLinks}
        </nav>
      </div>
      <div style={{display:"flex", gap:10, alignItems:"center"}}>
        {!user ? (
          <>
            <Link to="/login"><button className="btn btn-ghost btn-sm" data-testid="login-btn">Login</button></Link>
            <Link to="/register"><button className="btn btn-primary btn-sm" data-testid="register-btn">Register</button></Link>
          </>
        ) : (
          <>
            <span className="text-dim hide-mobile" data-testid="user-email" style={{fontSize:13}}>{user.email}</span>
            <button className="btn btn-ghost btn-sm hide-mobile" data-testid="logout-btn" onClick={async () => { await logout(); nav("/"); }}>Logout</button>
          </>
        )}
        {/* Hamburger - only on mobile */}
        <button
          className="show-mobile"
          aria-label="Open menu"
          data-testid="mobile-menu-toggle"
          onClick={() => setOpen(o => !o)}
          style={{background:"transparent", border:"1px solid var(--border)", color:"var(--text)", padding:"6px 10px", borderRadius:8, cursor:"pointer", fontSize:18, lineHeight:1}}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="show-mobile mobile-drawer" data-testid="mobile-drawer">
          <div style={{display:"flex", flexDirection:"column", gap:4, padding:"12px 16px"}}>
            {userLinks}
            {user && (
              <>
                <div className="text-dim" style={{fontSize:12, marginTop:10, padding:"6px 0", borderTop:"1px solid var(--border)"}}>{user.email}</div>
                <button className="btn btn-ghost btn-sm" data-testid="mobile-logout-btn" style={{marginTop:6}} onClick={async () => { close(); await logout(); nav("/"); }}>Logout</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
