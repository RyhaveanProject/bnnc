import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import LanguageSelector from "./LanguageSelector";
import TotalBalance from "./TotalBalance";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const isAdmin = user && user.role === "admin";
  const [open, setOpen] = useState(false);

  const cls = (p) => "nav-link" + (loc.pathname === p ? " active" : "");
  const close = () => setOpen(false);

  const userLinks = (
    <>
      <Link to="/markets" className={cls("/markets")} data-testid="nav-markets" onClick={close}>{t("nav.markets")}</Link>
      {user && user.role !== "admin" && <>
        <Link to="/trade" className={cls("/trade")} data-testid="nav-trade" onClick={close}>{t("nav.trade")}</Link>
        <Link to="/trading" className={cls("/trading")} data-testid="nav-trading" onClick={close}>Trading</Link>
        <Link to="/deposit" className={cls("/deposit")} data-testid="nav-deposit" onClick={close}>{t("nav.deposit")}</Link>
        <Link to="/withdraw" className={cls("/withdraw")} data-testid="nav-withdraw" onClick={close}>{t("nav.withdraw")}</Link>
        <Link to="/history" className={cls("/history")} data-testid="nav-history" onClick={close}>{t("nav.history")}</Link>
        <Link to="/support" className={cls("/support")} data-testid="nav-support" onClick={close}>{t("nav.support")}</Link>
      </>}
      {isAdmin && <Link to="/admin" className={cls("/admin")} data-testid="nav-admin" onClick={close}>{t("nav.admin")}</Link>}
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
      <div className="nav-right">
        {/* Total Balance - visible on all pages except login/register */}
        {user && loc.pathname !== "/login" && loc.pathname !== "/register" && <TotalBalance />}
        {/* Language selector - always visible top-right */}
        <LanguageSelector />
        {!user ? (
          <>
            <Link to="/login"><button className="btn btn-ghost btn-sm hide-mobile" data-testid="login-btn">{t("nav.login")}</button></Link>
            <Link to="/register"><button className="btn btn-primary btn-sm hide-mobile" data-testid="register-btn">{t("nav.register")}</button></Link>
          </>
        ) : (
          <>
            <span className="text-dim hide-mobile user-email-display" data-testid="user-email">{user.email}</span>
            <button className="btn btn-ghost btn-sm hide-mobile" data-testid="logout-btn" onClick={async () => { await logout(); nav("/"); }}>{t("nav.logout")}</button>
          </>
        )}
        {/* Hamburger Menu Button - only on mobile */}
        <button
          className="hamburger-btn show-mobile"
          aria-label={open ? t("nav.close_menu") : t("nav.open_menu")}
          data-testid="mobile-menu-toggle"
          onClick={() => setOpen(o => !o)}
        >
          <span className="hamburger-icon">
            {open ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="show-mobile mobile-drawer" data-testid="mobile-drawer">
          <div className="mobile-drawer-content">
            {userLinks}
            {!user ? (
              <div className="mobile-auth-buttons">
                <Link to="/login" onClick={close}>
                  <button className="btn btn-ghost btn-sm mobile-btn-full" data-testid="mobile-login-btn">{t("nav.login")}</button>
                </Link>
                <Link to="/register" onClick={close}>
                  <button className="btn btn-primary btn-sm mobile-btn-full" data-testid="mobile-register-btn">{t("nav.register")}</button>
                </Link>
              </div>
            ) : (
              <>
                <div className="mobile-user-info">{user.email}</div>
                <button className="btn btn-ghost btn-sm mobile-btn-full" data-testid="mobile-logout-btn" onClick={async () => { close(); await logout(); nav("/"); }}>{t("nav.logout")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
