
Action: file_editor create /app/frontend/src/context/AuthContext.jsx --file-text "import React, { createContext, useContext, useEffect, useState } from \"react\";
import axios from \"axios\";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthCtx = createContext(null);

// Configure axios to always send credentials
axios.defaults.withCredentials = true;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const token = localStorage.getItem(\"token\");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/auth/me`, { headers });
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    if (data.token) localStorage.setItem(\"token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, name) => {
    const { data } = await axios.post(`${API}/auth/register`, { email, password, name });
    if (data.token) localStorage.setItem(\"token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const adminLogin = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/admin-login`, { email, password });
    if (data.token) localStorage.setItem(\"token\", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    localStorage.removeItem(\"token\");
    setUser(null);
  };

  // Configure default Authorization header from localStorage so cookies AND bearer both work
  useEffect(() => {
    const interceptor = axios.interceptors.request.use((config) => {
      const token = localStorage.getItem(\"token\");
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return () => axios.interceptors.request.eject(interceptor);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, adminLogin, logout, refresh: fetchMe }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
"
Observation: Create successful: /app/frontend/src/context/AuthContext.jsx
