import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Shield } from "lucide-react";

function formatErr(detail) {
  if (!detail) return "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" · ");
  return String(detail);
}

export default function AdminLogin() {
  const { adminLogin } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminLogin(email, password);
      toast.success("Administrator authenticated");
      nav("/admin");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] text-white p-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-slate-500 hover:text-white text-sm inline-flex items-center gap-1 mb-8"><ArrowLeft className="w-3.5 h-3.5" /> Back to site</Link>
        <div className="card-flat p-8">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-10 h-10 bg-[#1A233A] border border-[#334155] flex items-center justify-center rounded-sm">
              <Shield className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <div className="font-display text-xl font-semibold">Administrator</div>
              <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Restricted area</div>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-2">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-dark font-mono" placeholder="admin@procrypto.io" data-testid="admin-login-email" />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-dark font-mono" placeholder="••••••••" data-testid="admin-login-password" />
            </div>
            <button disabled={loading} className="btn-primary w-full" data-testid="admin-login-submit">
              {loading ? "Authenticating…" : "Enter admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
