import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatErr } from "../lib/auth";

export default function Register() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(""); // "wait" | "done"
  const nav = useNavigate();

  // Client-side: must be gmail-like (real email format, common providers OK)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const strongPwd = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!validEmail) return setErr("Please enter a valid email address.");
    if (!strongPwd) return setErr("Password must be 8+ chars and contain letters and numbers.");
    if (password !== confirm) return setErr("Passwords do not match.");
    setLoading(true);
    setPhase("wait");
    try {
      await register(email, password, username);
      setPhase("done");
      setTimeout(() => nav("/trade"), 500);
    } catch (e2) {
      setErr(formatErr(e2));
      setPhase("");
    } finally { setLoading(false); }
  };

  return (
    <div className="hero-bg" style={{minHeight:"calc(100vh - 60px)", display:"grid", placeItems:"center", padding:24}} data-testid="register-page">
      <form onSubmit={onSubmit} className="panel" style={{padding:32, width:"100%", maxWidth:460}}>
        <div className="brand" style={{textAlign:"center", marginBottom:6, fontSize:24}}>
          <span className="b1">ADX</span> <span style={{color:"#fff", fontWeight:600, fontSize:16, marginLeft:4}}>America</span>
        </div>
        <h2 style={{textAlign:"center", margin:"0 0 20px", fontSize:20}}>Create your account</h2>

        <label className="lbl">Username</label>
        <input className="input" value={username} onChange={e=>setUsername(e.target.value)} minLength={3} required data-testid="register-username"/>
        <div style={{height:12}}/>
        <label className="lbl">Email (real address required)</label>
        <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required data-testid="register-email" autoComplete="email"/>
        <div style={{height:12}}/>
        <label className="lbl">Password (8+ chars, letters + numbers)</label>
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required data-testid="register-password" autoComplete="new-password"/>
        <div style={{height:12}}/>
        <label className="lbl">Confirm password</label>
        <input className="input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required data-testid="register-confirm" autoComplete="new-password"/>

        {err && <div className="text-red" style={{marginTop:12, fontSize:13}} data-testid="register-error">{err}</div>}

        {phase === "wait" && (
          <div style={{marginTop:14, padding:12, borderRadius:8, background:"rgba(240,185,11,.08)", color:"var(--yellow)", display:"flex", alignItems:"center", gap:10, fontSize:13}} data-testid="register-wait">
            <span className="spinner"/> Please wait 5 seconds, your account is being created…
          </div>
        )}

        <button className="btn btn-primary" style={{marginTop:18, width:"100%"}} type="submit" disabled={loading} data-testid="register-submit">
          {loading ? <span className="spinner"/> : "Register"}
        </button>

        <div style={{textAlign:"center", marginTop:14, fontSize:13}} className="text-dim">
          Already registered? <Link to="/login" className="text-yellow">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
