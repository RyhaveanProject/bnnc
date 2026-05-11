
Action: file_editor create /app/frontend/src/pages/Register.jsx --file-text "import React, { useState } from \"react\";
import { Link, useNavigate } from \"react-router-dom\";
import { useAuth } from \"@/context/AuthContext\";
import { toast } from \"sonner\";
import { ArrowLeft } from \"lucide-react\";

function formatErr(detail) {
  if (!detail) return \"Something went wrong\";
  if (typeof detail === \"string\") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(\" · \");
  return String(detail);
}

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(\"\");
  const [email, setEmail] = useState(\"\");
  const [password, setPassword] = useState(\"\");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success(\"Account created\");
      nav(\"/dashboard\");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className=\"min-h-screen grid lg:grid-cols-2 bg-[#0B0F19] text-white\">
      <div className=\"hidden lg:flex relative overflow-hidden grid-bg border-r border-[#1E293B]\">
        <div className=\"relative z-10 p-12 flex flex-col justify-between\">
          <Link to=\"/\" className=\"flex items-center gap-2.5\">
            <div className=\"w-7 h-7 bg-[#007AFF] flex items-center justify-center rounded-sm\">
              <span className=\"font-display font-bold text-white text-sm\">P</span>
            </div>
            <span className=\"font-display text-lg font-semibold tracking-tight\">PROCX</span>
          </Link>
          <div>
            <div className=\"label-eyebrow mb-4\">Open an account</div>
            <h2 className=\"font-display text-4xl font-semibold leading-tight max-w-md\">
              Trade like the desks. Built for retail.
            </h2>
            <p className=\"mt-6 text-slate-400 max-w-md text-sm leading-relaxed\">
              Free to open. Deposit USDT, BTC, ETH, TRX or BNB and start trading in minutes.
            </p>
          </div>
          <div className=\"text-xs text-slate-600 font-mono\">NO-KYC · FAST.ONBOARDING</div>
        </div>
      </div>
      <div className=\"flex items-center justify-center p-6 sm:p-12\">
        <div className=\"w-full max-w-sm\">
          <Link to=\"/\" className=\"text-slate-500 hover:text-white text-sm inline-flex items-center gap-1 mb-8\"><ArrowLeft className=\"w-3.5 h-3.5\" /> Back</Link>
          <h1 className=\"font-display text-3xl font-semibold mb-2\">Create account</h1>
          <p className=\"text-slate-400 text-sm mb-8\">Already have one? <Link to=\"/login\" className=\"text-[#007AFF] hover:underline\" data-testid=\"to-login\">Sign in</Link></p>
          <form onSubmit={submit} className=\"space-y-4\">
            <div>
              <label className=\"label-eyebrow block mb-2\">Display name</label>
              <input type=\"text\" value={name} onChange={e => setName(e.target.value)} className=\"input-dark\" placeholder=\"Jordan Trader\" data-testid=\"register-name\" />
            </div>
            <div>
              <label className=\"label-eyebrow block mb-2\">Email</label>
              <input type=\"email\" required value={email} onChange={e => setEmail(e.target.value)} className=\"input-dark font-mono\" placeholder=\"you@example.com\" data-testid=\"register-email\" />
            </div>
            <div>
              <label className=\"label-eyebrow block mb-2\">Password</label>
              <input type=\"password\" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className=\"input-dark font-mono\" placeholder=\"At least 6 characters\" data-testid=\"register-password\" />
            </div>
            <button disabled={loading} className=\"btn-primary w-full\" data-testid=\"register-submit\">
              {loading ? \"Creating…\" : \"Create account\"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/
