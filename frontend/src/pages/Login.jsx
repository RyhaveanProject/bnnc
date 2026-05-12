import React, { useState } from \"react\";
import { Link, useNavigate } from \"react-router-dom\";
import { useTranslation } from \"react-i18next\";
import { useAuth, formatErr } from \"../lib/auth\";

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(\"\");
    setLoading(true);
    try {
      const u = await login(email, password);
      nav(u.role === \"admin\" ? \"/admin\" : \"/trade\");
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className=\"hero-bg\"
      style={{ minHeight: \"calc(100vh - 60px)\", display: \"grid\", placeItems: \"center\", padding: 24 }}
      data-testid=\"login-page\"
    >
      <form onSubmit={onSubmit} className=\"panel\" style={{ padding: 32, width: \"100%\", maxWidth: 420 }}>
        <div className=\"brand\" style={{ textAlign: \"center\", marginBottom: 6, fontSize: 24 }}>
          <span className=\"b1\">ADX</span>{\" \"}
          <span style={{ color: \"#fff\", fontWeight: 600, fontSize: 16, marginLeft: 4 }}>DUBAI</span>
        </div>
        <h2 style={{ textAlign: \"center\", margin: \"0 0 24px\", fontSize: 20 }}>{t(\"login.welcome_back\")}</h2>

        <label className=\"lbl\">{t(\"login.email\")}</label>
        <input
          className=\"input\"
          type=\"email\"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          data-testid=\"login-email\"
          autoComplete=\"email\"
        />

        <div style={{ height: 14 }} />

        <label className=\"lbl\">{t(\"login.password\")}</label>
        <input
          className=\"input\"
          type=\"password\"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          data-testid=\"login-password\"
          autoComplete=\"current-password\"
        />

        {err && (
          <div className=\"text-red\" style={{ marginTop: 12, fontSize: 13 }} data-testid=\"login-error\">
            {err}
          </div>
        )}

        <button
          className=\"btn btn-primary\"
          style={{ marginTop: 20, width: \"100%\" }}
          type=\"submit\"
          disabled={loading}
          data-testid=\"login-submit\"
        >
          {loading ? <span className=\"spinner\" /> : t(\"login.submit\")}
        </button>

        <div style={{ textAlign: \"center\", marginTop: 16, fontSize: 13 }} className=\"text-dim\">
          {t(\"login.new_here\")}{\" \"}
          <Link to=\"/register\" className=\"text-yellow\" data-testid=\"register-link\">
            {t(\"login.create_account\")}
          </Link>
        </div>
      </form>
    </div>
  );
}
