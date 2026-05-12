import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { SUPPORTED_CRYPTOS, fmtMoney, API } from "../lib/api";
import { formatErr } from "../lib/auth";

export default function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("dashboard");
  const tabs = [
    ["dashboard", t("admin.tabs.dashboard")],
    ["users", t("admin.tabs.users")],
    ["deposits", t("admin.tabs.deposits")],
    ["withdrawals", t("admin.tabs.withdrawals")],
    ["wallets", t("admin.tabs.wallets")],
    ["new-admin", t("admin.tabs.new_admin")],
  ];
  return (
    <div data-testid="admin-page" style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }} className="container-pad">
      <h1 style={{ margin: "0 0 16px" }}>{t("admin.title")}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`admin-tab-${k}`}
            className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "dashboard" && <Dashboard />}
      {tab === "users" && <Users />}
      {tab === "deposits" && <Deposits />}
      {tab === "withdrawals" && <Withdrawals />}
      {tab === "wallets" && <Wallets />}
      {tab === "new-admin" && <NewAdmin />}
    </div>
  );
}

function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const load = () => api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    load();
    const tm = setInterval(load, 5000);
    return () => clearInterval(tm);
  }, []);
  if (!stats) return <div className="text-dim">{t("common.loading")}</div>;
  const items = [
    [t("admin.stats.live_users"), stats.live_users],
    [t("admin.stats.total_users"), stats.total_users],
    [t("admin.stats.banned_users"), stats.banned_users],
    [t("admin.stats.pending_deposits"), stats.pending_deposits],
    [t("admin.stats.pending_withdrawals"), stats.pending_withdrawals],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
      {items.map(([l, v]) => (
        <div key={l} className="panel" style={{ padding: 20 }} data-testid={`stat-${l}`}>
          <div className="text-dim" style={{ fontSize: 12, textTransform: "uppercase" }}>{l}</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function BalanceModal({ user, onClose, onUpdated }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("set");
  const [currency, setCurrency] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const currentBal = useMemo(() => Number(user?.balances?.[currency] || 0), [user, currency]);

  const submit = async () => {
    setErr("");
    const amt = parseFloat(amount);
    if (isNaN(amt)) { setErr(t("admin.valid_number")); return; }
    if (mode === "set" && amt < 0) { setErr(t("admin.negative_not_allowed")); return; }
    if ((mode === "add" || mode === "subtract") && amt <= 0) { setErr(t("admin.must_be_gt_zero")); return; }
    setBusy(true);
    try {
      if (mode === "set") {
        const { data } = await api.post("/admin/users/balance/set", { user_id: user.id, currency, amount: amt });
        onUpdated?.(data.user);
      } else {
        const delta = mode === "add" ? amt : -amt;
        const { data } = await api.post("/admin/users/balance", { user_id: user.id, currency, amount: delta });
        onUpdated?.(data.user);
      }
      onClose();
    } catch (e) { setErr(formatErr(e)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="balance-modal" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 460, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t("admin.manage_balance")}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} data-testid="balance-modal-close">✕</button>
        </div>
        <div className="text-dim" style={{ fontSize: 13, marginBottom: 12 }}>
          {t("admin.user_label")}: <b style={{ color: "var(--text)" }}>{user.username}</b> ({user.email})
        </div>

        <label className="lbl">{t("admin.currency")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {SUPPORTED_CRYPTOS.map((c) => (
            <button key={c} type="button" onClick={() => setCurrency(c)}
              className={`btn btn-sm ${currency === c ? "btn-primary" : "btn-ghost"}`} data-testid={`bal-cur-${c}`}>{c}</button>
          ))}
        </div>

        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 13, marginBottom: 12 }} data-testid="bal-current">
          {t("admin.current_balance", { currency })}: <b style={{ color: "var(--text)" }}>{fmtMoney(currentBal, 6)}</b>
        </div>

        <label className="lbl">{t("admin.action")}</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["set", t("admin.set")], ["add", t("admin.add")], ["subtract", t("admin.subtract")]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={`btn btn-sm ${mode === k ? "btn-primary" : "btn-ghost"}`} data-testid={`bal-mode-${k}`}>{l}</button>
          ))}
        </div>

        <label className="lbl">
          {mode === "set" ? t("admin.new_balance") : mode === "add" ? t("admin.amount_to_add") : t("admin.amount_to_subtract")}
        </label>
        <input className="input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00" data-testid="bal-amount" autoFocus/>

        {err && <div className="text-red" style={{ marginTop: 10, fontSize: 13 }} data-testid="bal-err">{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !amount} style={{ flex: 1 }} data-testid="bal-submit">
            {busy ? <span className="spinner" /> : t("common.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");

  const load = () => api.get("/admin/users").then((r) => setUsers(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const tm = setInterval(load, 8000);
    return () => clearInterval(tm);
  }, []);

  const ban = async (id, banned) => {
    try { await api.post(`/admin/users/${id}/${banned ? "unban" : "ban"}`); load(); }
    catch (e) { setMsg(formatErr(e)); }
  };

  const onUpdated = (updatedUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    setMsg(t("admin.balance_updated", { name: updatedUser.username }));
    setTimeout(() => setMsg(""), 3000);
  };

  const filtered = users.filter((u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (u.email || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
  });

  return (
    <div className="panel" data-testid="admin-users">
      <div style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <input className="input" placeholder={t("admin.search_users")} value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }} data-testid="users-search"/>
        {msg && <div className="text-green" style={{ fontSize: 13 }} data-testid="users-msg">{msg}</div>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.email")}</th><th>{t("admin.username")}</th><th>{t("admin.role")}</th>
              <th>{t("admin.balances")}</th><th>{t("admin.status")}</th><th>{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td style={{ fontSize: 11 }}>
                  {Object.entries(u.balances || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${fmtMoney(v, 4)}`).join(" ") || "—"}
                </td>
                <td>
                  {u.banned ? <span className="pill rejected">{t("admin.banned")}</span> : <span className="pill approved">{t("admin.active")}</span>}
                </td>
                <td>
                  {u.role !== "admin" && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => setEditingUser(u)} data-testid={`set-balance-${u.id}`}>
                        {t("admin.set_balance")}
                      </button>{" "}
                      <button className={`btn btn-sm ${u.banned ? "btn-green" : "btn-red"}`} onClick={() => ban(u.id, u.banned)} data-testid={`ban-${u.id}`}>
                        {u.banned ? t("admin.unban") : t("admin.ban")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-dim" style={{ textAlign: "center", padding: 24 }}>{t("admin.no_users")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editingUser && <BalanceModal user={editingUser} onClose={() => setEditingUser(null)} onUpdated={onUpdated} />}
    </div>
  );
}

function ReceiptViewer({ depositId, onClose }) {
  const { t } = useTranslation();
  const token = localStorage.getItem("adx_token") || "";
  const [imgUrl, setImgUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    (async () => {
      try {
        const res = await fetch(`${API}/deposits/${depositId}/receipt`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!cancelled) { objectUrl = URL.createObjectURL(blob); setImgUrl(objectUrl); }
      } catch (e) { if (!cancelled) setErr(e.message); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [depositId, token]);
  return (
    <div data-testid="receipt-viewer" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "grid", placeItems: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh" }}>
        {err && <div className="text-red">{err}</div>}
        {imgUrl && <img src={imgUrl} alt="receipt" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />}
        <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ position: "fixed", top: 16, right: 16 }}>
          {t("common.close")} ✕
        </button>
      </div>
    </div>
  );
}

function Deposits() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => api.get("/admin/deposits").then((r) => setRows(r.data)).catch(() => {});
  useEffect(() => { load(); const tm = setInterval(load, 6000); return () => clearInterval(tm); }, []);
  const act = async (id, ok) => {
    try {
      await api.post(`/admin/deposits/${id}/${ok ? "approve" : "reject"}`);
      setMsg(ok ? t("admin.deposits.approved") : t("admin.deposits.rejected"));
      setTimeout(() => setMsg(""), 2500); load();
    } catch (e) { setMsg(formatErr(e)); }
  };
  return (
    <div className="panel" data-testid="admin-deposits">
      {msg && <div style={{ padding: 12, fontSize: 13 }} className="text-green">{msg}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.deposits.date")}</th><th>{t("admin.deposits.user")}</th>
              <th>{t("admin.deposits.token")}</th><th>{t("admin.deposits.amount")}</th>
              <th>{t("admin.deposits.wallet")}</th><th>{t("admin.deposits.receipt")}</th>
              <th>{t("admin.deposits.status")}</th><th>{t("admin.deposits.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td style={{ fontSize: 12 }}>{new Date(d.created_at).toLocaleString()}</td>
                <td><div>{d.username}</div><div className="text-dim" style={{ fontSize: 11 }}>{d.email}</div></td>
                <td>{d.currency}</td>
                <td>{d.amount}</td>
                <td style={{ fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={d.wallet_address}>{d.wallet_address}</td>
                <td>
                  {d.receipt_uploaded ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => setViewingReceipt(d.id)} data-testid={`view-receipt-${d.id}`}>
                      {t("common.view")}
                    </button>
                  ) : "—"}
                </td>
                <td>
                  {d.status === "pending" ? <span className="pill pending">{t("status.pending")}</span>
                    : d.status === "completed" || d.status === "approved" ? <span className="pill approved">{t("status.completed")}</span>
                    : <span className="pill rejected">{d.status}</span>}
                </td>
                <td>
                  {d.status === "pending" && (
                    <>
                      <button className="btn btn-green btn-sm" onClick={() => act(d.id, true)} data-testid={`apr-${d.id}`}>{t("admin.deposits.confirm")}</button>{" "}
                      <button className="btn btn-red btn-sm" onClick={() => act(d.id, false)} data-testid={`rej-${d.id}`}>{t("admin.deposits.cancel")}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-dim" style={{ textAlign: "center", padding: 24 }}>{t("admin.deposits.no_deposits")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {viewingReceipt && <ReceiptViewer depositId={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
    </div>
  );
}

function Withdrawals() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/withdrawals").then((r) => setRows(r.data)).catch(() => {}); }, []);
  return (
    <div className="panel" data-testid="admin-withdrawals">
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.withdrawals.time")}</th><th>{t("admin.withdrawals.user")}</th>
              <th>{t("admin.withdrawals.currency")}</th><th>{t("admin.withdrawals.amount")}</th>
              <th>{t("admin.withdrawals.fee")}</th><th>{t("admin.withdrawals.address")}</th>
              <th>{t("admin.withdrawals.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td style={{ fontSize: 12 }}>{new Date(d.created_at).toLocaleString()}</td>
                <td><div>{d.username}</div><div className="text-dim" style={{ fontSize: 11 }}>{d.email}</div></td>
                <td>{d.currency}</td>
                <td>{d.amount}</td>
                <td>{d.fee}</td>
                <td style={{ fontSize: 11 }}>{d.address}</td>
                <td>
                  {d.status === "pending" ? <span className="pill pending">{t("status.pending")}</span>
                    : d.status === "paid" ? <span className="pill paid">{t("status.paid")}</span>
                    : <span className="pill rejected">{d.status}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Wallets() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [qrFile, setQrFile] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api.get("/wallets").then((r) => setRows(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const startEdit = (w) => { setEditing(w.currency); setAddress(w.address); setNetwork(w.network || ""); setQrFile(w.qr_image_b64 || ""); setMsg(""); };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setQrFile(r.result); r.readAsDataURL(f);
  };
  const save = async () => {
    try { await api.put("/admin/wallets", { currency: editing, address, network, qr_image_b64: qrFile });
      setMsg(t("admin.wallets.saved")); setEditing(null); load();
    } catch (e) { setMsg(formatErr(e)); }
  };

  return (
    <div className="panel" style={{ padding: 20 }} data-testid="admin-wallets">
      {msg && <div style={{ marginBottom: 10, fontSize: 13 }} className="text-yellow">{msg}</div>}
      {SUPPORTED_CRYPTOS.map((c) => {
        const w = rows.find((x) => x.currency === c) || { currency: c, address: "", network: c, qr_image_b64: "" };
        const isEditing = editing === c;
        return (
          <div key={c} className="panel" style={{ padding: 16, marginBottom: 12, background: "#0f1319" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{c}</div>
              {!isEditing && (
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(w)} data-testid={`edit-wallet-${c}`}>{t("common.edit")}</button>
              )}
            </div>
            {!isEditing ? (
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                {w.qr_image_b64 && (
                  <img src={w.qr_image_b64} alt="qr" style={{ width: 80, height: 80, background: "#fff", padding: 4, borderRadius: 6 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div className="text-dim" style={{ fontSize: 12 }}>{t("admin.wallets.network")}: {w.network || "—"}</div>
                  <div style={{ fontSize: 13, wordBreak: "break-all" }}>
                    {w.address || <span className="text-dim">{t("admin.wallets.not_set")}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="lbl">{t("admin.wallets.address")}</label>
                <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} data-testid={`wallet-addr-${c}`} />
                <div style={{ height: 8 }} />
                <label className="lbl">{t("admin.wallets.network")}</label>
                <input className="input" value={network} onChange={(e) => setNetwork(e.target.value)} />
                <div style={{ height: 8 }} />
                <label className="lbl">{t("admin.wallets.qr_image")}</label>
                <input type="file" accept="image/*" onChange={onFile} data-testid={`wallet-qr-${c}`} />
                {qrFile && (<img src={qrFile} alt="qr" style={{ maxWidth: 140, marginTop: 8, borderRadius: 6, background: "#fff", padding: 4 }} />)}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
                  <button className="btn btn-primary btn-sm" onClick={save} data-testid={`save-wallet-${c}`}>{t("common.save")}</button>
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
  const { t } = useTranslation();
  const [email, setEmail] = useState(""); const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setMsg(""); setErr("");
    try { await api.post("/admin/create", { email, username, password });
      setMsg(t("admin.new_admin_form.created")); setEmail(""); setUsername(""); setPassword("");
    } catch (e2) { setErr(formatErr(e2)); }
  };
  return (
    <form className="panel" style={{ padding: 24, maxWidth: 480 }} onSubmit={submit} data-testid="admin-new-form">
      <label className="lbl">{t("admin.new_admin_form.email")}</label>
      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="new-admin-email" />
      <div style={{ height: 10 }} />
      <label className="lbl">{t("admin.new_admin_form.username")}</label>
      <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} data-testid="new-admin-username" />
      <div style={{ height: 10 }} />
      <label className="lbl">{t("admin.new_admin_form.password")}</label>
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} data-testid="new-admin-password" />
      {msg && <div className="text-green" style={{ marginTop: 10, fontSize: 13 }}>{msg}</div>}
      {err && <div className="text-red" style={{ marginTop: 10, fontSize: 13 }}>{err}</div>}
      <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} type="submit" data-testid="new-admin-submit">
        {t("admin.new_admin_form.create")}
      </button>
    </form>
  );
}
