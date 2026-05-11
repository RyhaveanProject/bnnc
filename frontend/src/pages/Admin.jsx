Now the admin panel:
Action: file_editor create /app/frontend/src/pages/Admin.jsx --file-text "import React, { useEffect, useState } from \"react\";
import api, { SUPPORTED_CRYPTOS, fmtMoney } from \"../lib/api\";
import { formatErr } from \"../lib/auth\";

export default function Admin() {
  const [tab, setTab] = useState(\"dashboard\");
  return (
    <div data-testid=\"admin-page\" style={{maxWidth:1400, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 16px\"}}>Admin Panel</h1>
      <div style={{display:\"flex\", gap:8, marginBottom:16, flexWrap:\"wrap\"}}>
        {[
          [\"dashboard\",\"Dashboard\"],[\"users\",\"Users\"],[\"deposits\",\"Deposits\"],
          [\"withdrawals\",\"Withdrawals\"],[\"wallets\",\"Wallets / QR\"],[\"new-admin\",\"New Admin\"]
        ].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} data-testid={`admin-tab-${k}`}
            className={`btn btn-sm ${tab===k?\"btn-primary\":\"btn-ghost\"}`}>{l}</button>
        ))}
      </div>
      {tab === \"dashboard\" && <Dashboard />}
      {tab === \"users\" && <Users />}
      {tab === \"deposits\" && <Deposits />}
      {tab === \"withdrawals\" && <Withdrawals />}
      {tab === \"wallets\" && <Wallets />}
      {tab === \"new-admin\" && <NewAdmin />}
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const load = () => api.get(\"/admin/stats\").then(r => setStats(r.data));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!stats) return <div className=\"text-dim\">Loading…</div>;
  const items = [
    [\"Live Users (15m)\", stats.live_users],
    [\"Total Users\", stats.total_users],
    [\"Banned Users\", stats.banned_users],
    [\"Pending Deposits\", stats.pending_deposits],
    [\"Pending Withdrawals\", stats.pending_withdrawals],
  ];
  return (
    <div style={{display:\"grid\", gridTemplateColumns:\"repeat(auto-fit, minmax(180px, 1fr))\", gap:16}}>
      {items.map(([l,v]) => (
        <div key={l} className=\"panel\" style={{padding:20}} data-testid={`stat-${l}`}>
          <div className=\"text-dim\" style={{fontSize:12, textTransform:\"uppercase\"}}>{l}</div>
          <div style={{fontSize:28, fontWeight:700, marginTop:6}}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(\"\");
  const load = () => api.get(\"/admin/users\").then(r => setUsers(r.data));
  useEffect(() => { load(); }, []);
  const ban = async (id, banned) => {
    await api.post(`/admin/users/${id}/${banned?\"unban\":\"ban\"}`);
    load();
  };
  const adjust = async (id) => {
    const cur = prompt(\"Currency (USDT/BTC/ETH/TRX/BNB):\", \"USDT\");
    if (!cur) return;
    const amt = prompt(\"Amount (positive=add, negative=subtract):\");
    if (!amt) return;
    try {
      await api.post(\"/admin/users/balance\", { user_id: id, currency: cur.toUpperCase(), amount: parseFloat(amt) });
      setMsg(\"Balance updated\"); load();
    } catch (e) { setMsg(formatErr(e)); }
  };
  return (
    <div className=\"panel\" data-testid=\"admin-users\">
      {msg && <div style={{padding:12, fontSize:13}} className=\"text-yellow\">{msg}</div>}
      <div style={{overflowX:\"auto\"}}>
      <table className=\"tbl\">
        <thead><tr><th>Email</th><th>Username</th><th>Role</th><th>Balances</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td style={{fontSize:11}}>{Object.entries(u.balances||{}).filter(([_,v])=>v>0).map(([k,v])=>`${k}:${fmtMoney(v,4)}`).join(\" \") || \"—\"}</td>
              <td>{u.banned ? <span className=\"pill rejected\">Banned</span> : <span className=\"pill approved\">Active</span>}</td>
              <td>
                {u.role !== \"admin\" && <>
                  <button className=\"btn btn-ghost btn-sm\" onClick={()=>adjust(u.id)} data-testid={`adj-${u.id}`}>Balance</button>{\" \"}
                  <button className={`btn btn-sm ${u.banned?\"btn-green\":\"btn-red\"}`} onClick={()=>ban(u.id, u.banned)} data-testid={`ban-${u.id}`}>{u.banned?\"Unban\":\"Ban\"}</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Deposits() {
  const [rows, setRows] = useState([]);
  const load = () => api.get(\"/admin/deposits\").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const act = async (id, ok) => {
    await api.post(`/admin/deposits/${id}/${ok?\"approve\":\"reject\"}`);
    load();
  };
  return (
    <div className=\"panel\" data-testid=\"admin-deposits\">
      <div style={{overflowX:\"auto\"}}>
      <table className=\"tbl\">
        <thead><tr><th>Time</th><th>User</th><th>Currency</th><th>Amount</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id}>
              <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
              <td><div>{d.username}</div><div className=\"text-dim\" style={{fontSize:11}}>{d.email}</div></td>
              <td>{d.currency}</td>
              <td>{d.amount}</td>
              <td>{d.receipt_b64 ? <a href={d.receipt_b64} target=\"_blank\" rel=\"noreferrer\" className=\"text-yellow\">View</a> : \"—\"}</td>
              <td>{d.status === \"pending\" ? <span className=\"pill pending\">Pending</span> : d.status === \"approved\" ? <span className=\"pill approved\">Approved</span> : <span className=\"pill rejected\">{d.status}</span>}</td>
              <td>
                {d.status === \"pending\" && <>
                  <button className=\"btn btn-green btn-sm\" onClick={()=>act(d.id, true)} data-testid={`apr-${d.id}`}>Approve</button>{\" \"}
                  <button className=\"btn btn-red btn-sm\" onClick={()=>act(d.id, false)} data-testid={`rej-${d.id}`}>Reject</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Withdrawals() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get(\"/admin/withdrawals\").then(r => setRows(r.data)); }, []);
  return (
    <div className=\"panel\" data-testid=\"admin-withdrawals\">
      <div style={{overflowX:\"auto\"}}>
      <table className=\"tbl\">
        <thead><tr><th>Time</th><th>User</th><th>Currency</th><th>Amount</th><th>Fee</th><th>Address</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id}>
              <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
              <td><div>{d.username}</div><div className=\"text-dim\" style={{fontSize:11}}>{d.email}</div></td>
              <td>{d.currency}</td>
              <td>{d.amount}</td>
              <td>{d.fee}</td>
              <td style={{fontSize:11}}>{d.address}</td>
              <td>{d.status === \"pending\" ? <span className=\"pill pending\">Pending</span> : d.status === \"paid\" ? <span className=\"pill paid\">Paid</span> : <span className=\"pill rejected\">{d.status}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Wallets() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [address, setAddress] = useState(\"\");
  const [network, setNetwork] = useState(\"\");
  const [qrFile, setQrFile] = useState(\"\");
  const [msg, setMsg] = useState(\"\");

  const load = () => api.get(\"/wallets\").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);

  const startEdit = (w) => { setEditing(w.currency); setAddress(w.address); setNetwork(w.network||\"\"); setQrFile(w.qr_image_b64||\"\"); setMsg(\"\"); };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload=()=>setQrFile(r.result); r.readAsDataURL(f);
  };
  const save = async () => {
    try {
      await api.put(\"/admin/wallets\", { currency: editing, address, network, qr_image_b64: qrFile });
      setMsg(\"Saved\"); setEditing(null); load();
    } catch (e) { setMsg(formatErr(e)); }
  };

  return (
    <div className=\"panel\" style={{padding:20}} data-testid=\"admin-wallets\">
      {msg && <div style={{marginBottom:10, fontSize:13}} className=\"text-yellow\">{msg}</div>}
      {SUPPORTED_CRYPTOS.map(c => {
        const w = rows.find(x => x.currency === c) || { currency: c, address: \"\", network: c, qr_image_b64: \"\" };
        const isEditing = editing === c;
        return (
          <div key={c} className=\"panel\" style={{padding:16, marginBottom:12, background:\"#0f1319\"}}>
            <div style={{display:\"flex\", justifyContent:\"space-between\", alignItems:\"center\", marginBottom:10}}>
              <div style={{fontWeight:700, fontSize:18}}>{c}</div>
              {!isEditing && <button className=\"btn btn-ghost btn-sm\" onClick={()=>startEdit(w)} data-testid={`edit-wallet-${c}`}>Edit</button>}
            </div>
            {!isEditing ? (
              <div style={{display:\"flex\", gap:14, alignItems:\"center\"}}>
                {w.qr_image_b64 && <img src={w.qr_image_b64} alt=\"qr\" style={{width:80, height:80, background:\"#fff\", padding:4, borderRadius:6}}/>}
                <div style={{flex:1}}>
                  <div className=\"text-dim\" style={{fontSize:12}}>Network: {w.network || \"—\"}</div>
                  <div style={{fontSize:13, wordBreak:\"break-all\"}}>{w.address || <span className=\"text-dim\">not set</span>}</div>
                </div>
              </div>
            ) : (
              <div>
                <label className=\"lbl\">Address</label>
                <input className=\"input\" value={address} onChange={e=>setAddress(e.target.value)} data-testid={`wallet-addr-${c}`}/>
                <div style={{height:8}}/>
                <label className=\"lbl\">Network</label>
                <input className=\"input\" value={network} onChange={e=>setNetwork(e.target.value)}/>
                <div style={{height:8}}/>
                <label className=\"lbl\">QR Image (upload, optional)</label>
                <input type=\"file\" accept=\"image/*\" onChange={onFile} data-testid={`wallet-qr-${c}`}/>
                {qrFile && <img src={qrFile} alt=\"qr\" style={{maxWidth:140, marginTop:8, borderRadius:6, background:\"#fff\", padding:4}}/>}
                <div style={{display:\"flex\", gap:8, marginTop:12}}>
                  <button className=\"btn btn-ghost btn-sm\" onClick={()=>setEditing(null)}>Cancel</button>
                  <button className=\"btn btn-primary btn-sm\" onClick={save} data-testid={`save-wallet-${c}`}>Save</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewAdmin() {
  const [email,setEmail] = useState(\"\"); const [username,setUsername]=useState(\"\"); const [password,setPassword]=useState(\"\");
  const [msg,setMsg] = useState(\"\"); const [err,setErr]=useState(\"\");
  const submit = async (e) => {
    e.preventDefault(); setMsg(\"\"); setErr(\"\");
    try {
      await api.post(\"/admin/create\", { email, username, password });
      setMsg(\"Admin created\"); setEmail(\"\"); setUsername(\"\"); setPassword(\"\");
    } catch (e2) { setErr(formatErr(e2)); }
  };
  return (
    <form className=\"panel\" style={{padding:24, maxWidth:480}} onSubmit={submit} data-testid=\"admin-new-form\">
      <label className=\"lbl\">Email</label>
      <input className=\"input\" type=\"email\" value={email} onChange={e=>setEmail(e.target.value)} required data-testid=\"new-admin-email\"/>
      <div style={{height:10}}/>
      <label className=\"lbl\">Username</label>
      <input className=\"input\" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} data-testid=\"new-admin-username\"/>
      <div style={{height:10}}/>
      <label className=\"lbl\">Password</label>
      <input className=\"input\" type=\"password\" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} data-testid=\"new-admin-password\"/>
      {msg && <div className=\"text-green\" style={{marginTop:10, fontSize:13}}>{msg}</div>}
      {err && <div className=\"text-red\" style={{marginTop:10, fontSize:13}}>{err}</div>}
      <button className=\"btn btn-primary\" style={{marginTop:14, width:\"100%\"}} type=\"submit\" data-testid=\"new-admin-submit\">Create Admin</button>
    </form>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/Admin.jsx
