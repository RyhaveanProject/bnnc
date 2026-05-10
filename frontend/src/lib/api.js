
Action: file_editor create /app/frontend/src/lib/api.js --file-text "import axios from \"axios\";
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = {
  markets: () => axios.get(`${API}/markets`).then(r => r.data),
  wallet: (cur) => axios.get(`${API}/deposit/wallet/${cur}`).then(r => r.data),
  createDeposit: (payload) => axios.post(`${API}/deposit`, payload).then(r => r.data),
  depositHistory: () => axios.get(`${API}/deposit/history`).then(r => r.data),
  liveChat: () => axios.get(`${API}/config/live-chat`).then(r => r.data),
  ping: () => axios.post(`${API}/session/ping`).then(r => r.data),
  admin: {
    stats: () => axios.get(`${API}/admin/stats`).then(r => r.data),
    users: () => axios.get(`${API}/admin/users`).then(r => r.data),
    ban: (id) => axios.post(`${API}/admin/users/${id}/ban`).then(r => r.data),
    unban: (id) => axios.post(`${API}/admin/users/${id}/unban`).then(r => r.data),
    adjust: (id, amount, note) => axios.post(`${API}/admin/users/${id}/balance`, { amount, note }).then(r => r.data),
    deposits: () => axios.get(`${API}/admin/deposits`).then(r => r.data),
    approve: (id) => axios.post(`${API}/admin/deposits/${id}/approve`).then(r => r.data),
    reject: (id) => axios.post(`${API}/admin/deposits/${id}/reject`).then(r => r.data),
    create: (payload) => axios.post(`${API}/admin/create`, payload).then(r => r.data),
  },
};

export const fmt = {
  usd: (n) => \"$\" + Number(n || 0).toLocaleString(\"en-US\", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  price: (n) => {
    const v = Number(n || 0);
    if (v >= 1000) return \"$\" + v.toLocaleString(\"en-US\", { maximumFractionDigits: 2 });
    if (v >= 1) return \"$\" + v.toFixed(2);
    return \"$\" + v.toFixed(4);
  },
  big: (n) => {
    const v = Number(n || 0);
    if (v >= 1e12) return \"$\" + (v/1e12).toFixed(2) + \"T\";
    if (v >= 1e9) return \"$\" + (v/1e9).toFixed(2) + \"B\";
    if (v >= 1e6) return \"$\" + (v/1e6).toFixed(2) + \"M\";
    return \"$\" + v.toLocaleString();
  },
  pct: (n) => (n >= 0 ? \"+\" : \"\") + Number(n || 0).toFixed(2) + \"%\",
};
"
Observation: Create successful: /app/frontend/src/lib/api.js
