import React, { useState } from \"react\";
import { Link, useLocation, useNavigate } from \"react-router-dom\";
import { useTranslation } from \"react-i18next\";
import { useAuth } from \"../lib/auth\";
import LanguageSelector from \"./LanguageSelector\";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const isAdmin = user && user.role === \"admin\";
  const [open, setOpen] = useState(false);

  const cls = (p) => \"nav-link\" + (loc.pathname === p ? \" active\" : \"\");
  const close = () => setOpen(false);

  const userLinks = (
    <>
      <Link to=\"/markets\" className={cls(\"/markets\")} data-testid=\"nav-markets\" onClick={close}>{t(\"nav.markets\")}</Link>
      {user && user.role !== \"admin\" && <>
        <Link to=\"/trade\" className={cls(\"/trade\")} data-testid=\"nav-trade\" onClick={close}>{t(\"nav.trade\")}</Link>
        <Link to=\"/deposit\" className={cls(\"/deposit\")} data-testid=\"nav-deposit\" onClick={close}>{t(\"nav.deposit\")}</Link>
        <Link to=\"/withdraw\" className={cls(\"/withdraw\")} data-testid=\"nav-withdraw\" onClick={close}>{t(\"nav.withdraw\")}</Link>
        <Link to=\"/history\" className={cls(\"/history\")} data-testid=\"nav-history\" onClick={close}>{t(\"nav.history\")}</Link>
        <Link to=\"/support\" className={cls(\"/support\")} data-testid=\"nav-support\" onClick={close}>{t(\"nav.support\")}</Link>
      </>}
      {isAdmin && <Link to=\"/admin\" className={cls(\"/admin\")} data-testid=\"nav-admin\" onClick={close}>{t(\"nav.admin\")}</Link>}
    </>
  );

  return (
    <header className=\"nav\" data-testid=\"navbar\">
      <div style={{display:\"flex\", alignItems:\"center\", gap:32}}>
        <Link to=\"/\" className=\"brand\" data-testid=\"brand-link\" onClick={close}>
          <span className=\"b1\">ADX</span><span className=\"b2\">DUBAI</span>
        </Link>
        <nav className=\"nav-links hide-mobile\">
          {userLinks}
        </nav>
      </div>
      <div style={{display:\"flex\", gap:10, alignItems:\"center\"}}>
        {/* Language selector - always visible top-right */}
        <LanguageSelector />
        {!user ? (
          <>
            <Link to=\"/login\"><button className=\"btn btn-ghost btn-sm\" data-testid=\"login-btn\">{t(\"nav.login\")}</button></Link>
            <Link to=\"/register\"><button className=\"btn btn-primary btn-sm\" data-testid=\"register-btn\">{t(\"nav.register\")}</button></Link>
          </>
        ) : (
          <>
            <span className=\"text-dim hide-mobile\" data-testid=\"user-email\" style={{fontSize:13}}>{user.email}</span>
            <button className=\"btn btn-ghost btn-sm hide-mobile\" data-testid=\"logout-btn\" onClick={async () => { await logout(); nav(\"/\"); }}>{t(\"nav.logout\")}</button>
          </>
        )}
        {/* Hamburger - only on mobile */}
        <button
          className=\"show-mobile\"
          aria-label={t(\"nav.open_menu\")}
          data-testid=\"mobile-menu-toggle\"
          onClick={() => setOpen(o => !o)}
          style={{background:\"transparent\", border:\"1px solid var(--border)\", color:\"var(--text)\", padding:\"6px 10px\", borderRadius:8, cursor:\"pointer\", fontSize:18, lineHeight:1}}
        >
          {open ? \"✕\" : \"☰\"}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className=\"show-mobile mobile-drawer\" data-testid=\"mobile-drawer\">
          <div style={{display:\"flex\", flexDirection:\"column\", gap:4, padding:\"12px 16px\"}}>
            {userLinks}
            {user && (
              <>
                <div className=\"text-dim\" style={{fontSize:12, marginTop:10, padding:\"6px 0\", borderTop:\"1px solid var(--border)\"}}>{user.email}</div>
                <button className=\"btn btn-ghost btn-sm\" data-testid=\"mobile-logout-btn\" style={{marginTop:6}} onClick={async () => { close(); await logout(); nav(\"/\"); }}>{t(\"nav.logout\")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
"
