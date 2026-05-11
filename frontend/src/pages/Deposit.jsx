import React, { useEffect, useMemo, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import api, { SUPPORTED_CRYPTOS, COIN_NAMES } from "../lib/api";
import { formatErr } from "../lib/auth";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const RECEIPT_WINDOW_SEC = 5 * 60; // 5 minutes

function StatusPill({ s }) {
  const map = {
    pending: { cls: "pending", label: "Pending" },
    completed: { cls: "approved", label: "Completed" },
    approved: { cls: "approved", label: "Completed" },
    rejected: { cls: "rejected", label: "Rejected" },
  };
  const m = map[s] || { cls: "", label: s };
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

function Countdown({ deadline, onExpire }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, Math.floor((deadline - now) / 1000));
  const m = String(Math.floor(remain / 60)).padStart(2, "0");
  const s = String(remain % 60).padStart(2, "0");
  useEffect(() => {
    if (remain === 0 && typeof onExpire === "function") onExpire();
  }, [remain, onExpire]);
  const danger = remain < 60;
  return (
    <div
      data-testid="dep-countdown"
      style={{
        fontWeight: 700,
        fontSize: 18,
        color: danger ? "#ff6b6b" : "var(--text)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {m}:{s}
    </div>
  );
}

export default function Deposit() {
  const [wallets, setWallets] = useState([]);
  const [currency, setCurrency] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState(null);
  const [copied, setCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [history, setHistory] = useState([]);
  const fileInputRef = useRef(null);

  const loadWallets = async () => {
    try {
      const { data } = await api.get("/wallets");
      setWallets(data || []);
    } catch (e) {
      // non-fatal
    }
  };
  const loadHistory = async () => {
    try {
      const { data } = await api.get("/deposits/me");
      setHistory(data || []);
    } catch {
      /* */
    }
  };
  useEffect(() => {
    loadWallets();
    loadHistory();
    const t = setInterval(loadHistory, 10000);
    return () => clearInterval(t);
  }, []);

  const wallet = useMemo(
    () => wallets.find((w) => w.currency === currency),
    [wallets, currency]
  );

  const onCreate = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setErr("Please enter a valid amount");
      return;
    }
    if (!wallet?.address) {
      setErr("Wallet not configured for this currency");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/deposits/create", {
        currency,
        amount: amt,
      });
      setDeposit(data.deposit);
      setReceiptFile(null);
      setReceiptPreview("");
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr("");
    if (!ALLOWED_TYPES.includes(f.type)) {
      setErr("Only image files (JPEG, PNG, WEBP, GIF) are allowed");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setErr(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
      e.target.value = "";
      return;
    }
    setReceiptFile(f);
    const reader = new FileReader();
    reader.onload = () => setReceiptPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const onSubmitReceipt = async () => {
    if (!deposit || !receiptFile) {
      setErr("Please upload the receipt screenshot first");
      return;
    }
    setErr("");
    setMsg("");
    setBusy(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", receiptFile);
      const { data } = await api.post(
        `/deposits/${deposit.id}/upload-receipt`,
        fd,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
          },
        }
      );
      setMsg("Receipt submitted successfully. Pending admin approval.");
      setDeposit(null);
      setReceiptFile(null);
      setReceiptPreview("");
      setAmount("");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Optimistically prepend new pending row
      if (data?.deposit) setHistory((h) => [data.deposit, ...h.filter((x) => x.id !== data.deposit.id)]);
      await loadHistory();
    } catch (e2) {
      setErr(formatErr(e2));
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const cancelDeposit = () => {
    setDeposit(null);
    setReceiptFile(null);
    setReceiptPreview("");
    setErr("");
    setMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deadlineMs = useMemo(() => {
    if (!deposit?.expires_at) return null;
    return new Date(deposit.expires_at).getTime();
  }, [deposit]);

  const onCountdownExpire = () => {
    setErr("Upload window expired (5 minutes). The deposit has been cancelled.");
    setDeposit(null);
    setReceiptFile(null);
    setReceiptPreview("");
    loadHistory();
  };

  return (
    <div
      data-testid="deposit-page"
      style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}
      className="container-pad"
    >
      <h1 style={{ margin: "0 0 24px" }}>Deposit</h1>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
        className="dep-grid"
      >
        {/* LEFT: form / receipt upload */}
        <div className="panel" style={{ padding: 24 }}>
          {!deposit ? (
            <>
              <div className="lbl">Select Token</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {SUPPORTED_CRYPTOS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    data-testid={`dep-coin-${c}`}
                    className={`btn btn-sm ${currency === c ? "btn-primary" : "btn-ghost"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <form onSubmit={onCreate}>
                <label className="lbl">Amount ({currency})</label>
                <input
                  className="input"
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  data-testid="dep-amount"
                />
                <div style={{ height: 14 }} />
                <label className="lbl">
                  Wallet Address ({wallet?.network || currency})
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    value={wallet?.address || ""}
                    readOnly
                    data-testid="dep-wallet"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={copy}
                    data-testid="dep-copy"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
                  {wallet?.qr_image_b64 ? (
                    <img
                      src={wallet.qr_image_b64}
                      alt="qr"
                      style={{ width: 180, height: 180, background: "#fff", padding: 6, borderRadius: 8 }}
                      data-testid="dep-qr-img"
                    />
                  ) : wallet?.address ? (
                    <div
                      style={{ background: "#fff", padding: 10, borderRadius: 8 }}
                      data-testid="dep-qr-gen"
                    >
                      <QRCodeSVG value={wallet.address} size={180} />
                    </div>
                  ) : (
                    <div className="text-dim">Wallet not configured</div>
                  )}
                </div>
                {err && (
                  <div className="text-red" style={{ marginTop: 12, fontSize: 13 }} data-testid="dep-err">
                    {err}
                  </div>
                )}
                {msg && (
                  <div className="text-green" style={{ marginTop: 10, fontSize: 13 }} data-testid="dep-msg">
                    {msg}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ marginTop: 18, width: "100%" }}
                  disabled={busy || !wallet?.address}
                  data-testid="dep-create"
                >
                  {busy ? <span className="spinner" /> : "Continue"}
                </button>
              </form>
            </>
          ) : (
            <div data-testid="dep-receipt-step">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                  padding: 12,
                  background: "rgba(255, 200, 0, 0.08)",
                  border: "1px solid rgba(255, 200, 0, 0.3)",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Upload window</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    Receipt must be uploaded within 5 minutes
                  </div>
                </div>
                {deadlineMs && (
                  <Countdown deadline={deadlineMs} onExpire={onCountdownExpire} />
                )}
              </div>

              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                Deposit Receipt
              </div>

              <div className="dep-summary" style={{ fontSize: 13, marginBottom: 14 }}>
                <SummaryRow label="Date" value={new Date(deposit.created_at).toLocaleString()} testid="dep-sum-date" />
                <SummaryRow label="Token" value={`${deposit.currency} (${COIN_NAMES[deposit.currency] || deposit.currency})`} testid="dep-sum-token" />
                <SummaryRow label="Amount" value={`${deposit.amount} ${deposit.currency}`} testid="dep-sum-amount" />
                <SummaryRow label="Wallet Address" value={deposit.wallet_address} mono testid="dep-sum-wallet" />
                <SummaryRow label="Network" value={deposit.network || deposit.currency} testid="dep-sum-network" />
                <SummaryRow label="Status" value={<StatusPill s={deposit.status} />} testid="dep-sum-status" />
              </div>

              <label className="lbl">Upload payment receipt screenshot</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                onChange={onPickFile}
                data-testid="dep-receipt-file"
              />
              {receiptPreview && (
                <img
                  src={receiptPreview}
                  alt="receipt preview"
                  style={{ maxWidth: "100%", marginTop: 10, borderRadius: 8 }}
                  data-testid="dep-receipt-preview"
                />
              )}
              {busy && uploadProgress > 0 && (
                <div style={{ marginTop: 10, fontSize: 12 }} className="text-dim">
                  Uploading… {uploadProgress}%
                </div>
              )}
              {err && (
                <div className="text-red" style={{ marginTop: 10, fontSize: 13 }} data-testid="dep-receipt-err">
                  {err}
                </div>
              )}
              {msg && (
                <div className="text-green" style={{ marginTop: 10, fontSize: 13 }}>
                  {msg}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cancelDeposit}
                  disabled={busy}
                  data-testid="dep-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onSubmitReceipt}
                  disabled={busy || !receiptFile}
                  data-testid="dep-submit-receipt"
                >
                  {busy ? <span className="spinner" /> : "Continue"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: history */}
        <div className="panel" style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Recent Deposits</div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" data-testid="dep-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Token</th>
                  <th>Amount</th>
                  <th>Wallet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-dim">
                      No deposits yet
                    </td>
                  </tr>
                )}
                {history.map((h) => (
                  <tr key={h.id} data-testid={`dep-row-${h.id}`}>
                    <td style={{ fontSize: 12 }}>
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                    <td>{h.currency}</td>
                    <td>
                      {h.amount} {h.currency}
                    </td>
                    <td
                      style={{
                        fontSize: 11,
                        maxWidth: 140,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={h.wallet_address}
                    >
                      {h.wallet_address}
                    </td>
                    <td>
                      <StatusPill s={h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) { .dep-grid { grid-template-columns: 1fr !important; } }
        .dep-summary > div { display:flex; gap:10px; padding:6px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); }
        .dep-summary > div:last-child { border-bottom: 0; }
        .dep-summary .k { color: var(--text-dim); min-width: 120px; }
        .dep-summary .v { word-break: break-all; flex: 1; }
        .dep-summary .v.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      `}</style>
    </div>
  );
}

function SummaryRow({ label, value, mono, testid }) {
  return (
    <div data-testid={testid}>
      <div className="k">{label}</div>
      <div className={`v ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}
