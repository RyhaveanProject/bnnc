 
Action: file_editor create /app/frontend/src/ --file-text "import React, { useState } from \"react\";
import { Link, useNavigate } from \"react-router-dom\";
import { useAuth, formatError } from \"./auth\";
import MarketTicker from \"./MarketTicker\";
import Navbar from \"./Navbar\";

export function Landing() {
  return (
    <div className=\"hero-gradient\" style={{ minHeight: \"100vh\" }}>
      <Navbar />
      <MarketTicker />
      <section style={{ maxWidth: 1240, margin: \"0 auto\", padding: \"80px 24px\" }}>
        <div style={{ display: \"grid\", gridTemplateColumns: \"1fr 1fr\", gap: 48, alignItems: \"center\" }}>
          <div>
            <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, margin: 0, letterSpacing: \"-0.02em\" }}>
              Trade crypto<br/>
              <span className=\"gold-text\">with confidence</span>
            </h1>
            <p style={{ color: \"var(--bnnc-text-dim)\", fontSize: 18, marginTop: 24, maxWidth: 480 }}>
              BNNC Exchange — sürətli, təhlükəsiz və peşəkar kripto ticarət platforması. USDT, BTC, ETH, TRX, BNB ilə alış-satış, deposit və withdraw.
            </p>
            <div style={{ display: \"flex\", gap: 12, marginTop: 32 }}>
              <Link to=\"/register\" data-testid=\"hero-register-btn\">
                <button className=\"bnnc-btn\" style={{ padding: \"14px 28px\", fontSize: 16 }}>Start Trading</button>
              </Link>
              <Link to=\"/markets\" data-testid=\"hero-markets-btn\">
                <button className=\"bnnc-btn-ghost bnnc-btn\" style={{ padding: \"14px 28px\", fontSize: 16 }}>View Markets</button>
              </Link>
            </div>
            <div style={{ display: \"flex\", gap: 48, marginTop: 64 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>$1.2B+</div>
                <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>24h Volume</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>500K+</div>
                <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>Active Users</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>5+</div>
                <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>Crypto Assets</div>
              </div>
            </div>
          </div>
          <div className=\"bnnc-card\" style={{ padding: 24 }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Live Markets</h3>
            <MarketPreview />
          </div>
        </div>
      </section>
    </div>
  );
}

import client from \"./api\";
import Sparkline from \"./Sparkline\";

function MarketPreview() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const load = async () => {
      try {
        const { data } = await client.get(\"/market\");
        setItems((data.data || []).filter((c) => [\"BTC\", \"ETH\", \"BNB\", \"XRP\", \"SOL\"].includes(c.symbol)));
      } catch {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);
  return (
    <table className=\"bnnc-table\">
      <thead><tr><th>Pair</th><th>Price</th><th>24h</th><th>Chart</th></tr></thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.symbol}>
            <td><strong>{c.symbol}</strong>/USDT</td>
            <td>${c.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td className={c.change_24h >= 0 ? \"text-up\" : \"text-down\"}>{c.change_24h?.toFixed(2)}%</td>
            <td><Sparkline data={c.sparkline} up={c.change_24h >= 0} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(\"\");
    setLoading(true);
    try {
      await login(email, password);
      nav(\"/wallet\");
    } catch (er) {
      setErr(formatError(er));
    } finally { setLoading(false); }
  };
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 420, margin: \"80px auto\", padding: 24 }}>
        <div className=\"bnnc-card\" style={{ padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>Login</h2>
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Email</label>
            <input className=\"bnnc-input\" type=\"email\" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"login-email\"/>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Şifrə</label>
            <input className=\"bnnc-input\" type=\"password\" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"login-password\"/>
            {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 12 }} data-testid=\"login-error\">{err}</div>}
            <button className=\"bnnc-btn\" type=\"submit\" disabled={loading} style={{ width: \"100%\" }} data-testid=\"login-submit\">
              {loading ? \"Loading...\" : \"Login\"}
            </button>
          </form>
          <div style={{ marginTop: 16, fontSize: 13, color: \"var(--bnnc-text-dim)\" }}>
            Hesabınız yoxdur? <Link to=\"/register\">Qeydiyyat</Link>
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <Link to=\"/admin-login\" data-testid=\"admin-login-link\">Admin Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(\"\");
  const [username, setUsername] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [confirm, setConfirm] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    setErr(\"\");
    if (password !== confirm) {
      setErr(\"Şifrələr eyni deyil\");
      return;
    }
    if (!/^[^@\s]+@(gmail|yahoo|outlook|hotmail|proton|icloud)\.com$/i.test(email) && !/@gmail\.com$/i.test(email)) {
      // accept any real-looking email - basic check
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setErr(\"Düzgün email daxil edin\");
        return;
      }
    }
    setLoading(true);
    setCountdown(5);
    // Start 5-second countdown
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, 5 - elapsed);
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    try {
      // Wait for at least 5 seconds while registering
      const registerPromise = register(email, username, password);
      const delayPromise = new Promise((r) => setTimeout(r, 5000));
      await Promise.all([registerPromise, delayPromise]);
      clearInterval(interval);
      nav(\"/wallet\");
    } catch (er) {
      clearInterval(interval);
      setErr(formatError(er));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 460, margin: \"60px auto\", padding: 24 }}>
        <div className=\"bnnc-card\" style={{ padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>Qeydiyyat</h2>
          <p style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13, marginTop: 0 }}>Real email və güclü şifrə daxil edin</p>
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Email (real)</label>
            <input className=\"bnnc-input\" type=\"email\" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"register-email\" placeholder=\"you@gmail.com\"/>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>İstifadəçi adı</label>
            <input className=\"bnnc-input\" value={username} onChange={(e)=>setUsername(e.target.value)} required minLength={3} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"register-username\"/>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Şifrə (min 8, A-Z, a-z, 0-9)</label>
            <input className=\"bnnc-input\" type=\"password\" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"register-password\"/>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Şifrə təsdiq</label>
            <input className=\"bnnc-input\" type=\"password\" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"register-confirm\"/>
            {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 12 }} data-testid=\"register-error\">{err}</div>}
            {loading && (
              <div style={{ display: \"flex\", alignItems: \"center\", gap: 12, padding: 14, background: \"var(--bnnc-panel-2)\", borderRadius: 6, marginBottom: 14 }} data-testid=\"register-loading\">
                <div className=\"spinner\" />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Hesab yaradılır...</div>
                  <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Gözləyin: {countdown.toFixed(1)}s</div>
                </div>
              </div>
            )}
            <button className=\"bnnc-btn\" type=\"submit\" disabled={loading} style={{ width: \"100%\" }} data-testid=\"register-submit\">
              {loading ? \"Register olunur...\" : \"Register\"}
            </button>
          </form>
          <div style={{ marginTop: 16, fontSize: 13, color: \"var(--bnnc-text-dim)\" }}>
            Hesabınız var? <Link to=\"/login\">Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminLogin() {
  const { adminLogin } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(\"\");
    setLoading(true);
    try {
      await adminLogin(email, password);
      nav(\"/admin\");
    } catch (er) {
      setErr(formatError(er));
    } finally { setLoading(false); }
  };
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 420, margin: \"80px auto\", padding: 24 }}>
        <div className=\"bnnc-card\" style={{ padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>🔐 Admin Login</h2>
          <form onSubmit={submit}>
            <input className=\"bnnc-input\" type=\"email\" placeholder=\"Admin Email\" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ marginBottom: 14 }} data-testid=\"admin-login-email\"/>
            <input className=\"bnnc-input\" type=\"password\" placeholder=\"Password\" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ marginBottom: 14 }} data-testid=\"admin-login-password\"/>
            {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 12 }} data-testid=\"admin-login-error\">{err}</div>}
            <button className=\"bnnc-btn\" type=\"submit\" disabled={loading} style={{ width: \"100%\" }} data-testid=\"admin-login-submit\">{loading ? \"...\" : \"Admin Login\"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/pages_auth.jsx
