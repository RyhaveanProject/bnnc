import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api from "./api";

const AuthCtx = createContext(null);

/**
 * AuthProvider — persists session across page refreshes.
 *
 * Strategy:
 *  1. On mount, if a token exists in localStorage, optimistically mark the
 *     auth state as "checking" (loading=true) and call /auth/me to validate.
 *  2. If /auth/me succeeds → setUser(profile).
 *  3. If /auth/me fails with 401 (invalid/expired token) → clear token & logout.
 *  4. Network errors do NOT cause a logout — the user stays signed-in optimistically
 *     and the call is retried on next mount/navigation.
 *
 * `user` value:
 *   - undefined: not yet checked (only briefly during very first load)
 *   - null:      verified logged-out
 *   - object:    verified logged-in user
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const inflight = useRef(null);

  const refresh = useCallback(async () => {
    // Deduplicate concurrent refreshes
    if (inflight.current) return inflight.current;
    const token = localStorage.getItem("adx_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    const p = (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        return data;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) {
          // Hard logout only when server explicitly rejects token
          localStorage.removeItem("adx_token");
          setUser(null);
        } else {
          // Network/timeout — keep token AND keep prior user state to avoid
          // accidental logout on transient failures. If user is still
          // undefined (first load), leave it undefined so ProtectedRoute
          // keeps showing the loader instead of redirecting to /login.
          setUser((prev) => (prev === undefined ? undefined : prev));
        }
        return null;
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => {
    refresh();
    // Listen for token changes from other tabs
    const onStorage = (e) => {
      if (e.key === "adx_token") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  // Periodic background refresh: keeps user.balances in sync after the admin
  // confirms a deposit in Telegram (no full reload needed). Polls every 15s
  // only when there is a token present.
  useEffect(() => {
    const t = setInterval(() => {
      if (localStorage.getItem("adx_token")) {
        refresh();
      }
    }, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) localStorage.setItem("adx_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const adminLogin = async (email, password) => {
    const { data } = await api.post("/admin/login", { email, password });
    if (data.token) localStorage.setItem("adx_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const register = async (email, password, username) => {
    const { data } = await api.post("/auth/register", { email, password, username });
    if (data && data.token) {
      // Back-compat path (e.g. admin-created accounts that skip verification)
      localStorage.setItem("adx_token", data.token);
      setUser(data.user);
      return { verified: true, user: data.user };
    }
    // New flow: server sent a verification email and is waiting for the code.
    return { verified: false, email, ttl_minutes: data?.ttl_minutes, resend_cooldown_sec: data?.resend_cooldown_sec };
  };
  const registerVerify = async (email, code) => {
    const { data } = await api.post("/auth/register/verify", { email, code });
    if (data.token) localStorage.setItem("adx_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const registerResend = async (email) => {
    const { data } = await api.post("/auth/register/resend", { email });
    return data;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    localStorage.removeItem("adx_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{ user, setUser, loading, login, adminLogin, register, registerVerify, registerResend, logout, refresh }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

export function formatErr(e) {
  if (e?.code === "ERR_NETWORK") return "Network error — please check your connection";
  if (e?.code === "ECONNABORTED") return "Request timed out";
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Error";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return JSON.stringify(d);
}
