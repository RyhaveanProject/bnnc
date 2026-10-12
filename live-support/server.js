/**
 * ADX Live Support — standalone realtime chat service (Render free web service).
 *
 *  GET  /            -> operator panel (password protected via OPERATOR_PASSWORD)
 *  GET  /health      -> health check
 *  WS   /ws?role=visitor&sid=<id>
 *  WS   /ws?role=operator&token=<OPERATOR_PASSWORD>
 *
 * Data is kept in memory and mirrored to ./data/sessions.json (best effort).
 * Render free instances restart/sleep, so very old chats may be lost.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || "change-me";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",").map((s) => s.trim()).filter(Boolean);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 4000;
const DATA_FILE = path.join(__dirname, "data", "sessions.json");

/** @type {Map<string, any>} */
const sessions = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  for (const s of raw) sessions.set(s.id, s);
} catch (_) {}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([...sessions.values()]));
    } catch (e) { console.error("persist failed", e.message); }
  }, 500);
}

const visitors = new Map(); // sid -> Set<ws>
const operators = new Set();

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function toVisitor(sid, obj) { (visitors.get(sid) || []).forEach((ws) => send(ws, obj)); }
function toOperators(obj) { operators.forEach((ws) => send(ws, obj)); }

function summary(s) {
  const last = s.messages[s.messages.length - 1];
  return {
    id: s.id, name: s.name, account: s.account, status: s.status,
    operator: s.operator, createdAt: s.createdAt, updatedAt: s.updatedAt,
    unread: s.messages.filter((m) => m.from === "visitor" && !m.read).length,
    online: (visitors.get(s.id)?.size || 0) > 0,
    last: last ? { from: last.from, text: last.text, image: !!last.image, at: last.at } : null,
  };
}
function visitorView(s) {
  return { id: s.id, status: s.status, operator: s.operator, name: s.name, messages: s.messages };
}

function cleanText(t) { return typeof t === "string" ? t.slice(0, MAX_TEXT).trim() : ""; }
function cleanImage(img) {
  if (typeof img !== "string" || !img) return null;
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/.test(img)) return null;
  if (img.length * 0.75 > MAX_IMAGE_BYTES) return null;
  return img;
}

function addMessage(s, from, text, image, extra = {}) {
  const msg = { id: crypto.randomUUID(), from, text, image, at: Date.now(), read: false, ...extra };
  s.messages.push(msg);
  s.updatedAt = msg.at;
  persist();
  toVisitor(s.id, { type: "msg", message: msg });
  toOperators({ type: "msg", sid: s.id, message: msg });
  toOperators({ type: "session", session: summary(s) });
  return msg;
}
function setStatus(s, status, operator) {
  s.status = status;
  if (operator !== undefined) s.operator = operator;
  s.updatedAt = Date.now();
  persist();
  toVisitor(s.id, { type: "status", status: s.status, operator: s.operator });
  toOperators({ type: "session", session: summary(s) });
}

// ---------- HTTP ----------
const panelHtml = () => fs.readFileSync(path.join(__dirname, "public", "operator.html"));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === "/" || url.pathname === "/operator") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    return res.end(panelHtml());
  }
  res.writeHead(404); res.end("Not found");
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 6 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/ws") return socket.destroy();
  const role = url.searchParams.get("role");
  const origin = req.headers.origin || "";
  if (role === "visitor" && !ALLOWED_ORIGINS.includes("*") && !ALLOWED_ORIGINS.includes(origin)) {
    return socket.destroy();
  }
  if (role === "operator") {
    const token = url.searchParams.get("token") || "";
    const a = Buffer.from(token), b = Buffer.from(OPERATOR_PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
  }
  const sid = url.searchParams.get("sid") || "";
  if (role === "visitor" && !/^[a-zA-Z0-9-]{16,64}$/.test(sid)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.role = role; ws.sid = sid; ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    role === "operator" ? onOperator(ws, url) : onVisitor(ws);
  });
});

