import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "../i18n";

/**
 * Professional language selector.
 * Shows the active language as Flag + uppercase ISO code (e.g. 🇦🇿 AZ).
 * Persists selection via i18next-browser-languagedetector
 * (localStorage key "adx_lang" + cookie "adx_lang").
 */
export default function LanguageSelector({ compact = false }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const current =
    SUPPORTED_LANGS.find((l) => l.code === i18n.language) ||
    SUPPORTED_LANGS.find((l) => i18n.language && i18n.language.startsWith(l.code)) ||
    SUPPORTED_LANGS[0];

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const change = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className="lang-selector"
      data-testid="language-selector"
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("lang.select", "Select language")}
        title={t("lang.select", "Select language")}
        data-testid="language-selector-toggle"
        className="lang-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: compact ? "5px 9px" : "6px 12px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
          transition: "background-color .15s ease, border-color .15s ease",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">
          {current.flag}
        </span>
        <span style={{ letterSpacing: 0.5 }}>{current.code.toUpperCase()}</span>
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .15s ease",
            fontSize: 10,
            opacity: 0.7,
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          data-testid="language-selector-menu"
          className="lang-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: "var(--panel, #161a20)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            padding: 6,
            zIndex: 1000,
            listStyle: "none",
            margin: 0,
          }}
        >
          {SUPPORTED_LANGS.map((l) => {
            const active = l.code === current.code;
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => change(l.code)}
                  data-testid={`language-option-${l.code}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    background: active ? "rgba(240,185,11,0.10)" : "transparent",
                    border: "none",
                    color: "var(--text)",
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">
                    {l.flag}
                  </span>
                  <span style={{ fontWeight: 600, minWidth: 28 }}>
                    {l.code.toUpperCase()}
                  </span>
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    {l.label}
                  </span>
                  {active && (
                    <span
                      style={{ marginLeft: "auto", color: "var(--yellow, #f0b90b)" }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
