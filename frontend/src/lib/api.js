import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BASE}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 30000,
});

// Attach Bearer token from localStorage on every request
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("adx_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Globally handle 401 → clear token but don't force redirect from here
// (let AuthProvider/ProtectedRoute decide). Only clears when the server says
// the token is invalid/expired, not on transient network errors.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 401 && (detail === "Token expired" || detail === "Invalid token")) {
      localStorage.removeItem("adx_token");
    }
    return Promise.reject(err);
  }
);

export default api;

export const SUPPORTED_CRYPTOS = ["USDT", "BTC", "ETH", "TRX", "BNB"];
export const TRADING_PAIRS = ["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "USDT"];
export const COIN_NAMES = {
  USDT: "Tether",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  TRX: "TRON",
  BNB: "BNB",
};

export function fmtMoney(n, d = 2) {
  if (n == null || isNaN(n)) return "-";
  if (Math.abs(n) >= 1)
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  return Number(n).toFixed(6);
}