function onVisitor(ws) {
  const sid = ws.sid;
  if (!visitors.has(sid)) visitors.set(sid, new Set());
  visitors.get(sid).add(ws);
  const existing = sessions.get(sid);
  send(ws, { type: "state", session: existing ? visitorView(existing) : null });
  if (existing) toOperators({ type: "session", session: summary(existing) });

  ws.on("message", (raw) => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.type === "ping") return send(ws, { type: "pong" });
    if (d.type === "start") {
      const name = cleanText(d.name).slice(0, 80);
      const account = cleanText(d.account).slice(0, 120);
      const text = cleanText(d.text); const image = cleanImage(d.image);
      if (!name || !account || (!text && !image)) return send(ws, { type: "error", error: "invalid" });
      let s = sessions.get(sid);
      if (!s || s.status === "closed") {
        s = { id: sid, name, account, status: "waiting", operator: null,
          createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
        sessions.set(sid, s);
      }
      visitors.get(sid).forEach((v) => send(v, { type: "state", session: visitorView(s) }));
      addMessage(s, "visitor", text, image);
      toOperators({ type: "new_session", session: summary(s) });
      return;
    }
    const s = sessions.get(sid);
    if (!s) return;
    if (d.type === "msg") {
      if (s.status === "closed") return send(ws, { type: "error", error: "closed" });
      const text = cleanText(d.text); const image = cleanImage(d.image);
      if (!text && !image) return;
      addMessage(s, "visitor", text, image);
    } else if (d.type === "read") {
      let changed = false;
      s.messages.forEach((m) => { if (m.from === "operator" && !m.read) { m.read = true; changed = true; } });
      if (changed) { persist(); toOperators({ type: "read", sid, by: "visitor" }); }
    } else if (d.type === "typing") {
      toOperators({ type: "typing", sid });
    }
  });
  ws.on("close", () => {
    visitors.get(sid)?.delete(ws);
    const s = sessions.get(sid);
    if (s) toOperators({ type: "session", session: summary(s) });
  });
}

function onOperator(ws, url) {
  ws.opName = (url.searchParams.get("name") || "Operator").slice(0, 40);
  operators.add(ws);
  const list = [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300).map(summary);
  send(ws, { type: "sessions", sessions: list });

  ws.on("message", (raw) => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.type === "ping") return send(ws, { type: "pong" });
    const s = sessions.get(d.sid);
    if (!s) return;
    if (d.type === "open") {
      send(ws, { type: "history", sid: s.id, session: summary(s), messages: s.messages });
    } else if (d.type === "accept") {
      if (s.status === "active" && s.operator && s.operator !== ws.opName) return;
      setStatus(s, "active", ws.opName);
      addMessage(s, "system", `${ws.opName} söhbətə qoşuldu`, null);
    } else if (d.type === "read") {
      let changed = false;
      s.messages.forEach((m) => { if (m.from === "visitor" && !m.read) { m.read = true; changed = true; } });
      if (changed) { persist(); toVisitor(s.id, { type: "read" }); toOperators({ type: "session", session: summary(s) }); }
    } else if (d.type === "msg") {
      if (s.status !== "active") setStatus(s, "active", ws.opName);
      const text = cleanText(d.text); const image = cleanImage(d.image);
      if (!text && !image) return;
      addMessage(s, "operator", text, image, { operator: ws.opName });
    } else if (d.type === "close") {
      addMessage(s, "system", "Söhbət operator tərəfindən bağlandı", null);
      setStatus(s, "closed");
    } else if (d.type === "delete") {
      sessions.delete(s.id); persist();
      toVisitor(s.id, { type: "state", session: null });
      toOperators({ type: "deleted", sid: s.id });
    } else if (d.type === "typing") {
      toVisitor(s.id, { type: "typing" });
    }
  });
  ws.on("close", () => operators.delete(ws));
}

// keep-alive (Render proxies drop idle sockets)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 25000);

server.listen(PORT, () => console.log(`Live support listening on :${PORT}`));
