import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth, formatErr } from "../lib/auth";

export default function Login({ adminMode = false }) {
  const { login, adminLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const isAdmin = adminMode || loc.pathname === "/admin/login";

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const u = isAdmin ? await adminLogin(email, password) : await login(email, password);
      nav(u.role === "admin" ? "/admin" : "/trade");
    } catch (e2) { setErr(formatErr(e2)); }
    finally { setLoading(false); }
  };

  return (
    <div className="hero-bg" style={{minHeight:"calc(100vh - 60px)", display:"grid", placeItems:"center", padding:24}} data-testid="login-page">
      <form onSubmit={onSubmit} className="panel" style={{padding:32, width:"100%", maxWidth:420}}>
        <div className="brand" style={{textAlign:"center", marginBottom:6, fontSize:24}}>
          <span className="b1">ADX</span> <span style={{color:"#fff", fontWeight:600, fontSize:16, marginLeft:4}}>America</span>
        </div>
        <h2 style={{textAlign:"center", margin:"0 0 24px", fontSize:20}}>
          {isAdmin ? "Admin Login" : "Welcome back"}
        </h2>
        <label className="lbl">Email</label>
        <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required data-testid="login-email" autoComplete="email" />
        <div style={{height:14}}/>
        <label className="lbl">Password</label>
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required data-testid="login-password" autoComplete="current-password"/>
        {err && <div className="text-red" style={{marginTop:12, fontSize:13}} data-testid="login-error">{err}</div>}
        <button className="btn btn-primary" style={{marginTop:20, width:"100%"}} type="submit" disabled={loading} data-testid="login-submit">
          {loading ? <span className="spinner"/> : "Login"}
        </button>
        {!isAdmin && (
          <div style={{textAlign:"center", marginTop:16, fontSize:13}} className="text-dim">
            New here? <Link to="/register" className="text-yellow">Create account</Link>
          </div>
        )}
        {!isAdmin && (
          <div style={{textAlign:"center", marginTop:8, fontSize:12}} className="text-dim">
            <Link to="/admin/login" data-testid="admin-login-link">Admin login</Link>
          </div>
        )}
      </form>
    </div>
  );
}
