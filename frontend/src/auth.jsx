
Action: file_editor create /app/frontend/src/auth.jsx --file-text "import React, { createContext, useContext, useEffect, useState } from \"react\";
import client from \"./api\";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const t = localStorage.getItem(\"bnnc_token\");
      if (!t) {
        setUser(null);
        return;
      }
      const { data } = await client.get(\"/auth/me\");
      setUser(data.user);
    } catch {
      setUser(null);
      localStorage.removeItem(\"bnnc_token\");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email, password) => {
    const { data } = await client.post(\"/auth/login\", { email, password });
    localStorage.setItem(\"bnnc_token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const adminLogin = async (email, password) => {
    const { data } = await client.post(\"/auth/admin-login\", { email, password });
    localStorage.setItem(\"bnnc_token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, username, password) => {
    const { data } = await client.post(\"/auth/register\", { email, username, password });
    localStorage.setItem(\"bnnc_token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(\"bnnc_token\");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, adminLogin, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function formatError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || \"Xəta baş verdi\";
  if (typeof d === \"string\") return d;
  if (Array.isArray(d)) return d.map((e) => e.msg || JSON.stringify(e)).join(\" \");
  return JSON.stringify(d);
}
"
Observation: Create successful: /app/frontend/src/
