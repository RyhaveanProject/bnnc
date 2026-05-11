
Action: file_editor create /app/frontend/src/lib/api.js --file-text "import axios from \"axios\";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(\"adx_token\");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export default api;

export const SUPPORTED_CRYPTOS = [\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"];
export const TRADING_PAIRS = [\"BTC\", \"ETH\", \"BNB\", \"XRP\", \"SOL\", \"TRX\", \"USDT\"];

export function fmtMoney(n, d = 2) {
  if (n == null || isNaN(n)) return \"-\";
  if (Math.abs(n) >= 1) return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return Number(n).toFixed(6);
}
"
Observation: Create successful: /app/frontend/src/lib/api.js
