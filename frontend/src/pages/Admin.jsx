
Action: file_editor create /app/frontend/src/pages/Admin.jsx --file-text "import React, { useEffect, useState } from \"react\";
import { Link, useNavigate } from \"react-router-dom\";
import { useAuth } from \"@/context/AuthContext\";
import { api, fmt } from \"@/lib/api\";
import { toast } from \"sonner\";
import { LogOut, Users, Activity, Wallet, ShieldCheck, Plus, Ban, RotateCcw, Check, X } from \"lucide-react\";

export default function Admin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [tab, setTab] = useState(\"users\");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const [s, u, d] = await Promise.all([api.admin.stats(), api.admin.users(), api.admin.deposits()]);
      setStats(s); setUsers(u.users || []); setDeposits(d.items || []);
    } catch (err) {
      toast.error(\"Failed to load admin data\");
    }
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const onBan = async (id, banned) => {
    try {
      if (banned) await api.admin.unban(id); else await api.admin.ban(id);
      toast.success(banned ? \"User unbanned\" : \"User banned\");
      load();
    } catch { toast.error(\"Action failed\"); }
  };
  const onAdjust = async (id) => {
    const v = prompt(\"Amount to add (USD, can be negative):\");
    if (v === null) return;
    const num = Number(v);
    if (Number.isNaN(num)) return toast.error(\"Invalid number\");
    try { await api.admin.adjust(id, num, \"manual adjust\"); toast.success(\"Balance adjusted\"); load(); }
    catch { toast.error(\"Failed\"); }
  };
  const approve = async (id) => { try { await api.admin.approve(id); toast.success(\"Deposit approved\"); load(); } catch (e) { toast.error(e.response?.data?.detail || \"Failed\"); } };
  const reject = async (id) => { try { await api.admin.reject(id); toast.success(\"Deposit rejected\"); load(); } catch { toast.error(\"Failed\"); } };

  const handleLogout = async () => { await logout(); nav(\"/\"); };

  return (
    <div className=\"min-h-screen bg-[#0B0F19] text-white\">
      <header className=\"glass-nav sticky top-0 z-50\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 h-16 flex items-center justify-between\">
          <div className=\"flex items-center gap-3\">
            <div className=\"w-7 h-7 bg-[#F59E0B] flex items-center justify-center rounded-sm\">
              <ShieldCheck className=\"w-4 h-4 text-[#0B0F19]\" />
            </div>
            <span className=\"font-display text-lg font-semibold tracking-tight\">PROCX · Admin</span>
            <span className=\"hidden sm:inline text-xs text-slate-500 font-mono ml-3\">{user?.email}</span>
          </div>
          <button onClick={handleLogout} data-testid=\"admin-logout\" className=\"text-slate-400 hover:text-white border border-[#334155] p-2 rounded-sm\">
            <LogOut className=\"w-4 h-4\" />
          </button>
        </div>
      </header>

      <main className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-8\">
        {/* Stats */}
        <div className=\"grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8\">
          <StatCard icon={Users} label=\"Total users\" value={stats?.total_users ?? \"—\"} testid=\"stat-total-users\" />
          <StatCard icon={Activity} label=\"Live users (2m)\" value={stats?.live_users ?? \"—\"} accent testid=\"stat-live-users\" />
          <StatCard icon={Wallet} label=\"Deposits\" value={stats?.total_deposits ?? \"—\"} testid=\"stat-deposits\" />
          <StatCard icon={Wallet} label=\"Pending\" value={stats?.pending_deposits ?? \"—\"} testid=\"stat-pending\" />
        </div>

        {/* Tabs */}
        <div className=\"flex items-center gap-2 mb-4 border-b border-[#1E293B]\">
          {[
            { k: \"users\", l: \"Users\" },
            { k: \"deposits\", l: \"Deposits\" },
            { k: \"volume\", l: \"Volume\" },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`tab-${t.k}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? \"border-[#007AFF] text-white\" : \"border-transparent text-slate-500 hover:text-white\"}`}>
              {t.l}
            </button>
          ))}
          <div className=\"ml-auto pb-2\">
            <button onClick={() => setShowCreate(true)} className=\"text-xs btn-ghost inline-flex items-center gap-1.5 !py-2\" data-testid=\"create-admin-btn\">
              <Plus className=\"w-3.5 h-3.5\" /> Create admin
            </button>
          </div>
        </div>

        {tab === \"users\" && (
          <div className=\"card-flat overflow-x-auto\">
            <table className=\"w-full text-sm\" data-testid=\"admin-users-table\">
              <thead>
                <tr className=\"text-slate-500 text-xs uppercase tracking-wider\">
                  <th className=\"text-left p-4 font-medium\">Email</th>
                  <th className=\"text-left p-4 font-medium\">Name</th>
                  <th className=\"text-left p-4 font-medium\">Role</th>
                  <th className=\"text-right p-4 font-medium\">Balance</th>
                  <th className=\"text-left p-4 font-medium\">Status</th>
                  <th className=\"text-right p-4 font-medium\">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className=\"border-t border-[#1E293B] hover:bg-[#1A233A]\" data-testid={`user-row-${u.email}`}>
                    <td className=\"p-4 font-mono text-xs\">{u.email}</td>
                    <td className=\"p-4\">{u.name}</td>
                    <td className=\"p-4 text-xs uppercase tracking-wider text-slate-400\">{u.role}</td>
                    <td className=\"p-4 text-right font-mono\">{fmt.usd(u.balance_usd)}</td>
                    <td className=\"p-4\">{u.banned ? <span className=\"text-down text-xs uppercase tracking-wider\">Banned</span> : <span className=\"text-up text-xs uppercase tracking-wider\">Active</span>}</td>
                    <td className=\"p-4 text-right\">
                      <div className=\"inline-flex gap-2\">
                        <button onClick={() => onAdjust(u.id)} className=\"text-xs px-2.5 py-1 border border-[#334155] rounded-sm hover:bg-[#1E293B]\" data-testid={`adjust-${u.email}`}>Balance</button>
                        <button onClick={() => onBan(u.id, u.banned)} className=\"text-xs px-2.5 py-1 border border-[#334155] rounded-sm hover:bg-[#1E293B] inline-flex items-center gap-1\" data-testid={`ban-${u.email}`}>
                          {u.banned ? <><RotateCcw className=\"w-3 h-3\" /> Unban</> : <><Ban className=\"w-3 h-3\" /> Ban</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === \"deposits\" && (
          <div className=\"card-flat overflow-x-auto\">
            <table className=\"w-full text-sm\" data-testid=\"admin-deposits-table\">
              <thead>
                <tr className=\"text-slate-500 text-xs uppercase tracking-wider\">
                  <th className=\"text-left p-4 font-medium\">Date</th>
                  <th className=\"text-left p-4 font-medium\">User</th>
                  <th className=\"text-left p-4 font-medium\">Asset</th>
                  <th className=\"text-right p-4 font-medium\">Amount</th>
                  <th className=\"text-left p-4 font-medium\">Network</th>
                  <th className=\"text-left p-4 font-medium\">Status</th>
                  <th className=\"text-right p-4 font-medium\">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 ? (
                  <tr><td colSpan=\"7\" className=\"p-8 text-center text-slate-500 text-sm\">No deposits yet</td></tr>
                ) : deposits.map(d => (
                  <tr key={d.id} className=\"border-t border-[#1E293B] hover:bg-[#1A233A]\">
                    <td className=\"p-4 font-mono text-xs text-slate-400\">{d.created_at?.slice(0, 19).replace(\"T\", \" \")}</td>
                    <td className=\"p-4 font-mono text-xs\">{d.user_email}</td>
                    <td className=\"p-4 font-medium\">{d.currency}</td>
                    <td className=\"p-4 text-right font-mono\">{d.amount}</td>
                    <td className=\"p-4 font-mono text-xs text-slate-400\">{d.network}</td>
                    <td className=\"p-4 text-xs uppercase tracking-wider\">{d.status}</td>
                    <td className=\"p-4 text-right\">
                      {d.status === \"pending\" && (
                        <div className=\"inline-flex gap-2\">
                          <button onClick={() => approve(d.id)} className=\"text-xs px-2.5 py-1 bg-up-soft text-up border border-[#10B981]/30 rounded-sm inline-flex items-center gap-1\" data-testid={`approve-${d.id}`}>
                            <Check className=\"w-3 h-3\" /> Approve
                          </button>
                          <button onClick={() => reject(d.id)} className=\"text-xs px-2.5 py-1 bg-down-soft text-down border border-[#EF4444]/30 rounded-sm inline-flex items-center gap-1\" data-testid={`reject-${d.id}`}>
                            <X className=\"w-3 h-3\" /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === \"volume\" && (
          <div className=\"grid sm:grid-cols-2 lg:grid-cols-3 gap-4\">
            {(stats?.volume_by_currency || []).map(v => (
              <div key={v.currency} className=\"card-flat p-6\">
                <div className=\"label-eyebrow mb-2\">{v.currency}</div>
                <div className=\"font-mono text-2xl font-semibold\">{Number(v.total).toLocaleString()}</div>
                <div className=\"text-xs text-slate-500 mt-1\">Total deposit volume</div>
              </div>
            ))}
            {!stats?.volume_by_currency?.length && <div className=\"text-sm text-slate-500\">No volume yet</div>}
          </div>
        )}
      </main>

      {showCreate && <CreateAdminModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, testid }) {
  return (
    <div className=\"card-flat p-5\" data-testid={testid}>
      <div className=\"flex items-center justify-between mb-3\">
        <span className=\"label-eyebrow\">{label}</span>
        <Icon className={`w-4 h-4 ${accent ? \"text-[#10B981]\" : \"text-slate-500\"}`} />
      </div>
      <div className=\"font-display text-3xl font-semibold\">{value}</div>
    </div>
  );
}

function CreateAdminModal({ onClose, onCreated }) {
  const [email, setEmail] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [name, setName] = useState(\"\");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.admin.create({ email, password, name });
      toast.success(\"Admin created\");
      onCreated(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || \"Failed\"); }
    finally { setLoading(false); }
  };

  return (
    <div className=\"fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4\" onClick={onClose}>
      <div className=\"card-flat p-6 w-full max-w-sm\" onClick={e => e.stopPropagation()}>
        <h3 className=\"font-display text-xl font-semibold mb-5\">New administrator</h3>
        <form onSubmit={submit} className=\"space-y-3\">
          <input className=\"input-dark font-mono\" placeholder=\"email\" type=\"email\" required value={email} onChange={e => setEmail(e.target.value)} data-testid=\"new-admin-email\" />
          <input className=\"input-dark\" placeholder=\"name\" value={name} onChange={e => setName(e.target.value)} data-testid=\"new-admin-name\" />
          <input className=\"input-dark font-mono\" placeholder=\"password\" type=\"password\" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} data-testid=\"new-admin-password\" />
          <div className=\"flex gap-2 pt-2\">
            <button type=\"button\" onClick={onClose} className=\"btn-ghost flex-1\">Cancel</button>
            <button disabled={loading} className=\"btn-primary flex-1\" data-testid=\"new-admin-submit\">{loading ? \"Creating…\" : \"Create\"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/
