
Action: file_editor create /app/frontend/src/ --file-text "import React, { useEffect, useState, useRef } from \"react\";
import client from \"./api\";
import Navbar from \"./Navbar\";
import { useAuth, formatError } from \"./auth\";

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState(\"dashboard\");
  if (user?.role !== \"admin\") {
    return (
      <div>
        <Navbar />
        <div style={{ padding: 40, textAlign: \"center\", color: \"var(--bnnc-red)\" }}>Admin icazəsi yoxdur</div>
      </div>
    );
  }
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 1440, margin: \"0 auto\", padding: 24 }}>
        <h2>🧑‍💼 Admin Panel</h2>
        <div style={{ display: \"flex\", gap: 4, borderBottom: \"1px solid var(--bnnc-border)\", marginBottom: 20, flexWrap: \"wrap\" }}>
          {[
            [\"dashboard\", \"Dashboard\"],
            [\"users\", \"Users\"],
            [\"deposits\", \"Deposits\"],
            [\"withdrawals\", \"Withdrawals\"],
            [\"trades\", \"Trades\"],
            [\"qr\", \"QR Codes\"],
            [\"create-admin\", \"New Admin\"],
          ].map(([k, l]) => (
            <div key={k} className={`tab ${tab === k ? \"active\" : \"\"}`} onClick={() => setTab(k)} data-testid={`admin-tab-${k}`}>{l}</div>
          ))}
        </div>
        {tab === \"dashboard\" && <Dashboard />}
        {tab === \"users\" && <UsersTab />}
        {tab === \"deposits\" && <TxTab type=\"deposit\"/>}
        {tab === \"withdrawals\" && <TxTab type=\"withdraw\"/>}
        {tab === \"trades\" && <TxTab type=\"trade\"/>}
        {tab === \"qr\" && <QrTab />}
        {tab === \"create-admin\" && <CreateAdminTab />}
      </div>
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState({});
  useEffect(() => {
    const load = async () => {
      try { const { data } = await client.get(\"/admin/stats\"); setS(data); } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  const card = (label, value, color = \"var(--bnnc-text)\") => (
    <div className=\"bnnc-card\" style={{ padding: 20 }}>
      <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color }}>{value ?? 0}</div>
    </div>
  );
  return (
    <div style={{ display: \"grid\", gridTemplateColumns: \"repeat(3, 1fr)\", gap: 16 }}>
      {card(\"Total Users\", s.total_users)}
      {card(\"Active Users\", s.active_users, \"var(--bnnc-green)\")}
      {card(\"Banned\", s.banned_users, \"var(--bnnc-red)\")}
      {card(\"Live Users (5m)\", s.live_users, \"var(--bnnc-gold)\")}
      {card(\"Pending Deposits\", s.pending_deposits, \"var(--bnnc-gold)\")}
      {card(\"Pending Withdrawals\", s.pending_withdrawals, \"var(--bnnc-gold)\")}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState(\"\");
  const [adjustOpen, setAdjustOpen] = useState(null);

  const load = async () => {
    const { data } = await client.get(`/admin/users?q=${encodeURIComponent(q)}`);
    setUsers(data.users || []);
  };
  useEffect(() => { load(); }, []); // initial

  const search = (e) => { e.preventDefault(); load(); };

  const ban = async (id, banned) => {
    await client.post(\"/admin/ban\", { user_id: id, banned });
    load();
  };

  return (
    <>
      <form onSubmit={search} style={{ display: \"flex\", gap: 8, marginBottom: 16 }}>
        <input className=\"bnnc-input\" placeholder=\"Email və ya username axtar\" value={q} onChange={(e)=>setQ(e.target.value)} style={{ maxWidth: 400 }} data-testid=\"admin-user-search\"/>
        <button className=\"bnnc-btn\" type=\"submit\">Search</button>
      </form>
      <div className=\"bnnc-card\">
        <table className=\"bnnc-table\">
          <thead><tr><th>Email</th><th>Username</th><th>Role</th><th>USDT</th><th>BTC</th><th>ETH</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid={`admin-user-${u.id}`}>
                <td>{u.email}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{(u.balances?.USDT || 0).toFixed(2)}</td>
                <td>{(u.balances?.BTC || 0).toFixed(6)}</td>
                <td>{(u.balances?.ETH || 0).toFixed(6)}</td>
                <td>{u.banned ? <span className=\"text-down\">Banned</span> : <span className=\"text-up\">Active</span>}</td>
                <td style={{ display: \"flex\", gap: 6 }}>
                  {u.role !== \"admin\" && (
                    u.banned
                      ? <button className=\"bnnc-btn-ghost bnnc-btn\" style={{ padding: \"4px 10px\", fontSize: 12 }} onClick={() => ban(u.id, false)} data-testid={`unban-${u.id}`}>Unban</button>
                      : <button className=\"bnnc-btn-ghost bnnc-btn\" style={{ padding: \"4px 10px\", fontSize: 12, color: \"var(--bnnc-red)\" }} onClick={() => ban(u.id, true)} data-testid={`ban-${u.id}`}>Ban</button>
                  )}
                  <button className=\"bnnc-btn\" style={{ padding: \"4px 10px\", fontSize: 12 }} onClick={() => setAdjustOpen(u)} data-testid={`adjust-${u.id}`}>±Balance</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adjustOpen && <AdjustModal user={adjustOpen} onClose={() => { setAdjustOpen(null); load(); }} />}
    </>
  );
}

function AdjustModal({ user, onClose }) {
  const [cur, setCur] = useState(\"USDT\");
  const [amt, setAmt] = useState(\"\");
  const [note, setNote] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const submit = async () => {
    setErr(\"\");
    try {
      await client.post(\"/admin/adjust-balance\", { user_id: user.id, currency: cur, amount: Number(amt), note });
      onClose();
    } catch (e) { setErr(formatError(e)); }
  };
  return (
    <div style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,0.7)\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 100 }}>
      <div className=\"bnnc-card\" style={{ padding: 24, width: 420 }}>
        <h3 style={{ marginTop: 0 }}>Adjust Balance: {user.email}</h3>
        <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Currency</label>
        <select className=\"bnnc-input\" value={cur} onChange={(e)=>setCur(e.target.value)} style={{ marginTop: 6, marginBottom: 12 }} data-testid=\"adjust-currency\">
          {[\"USDT\",\"BTC\",\"ETH\",\"TRX\",\"BNB\"].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Amount (mənfi rəqəm çıxarmaq üçün)</label>
        <input className=\"bnnc-input\" type=\"number\" step=\"any\" value={amt} onChange={(e)=>setAmt(e.target.value)} style={{ marginTop: 6, marginBottom: 12 }} data-testid=\"adjust-amount\"/>
        <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Note (optional)</label>
        <input className=\"bnnc-input\" value={note} onChange={(e)=>setNote(e.target.value)} style={{ marginTop: 6, marginBottom: 12 }}/>
        {err && <div className=\"text-down\" style={{ fontSize: 13 }}>{err}</div>}
        <div style={{ display: \"flex\", gap: 8, marginTop: 14 }}>
          <button className=\"bnnc-btn\" onClick={submit} data-testid=\"adjust-submit\">Apply</button>
          <button className=\"bnnc-btn-ghost bnnc-btn\" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TxTab({ type }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(\"\");
  const load = async () => {
    const params = { type };
    if (status) params.status = status;
    const qs = new URLSearchParams(params).toString();
    const { data } = await client.get(`/admin/transactions?${qs}`);
    setItems(data.transactions || []);
  };
  useEffect(() => { load(); const id = setInterval(load, 6000); return () => clearInterval(id); }, [status]);

  const approve = async (id) => {
    const ep = type === \"deposit\" ? `/admin/approve-deposit/${id}` : `/admin/approve-withdraw/${id}`;
    await client.post(ep);
    load();
  };
  const reject = async (id) => {
    const ep = type === \"deposit\" ? `/admin/reject-deposit/${id}` : `/admin/reject-withdraw/${id}`;
    await client.post(ep);
    load();
  };

  return (
    <>
      <div style={{ marginBottom: 12, display: \"flex\", gap: 8 }}>
        {[\"\", \"pending\", \"approved\", \"rejected\", \"filled\"].map((s) => (
          <button key={s||\"all\"} className={status === s ? \"bnnc-btn\" : \"bnnc-btn-ghost bnnc-btn\"} style={{ padding: \"6px 14px\", fontSize: 13 }} onClick={() => setStatus(s)}>
            {s || \"All\"}
          </button>
        ))}
      </div>
      <div className=\"bnnc-card\">
        <table className=\"bnnc-table\">
          <thead><tr><th>Time</th><th>User</th><th>Currency</th><th>Amount</th>{type === \"withdraw\" && <th>Fee</th>}{type === \"withdraw\" && <th>Address</th>}{type === \"trade\" && <th>Side</th>}{type === \"trade\" && <th>Price</th>}<th>Status</th>{type !== \"trade\" && <th>Actions</th>}</tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={9} style={{ textAlign: \"center\", color: \"var(--bnnc-text-dim)\" }}>No {type}s</td></tr>}
            {items.map((t) => (
              <tr key={t.id} data-testid={`admin-${type}-${t.id}`}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.user?.email || t.user_id}</td>
                <td>{t.currency || t.symbol}</td>
                <td>{(t.amount || 0).toFixed(8)}</td>
                {type === \"withdraw\" && <td>{t.fee?.toFixed(8)}</td>}
                {type === \"withdraw\" && <td style={{ fontSize: 11 }}>{t.address?.slice(0, 18)}...</td>}
                {type === \"trade\" && <td>{t.side}</td>}
                {type === \"trade\" && <td>${t.price?.toFixed(2)}</td>}
                <td>{t.status}</td>
                {type !== \"trade\" && (
                  <td style={{ display: \"flex\", gap: 6 }}>
                    {t.status === \"pending\" && (
                      <>
                        <button className=\"bnnc-btn bnnc-btn-green\" style={{ padding: \"4px 10px\", fontSize: 12 }} onClick={() => approve(t.id)} data-testid={`approve-${t.id}`}>Approve</button>
                        <button className=\"bnnc-btn bnnc-btn-red\" style={{ padding: \"4px 10px\", fontSize: 12 }} onClick={() => reject(t.id)} data-testid={`reject-${t.id}`}>Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QrTab() {
  const [list, setList] = useState([]);
  const [currency, setCurrency] = useState(\"USDT\");
  const [preview, setPreview] = useState(\"\");
  const inputRef = useRef(null);

  const load = async () => {
    const { data } = await client.get(\"/admin/qr\");
    setList(data.qr_codes || []);
  };
  useEffect(() => { load(); }, []);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const upload = async () => {
    if (!preview) return;
    await client.post(\"/admin/qr/upload\", { currency, image_base64: preview });
    setPreview(\"\");
    if (inputRef.current) inputRef.current.value = \"\";
    load();
  };

  return (
    <div style={{ display: \"grid\", gridTemplateColumns: \"1fr 1fr\", gap: 20 }}>
      <div className=\"bnnc-card\" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>QR yüklə</h3>
        <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Currency</label>
        <select className=\"bnnc-input\" value={currency} onChange={(e)=>setCurrency(e.target.value)} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"qr-currency\">
          {[\"USDT\",\"BTC\",\"ETH\",\"TRX\",\"BNB\"].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input ref={inputRef} type=\"file\" accept=\"image/*\" onChange={onFile} style={{ marginBottom: 14 }} data-testid=\"qr-file\"/>
        {preview && <img src={preview} alt=\"preview\" style={{ width: 160, height: 160, marginBottom: 14, background: \"white\", borderRadius: 8, padding: 8 }}/>}
        <button className=\"bnnc-btn\" onClick={upload} disabled={!preview} data-testid=\"qr-upload\">Upload</button>
      </div>
      <div className=\"bnnc-card\" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Mövcud QR-lər</h3>
        <div style={{ display: \"grid\", gridTemplateColumns: \"repeat(3, 1fr)\", gap: 12 }}>
          {list.map((q) => (
            <div key={q.currency} style={{ textAlign: \"center\" }}>
              <img src={q.image_base64} alt={q.currency} style={{ width: 100, height: 100, background: \"white\", borderRadius: 6, padding: 4 }}/>
              <div style={{ fontSize: 12, marginTop: 4 }}>{q.currency}</div>
            </div>
          ))}
          {list.length === 0 && <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>Heç bir QR yüklənməyib (default avtomatik generasiya edilir)</div>}
        </div>
      </div>
    </div>
  );
}

function CreateAdminTab() {
  const [email, setEmail] = useState(\"\");
  const [username, setUsername] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [msg, setMsg] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const submit = async (e) => {
    e.preventDefault();
    setMsg(\"\"); setErr(\"\");
    try {
      await client.post(\"/admin/create-admin\", { email, username, password });
      setMsg(\"✓ Yeni admin yaradıldı\");
      setEmail(\"\"); setUsername(\"\"); setPassword(\"\");
    } catch (e) { setErr(formatError(e)); }
  };
  return (
    <div className=\"bnnc-card\" style={{ padding: 24, maxWidth: 460 }}>
      <h3 style={{ marginTop: 0 }}>Yeni Admin yarat</h3>
      <form onSubmit={submit}>
        <input className=\"bnnc-input\" placeholder=\"Email\" type=\"email\" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ marginBottom: 12 }} data-testid=\"new-admin-email\"/>
        <input className=\"bnnc-input\" placeholder=\"Username\" value={username} onChange={(e)=>setUsername(e.target.value)} required style={{ marginBottom: 12 }} data-testid=\"new-admin-username\"/>
        <input className=\"bnnc-input\" placeholder=\"Strong Password\" type=\"password\" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ marginBottom: 12 }} data-testid=\"new-admin-password\"/>
        {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {msg && <div className=\"text-up\" style={{ fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        <button className=\"bnnc-btn\" type=\"submit\" data-testid=\"new-admin-submit\">Yarat</button>
      </form>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/Admin.jsx
