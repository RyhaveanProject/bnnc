import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import "./LiveSupport.css";

/**
 * Floating "Online Support" widget (bottom-right, on every page).
 * Talks over WebSocket to the standalone live-support service whose URL is
 * provided by REACT_APP_LIVE_SUPPORT_URL or /live-support-config.json.
 * The launcher stays visible even when the service is not configured.
 * Other components can open it with: window.dispatchEvent(new Event("open-live-support"))
 */
function supportEndpoint(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const raw = value.trim();
    const url = new URL(/^(https?|wss?):\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password) return "";
    url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
    if (window.location.protocol === "https:" && url.protocol === "ws:") url.protocol = "wss:";
    url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/ws$/, "")}/ws`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Chat still works without browser storage. */ }
}
const SID_KEY = "adx_ls_sid";
const PROFILE_KEY = "adx_ls_profile";

const DICT = {
  az: { title: "Canlı Dəstək", unavailable: "Canlı dəstək hazırda əlçatan deyil. Daha sonra yenidən yoxlayın.", sub: "Adətən bir neçə dəqiqəyə cavab veririk", name: "Adınız", account: "Hesab məlumatı (e-poçt / istifadəçi adı / ID)", message: "Mesajınız", start: "Göndər", type: "Mesaj yazın…", waiting: "Müraciətiniz qəbul edildi. Operator gözlənilir…", active: "Operator", closed: "Söhbət bağlandı", newChat: "Yeni söhbət", connecting: "Qoşulur…", offline: "Bağlantı bərpa olunur…", typing: "operator yazır…", image: "Şəkil", seen: "Oxundu", required: "Bütün xanaları doldurun", tooBig: "Şəkil çox böyükdür" },
  en: { title: "Online Support", unavailable: "Live support is currently unavailable. Please try again later.", sub: "We usually reply in a few minutes", name: "Your name", account: "Account info (email / username / ID)", message: "Your message", start: "Send", type: "Type a message…", waiting: "Request received. Waiting for an operator…", active: "Operator", closed: "Chat closed", newChat: "New chat", connecting: "Connecting…", offline: "Reconnecting…", typing: "operator is typing…", image: "Image", seen: "Seen", required: "Please fill in all fields", tooBig: "Image is too large" },
  ru: { title: "Онлайн поддержка", unavailable: "Онлайн поддержка сейчас недоступна. Попробуйте позже.", sub: "Обычно отвечаем за несколько минут", name: "Ваше имя", account: "Данные аккаунта (email / логин / ID)", message: "Ваше сообщение", start: "Отправить", type: "Напишите сообщение…", waiting: "Запрос принят. Ожидание оператора…", active: "Оператор", closed: "Чат закрыт", newChat: "Новый чат", connecting: "Подключение…", offline: "Восстановление связи…", typing: "оператор печатает…", image: "Фото", seen: "Прочитано", required: "Заполните все поля", tooBig: "Изображение слишком большое" },
  tr: { title: "Canlı Destek", unavailable: "Canlı destek şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.", sub: "Genellikle birkaç dakikada yanıt veririz", name: "Adınız", account: "Hesap bilgisi (e-posta / kullanıcı adı / ID)", message: "Mesajınız", start: "Gönder", type: "Mesaj yazın…", waiting: "Talebiniz alındı. Operatör bekleniyor…", active: "Operatör", closed: "Sohbet kapandı", newChat: "Yeni sohbet", connecting: "Bağlanıyor…", offline: "Yeniden bağlanıyor…", typing: "operatör yazıyor…", image: "Resim", seen: "Okundu", required: "Tüm alanları doldurun", tooBig: "Resim çok büyük" },
};

function newSid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1400;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function LiveSupport() {
  const { i18n } = useTranslation();
  const { user } = useAuth() || {};
  const L = DICT[(i18n.language || "az").slice(0, 2)] || DICT.en;

  const [endpoint, setEndpoint] = useState(() => supportEndpoint(process.env.REACT_APP_LIVE_SUPPORT_URL));
  const [configLoaded, setConfigLoaded] = useState(Boolean(endpoint));
  const [open, setOpen] = useState(false);
  const [conn, setConn] = useState("idle"); // idle | connecting | open | down
  const [session, setSession] = useState(undefined); // undefined = unknown, null = none
  const [unread, setUnread] = useState(0);
  const [typing, setTyping] = useState(false);
  const [seen, setSeen] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [form, setForm] = useState(() => {
    try { return JSON.parse(readStored(PROFILE_KEY)) || { name: "", account: "" }; } catch { return { name: "", account: "" }; }
  });
  const [firstMsg, setFirstMsg] = useState("");

  const wsRef = useRef(null);
  const sidRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimer = useRef(null);
  const connectionTimer = useRef(null);
  const openRef = useRef(open);
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const wantConn = useRef(false);
  openRef.current = open;

  // Public runtime configuration lets static deployments configure chat without rebuilding.
  useEffect(() => {
    if (endpoint) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch("/live-support-config.json", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => { if (!controller.signal.aborted) setEndpoint(supportEndpoint(config?.url)); })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setConfigLoaded(true); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [endpoint]);

  // Prefill from logged-in user
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      name: f.name || user.full_name || user.name || user.username || "",
      account: f.account || [user.email, user.username].filter(Boolean).join(" / "),
    }));
  }, [user]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (!endpoint) return;
    clearTimeout(retryTimer.current);
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    if (!sidRef.current) {
      sidRef.current = readStored(SID_KEY) || newSid();
      store(SID_KEY, sidRef.current);
    }
    wantConn.current = true;
    setConn("connecting");
    let ws;
    try { ws = new WebSocket(`${endpoint}?role=visitor&sid=${encodeURIComponent(sidRef.current)}`); }
    catch {
      setConn("down");
      retryTimer.current = setTimeout(connect, 15000);
      return;
    }
    wsRef.current = ws;
    connectionTimer.current = setTimeout(() => { if (wsRef.current === ws) ws.close(); }, 20000);
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      clearTimeout(connectionTimer.current);
      retryRef.current = 0; setConn("open"); setErr("");
    };
    ws.onerror = () => { if (wsRef.current === ws) setConn("down"); };
    ws.onmessage = (e) => {
      if (wsRef.current !== ws) return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === "state") setSession(d.session);
      else if (d.type === "msg") {
        setSession((s) => (s ? { ...s, messages: [...s.messages, d.message] } : s));
        if (d.message.from === "operator") {
          setTyping(false); setSeen(false);
          if (!openRef.current || document.hidden) setUnread((n) => n + 1);
          else send({ type: "read" });
        }
        if (d.message.from === "visitor") setSeen(false);
      } else if (d.type === "status") setSession((s) => (s ? { ...s, status: d.status, operator: d.operator } : s));
      else if (d.type === "typing") {
        setTyping(true); clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 2500);
      } else if (d.type === "read") setSeen(true);
      else if (d.type === "error") setErr(d.error === "closed" ? L.closed : L.required);
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      clearTimeout(connectionTimer.current);
      wsRef.current = null;
      if (!wantConn.current) return;
      setConn("down");
      const delay = Math.min(15000, 1000 * 2 ** retryRef.current++);
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [send, endpoint, L.closed, L.required]);

  // Resume an existing chat silently in the background (for unread badge)
  useEffect(() => {
    if (endpoint && readStored(SID_KEY)) connect();
    const onOpen = () => setOpen(true);
    window.addEventListener("open-live-support", onOpen);
    const ping = setInterval(() => send({ type: "ping" }), 20000);
    return () => {
      window.removeEventListener("open-live-support", onOpen);
      clearInterval(ping);
      wantConn.current = false;
      clearTimeout(retryTimer.current);
      clearTimeout(connectionTimer.current);
      clearTimeout(typingTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect, send, endpoint]);

  useEffect(() => {
    if (open) { connect(); setUnread(0); send({ type: "read" }); }
  }, [open, connect, send]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [session?.messages?.length, typing, open]);


  const pickImage = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 15 * 1024 * 1024) { setErr(L.tooBig); return; }
    try { setImage(await compressImage(file)); setErr(""); } catch { setErr(L.tooBig); }
  };

  const startChat = (e) => {
    e.preventDefault();
    const name = form.name.trim(), account = form.account.trim(), msg = firstMsg.trim();
    if (!name || !account || (!msg && !image)) { setErr(L.required); return; }
    store(PROFILE_KEY, JSON.stringify({ name, account }));
    if (send({ type: "start", name, account, text: msg, image })) {
      setFirstMsg(""); setImage(null); setErr("");
    } else setErr(L.offline);
  };

  const sendMsg = () => {
    const t = text.trim();
    if (!t && !image) return;
    if (send({ type: "msg", text: t, image })) { setText(""); setImage(null); }
    else setErr(L.offline);
  };

  const newChat = () => {
    wantConn.current = false;
    clearTimeout(retryTimer.current);
    clearTimeout(connectionTimer.current);
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    sidRef.current = newSid();
    store(SID_KEY, sidRef.current);
    setSession(undefined); setUnread(0); setTyping(false); setSeen(false); setErr("");
    setText(""); setFirstMsg(""); setImage(null);
    connect();
  };

  const status = session?.status;
  const statusLine =
    !endpoint && configLoaded ? L.unavailable
      : conn !== "open" ? (conn === "down" ? L.offline : L.connecting)
      : status === "active" ? `${L.active}: ${session.operator || ""}`
      : status === "waiting" ? L.waiting
      : status === "closed" ? L.closed
      : L.sub;

  const ImagePreview = image ? (
    <div className="ls-preview">
      <img src={image} alt="" />
      <button type="button" onClick={() => setImage(null)} aria-label="remove">×</button>
    </div>
  ) : null;

  return createPortal(
    <>
      <button
        type="button"
        className={`ls-fab ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={L.title}
        aria-expanded={open}
        aria-controls="live-support-panel"
        data-testid="live-support-button"
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 014 13.5v-8z" fill="currentColor" /><circle cx="8.5" cy="9.5" r="1.2" fill="var(--yellow)" /><circle cx="12" cy="9.5" r="1.2" fill="var(--yellow)" /><circle cx="15.5" cy="9.5" r="1.2" fill="var(--yellow)" /></svg>
            <span className="ls-fab-label">{L.title}</span>
          </>
        )}
        {!open && unread > 0 && <span className="ls-badge">{unread}</span>}
      </button>

      {open && (
        <div id="live-support-panel" className="ls-panel" role="dialog" aria-label={L.title} data-testid="live-support-panel">
          <header className="ls-head">
            <div className="ls-avatar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M12 3a7 7 0 00-7 7v3a2 2 0 002 2h1v-6H7a5 5 0 0110 0h-1v6h1a2 2 0 002-2v-3a7 7 0 00-7-7z" fill="currentColor" /><path d="M16 17c0 1.5-1.8 3-4 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span className={`ls-dot ${conn === "open" ? "on" : ""}`} />
            </div>
            <div className="ls-head-txt">
              <div className="ls-title">{L.title}</div>
              <div className="ls-sub">{statusLine}</div>
            </div>
            <button type="button" className="ls-x" onClick={() => setOpen(false)} aria-label="close">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </header>

          {!endpoint && configLoaded ? (
            <div className="ls-unavailable" role="status">{L.unavailable}</div>
          ) : session === undefined && conn !== "down" ? (
            <div className="ls-center"><span className="ls-spinner" />{L.connecting}</div>
          ) : !session ? (
            <form className="ls-form" onSubmit={startChat}>
              <label>{L.name}<input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>{L.account}<input value={form.account} maxLength={120} onChange={(e) => setForm({ ...form, account: e.target.value })} /></label>
              <label>{L.message}<textarea rows={4} value={firstMsg} maxLength={4000} onChange={(e) => setFirstMsg(e.target.value)} /></label>
              {ImagePreview}
              {err && <div className="ls-err">{err}</div>}
              <div className="ls-form-actions">
                <label className="ls-icon" title={L.image}>
                  <ClipIcon /><input type="file" accept="image/*" hidden onChange={(e) => { pickImage(e.target.files[0]); e.target.value = ""; }} />
                </label>
                <button type="submit" className="ls-send-btn" disabled={conn !== "open"}>{L.start}</button>
              </div>
            </form>
          ) : (
            <>
              <div className="ls-msgs" ref={listRef}>
                {session.messages.map((m) => (
                  <div key={m.id} className={`ls-msg ls-${m.from}`}>
                    {m.from === "system" ? m.text : (
                      <>
                        {m.image && <img src={m.image} alt="" onClick={() => setLightbox(m.image)} />}
                        {m.text && <div className="ls-text">{m.text}</div>}
                        <div className="ls-time">{fmtTime(m.at)}</div>
                      </>
                    )}
                  </div>
                ))}
                {status === "waiting" && <div className="ls-msg ls-system"><span className="ls-spinner sm" />{L.waiting}</div>}
                {seen && <div className="ls-seen">{L.seen}</div>}
                {typing && <div className="ls-msg ls-operator ls-typing"><i /><i /><i /></div>}
              </div>
              {status === "closed" ? (
                <div className="ls-closed">
                  <span>{L.closed}</span>
                  <button type="button" className="ls-send-btn" onClick={newChat}>{L.newChat}</button>
                </div>
              ) : (
                <div className="ls-compose-wrap">
                  {ImagePreview}
                  {err && <div className="ls-err">{err}</div>}
                  <div className="ls-compose">
                    <label className="ls-icon" title={L.image}>
                      <ClipIcon /><input type="file" accept="image/*" hidden onChange={(e) => { pickImage(e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    <textarea
                      rows={1}
                      value={text}
                      placeholder={L.type}
                      onChange={(e) => { setText(e.target.value); send({ type: "typing" }); }}
                      onPaste={(e) => { const it = [...e.clipboardData.items].find((i) => i.type.startsWith("image/")); if (it) pickImage(it.getAsFile()); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                    />
                    <button type="button" className="ls-send" onClick={sendMsg} disabled={conn !== "open" || (!text.trim() && !image)} aria-label={L.start}>
                      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.2 1l1.7 6.4 8.1 1-8.1 1-1.7 6.4c-.2.7.5 1.3 1.2 1z" fill="currentColor" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {lightbox && (
        <div className="ls-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>,
    document.body
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}
