import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
    if (data.token) localStorage.setItem("adx_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("adx_token");
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, adminLogin, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

export function formatErr(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Error";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map(x => x?.msg || JSON.stringify(x)).join(", ");
  return JSON.stringify(d);
}
