import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, formatErr } from "../lib/auth";

export default function Register() {
  const { register, registerVerify, registerResend } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();

  // step: "form" → user fills credentials, "code" → user enters 6-digit OTP
  const [step, setStep] = useState("form");

  // form fields
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // ui state
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // otp state
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const strongPwd = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  // cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [cooldown]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!validEmail) return setErr(t("register.err_valid_email"));
    if (!strongPwd) return setErr(t("register.err_strong_pwd"));
    if (password !== confirm) return setErr(t("register.err_mismatch"));
    setLoading(true);
    try {
      const res = await register(email, password, username);
      if (res?.verified) {
        // legacy/short-circuit path (no email verification required)
        nav("/trade");
        return;
      }
      setStep("code");
      setCooldown(res?.resend_cooldown_sec || 60);
      setInfo(t("register.code_sent"));
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) return setErr(t("register.err_code_format"));
    setLoading(true);
    try {
      await registerVerify(email, code);
      nav("/trade");
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0 || loading) return;
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const res = await registerResend(email);
      setCooldown(res?.resend_cooldown_sec || 60);
      setInfo(t("register.code_resent"));
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setLoading(false);
    }
  };

  const goBackToForm = () => {
    setStep("form");
    setCode("");
    setErr("");
    setInfo("");
  };

  return (
    <div
      className="hero-bg"
      style={{ minHeight: "calc(100vh - 60px)", display: "grid", placeItems: "center", padding: 24 }}
      data-testid="register-page"
    >
      {step === "form" ? (
        <form onSubmit={onSubmit} className="panel" style={{ padding: 32, width: "100%", maxWidth: 460 }}>
          <div className="brand" style={{ textAlign: "center", marginBottom: 6, fontSize: 24 }}>
            <span className="b1">ADX</span>{" "}
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 16, marginLeft: 4 }}>DUBAI</span>
          </div>
          <h2 style={{ textAlign: "center", margin: "0 0 20px", fontSize: 20 }}>{t("register.title")}</h2>

          <label className="lbl">{t("register.username")}</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            required
            data-testid="register-username"
            autoComplete="username"
          />
          <div style={{ height: 12 }} />

          <label className="lbl">{t("register.email")}</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="register-email"
            autoComplete="email"
          />
          <div style={{ height: 12 }} />

          <label className="lbl">{t("register.password")}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-testid="register-password"
            autoComplete="new-password"
          />
          <div style={{ height: 12 }} />

          <label className="lbl">{t("register.confirm")}</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            data-testid="register-confirm"
            autoComplete="new-password"
          />

          {err && (
            <div className="text-red" style={{ marginTop: 12, fontSize: 13 }} data-testid="register-error">
              {err}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: 18, width: "100%" }}
            type="submit"
            disabled={loading}
            data-testid="register-submit"
          >
            {loading ? <span className="spinner" /> : t("register.submit")}
          </button>

          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13 }} className="text-dim">
            {t("register.already")}{" "}
            <Link to="/login" className="text-yellow" data-testid="login-link">
              {t("register.sign_in")}
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={onVerify} className="panel" style={{ padding: 32, width: "100%", maxWidth: 460 }} data-testid="register-verify-panel">
          <div className="brand" style={{ textAlign: "center", marginBottom: 6, fontSize: 24 }}>
            <span className="b1">ADX</span>{" "}
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 16, marginLeft: 4 }}>DUBAI</span>
          </div>
          <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: 20 }}>{t("register.verify_title")}</h2>
          <p className="text-dim" style={{ textAlign: "center", fontSize: 13, margin: "0 0 18px" }}>
            {t("register.verify_subtitle")}{" "}
            <strong style={{ color: "var(--yellow)" }} data-testid="register-verify-email">{email}</strong>
          </p>

          <label className="lbl">{t("register.code_label")}</label>
          <input
            className="input"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            autoFocus
            data-testid="register-code-input"
            style={{ letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: 700 }}
          />

          {err && (
            <div className="text-red" style={{ marginTop: 12, fontSize: 13 }} data-testid="register-verify-error">
              {err}
            </div>
          )}
          {info && !err && (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--yellow)" }} data-testid="register-verify-info">
              {info}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: 18, width: "100%" }}
            type="submit"
            disabled={loading || code.length !== 6}
            data-testid="register-verify-submit"
          >
            {loading ? <span className="spinner" /> : t("register.verify_submit")}
          </button>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <button
              type="button"
              onClick={goBackToForm}
              className="text-dim"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              data-testid="register-verify-back"
            >
              ← {t("register.verify_back")}
            </button>
            <button
              type="button"
              onClick={onResend}
              disabled={cooldown > 0 || loading}
              className={cooldown > 0 ? "text-dim" : "text-yellow"}
              style={{ background: "none", border: "none", padding: 0, cursor: cooldown > 0 ? "not-allowed" : "pointer" }}
              data-testid="register-verify-resend"
            >
              {cooldown > 0
                ? `${t("register.resend_in")} ${cooldown}s`
                : t("register.resend_code")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
