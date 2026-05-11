
Action: file_editor create /app/frontend/src/pages/Deposit.jsx --file-text "import React, { useEffect, useMemo, useState } from \"react\";
import { QRCodeSVG } from \"qrcode.react\";
import api, { SUPPORTED_CRYPTOS, fmtMoney } from \"../lib/api\";
import { formatErr } from \"../lib/auth\";

export default function Deposit() {
  const [wallets, setWallets] = useState([]);
  const [currency, setCurrency] = useState(\"USDT\");
  const [amount, setAmount] = useState(\"\");
  const [deposit, setDeposit] = useState(null);
  const [copied, setCopied] = useState(false);
  const [receipt, setReceipt] = useState(null); // base64
  const [err, setErr] = useState(\"\");
  const [msg, setMsg] = useState(\"\");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const loadWallets = async () => {
    const { data } = await api.get(\"/wallets\");
    setWallets(data);
  };
  const loadHistory = async () => {
    const { data } = await api.get(\"/deposits/me\");
    setHistory(data);
  };
  useEffect(() => { loadWallets(); loadHistory(); }, []);

  const wallet = useMemo(() => wallets.find(w => w.currency === currency), [wallets, currency]);

  const onCreate = async (e) => {
    e.preventDefault();
    setErr(\"\"); setMsg(\"\"); setBusy(true);
    try {
      const { data } = await api.post(\"/deposits/create\", { currency, amount: parseFloat(amount) });
      setDeposit(data.deposit);
    } catch (e2) { setErr(formatErr(e2)); }
    finally { setBusy(false); }
  };

  const copy = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const onReceipt = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setReceipt(reader.result);
    reader.readAsDataURL(f);
  };

  const onConfirm = async () => {
    if (!deposit || !receipt) { setErr(\"Please upload receipt image\"); return; }
    setErr(\"\"); setMsg(\"\"); setBusy(true);
    try {
      await api.post(\"/deposits/confirm\", { deposit_id: deposit.id, receipt_b64: receipt });
      setMsg(\"Receipt submitted. Pending admin approval.\");
      setDeposit(null); setReceipt(null); setAmount(\"\");
      await loadHistory();
    } catch (e2) { setErr(formatErr(e2)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid=\"deposit-page\" style={{maxWidth:1100, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 24px\"}}>Deposit</h1>
      <div style={{display:\"grid\", gridTemplateColumns:\"1fr 1fr\", gap:20}} className=\"dep-grid\">
        <div className=\"panel\" style={{padding:24}}>
          <div className=\"lbl\">Select Coin</div>
          <div style={{display:\"flex\", gap:8, flexWrap:\"wrap\", marginBottom:16}}>
            {SUPPORTED_CRYPTOS.map(c => (
              <button key={c} onClick={() => { setCurrency(c); setDeposit(null); }} data-testid={`dep-coin-${c}`}
                className={`btn btn-sm ${currency===c?\"btn-primary\":\"btn-ghost\"}`}>{c}</button>
            ))}
          </div>

          {!deposit ? (
            <form onSubmit={onCreate}>
              <label className=\"lbl\">Amount ({currency})</label>
              <input className=\"input\" type=\"number\" step=\"any\" min=\"0\" value={amount} onChange={e=>setAmount(e.target.value)} required data-testid=\"dep-amount\"/>
              <div style={{height:14}}/>
              <label className=\"lbl\">Wallet Address ({wallet?.network || currency})</label>
              <div style={{display:\"flex\", gap:8}}>
                <input className=\"input\" value={wallet?.address || \"\"} readOnly data-testid=\"dep-wallet\"/>
                <button type=\"button\" className=\"btn btn-ghost btn-sm\" onClick={copy} data-testid=\"dep-copy\">{copied?\"Copied\":\"Copy\"}</button>
              </div>
              <div style={{marginTop:18, display:\"flex\", justifyContent:\"center\"}}>
                {wallet?.qr_image_b64 ? (
                  <img src={wallet.qr_image_b64} alt=\"qr\" style={{width:180, height:180, background:\"#fff\", padding:6, borderRadius:8}} data-testid=\"dep-qr-img\"/>
                ) : wallet?.address ? (
                  <div style={{background:\"#fff\", padding:10, borderRadius:8}} data-testid=\"dep-qr-gen\">
                    <QRCodeSVG value={wallet.address} size={180}/>
                  </div>
                ) : <div className=\"text-dim\">Wallet not configured</div>}
              </div>
              {err && <div className=\"text-red\" style={{marginTop:12, fontSize:13}} data-testid=\"dep-err\">{err}</div>}
              <button type=\"submit\" className=\"btn btn-primary\" style={{marginTop:18, width:\"100%\"}} disabled={busy} data-testid=\"dep-create\">
                {busy ? <span className=\"spinner\"/> : \"I've Paid — Continue\"}
              </button>
            </form>
          ) : (
            <div>
              <div className=\"text-dim\" style={{fontSize:13, marginBottom:8}}>Deposit reference</div>
              <div style={{fontSize:13, marginBottom:14}}><code>{deposit.id}</code></div>
              <div style={{fontSize:14, marginBottom:6}}>{deposit.amount} {deposit.currency}</div>
              <label className=\"lbl\">Upload payment receipt (image)</label>
              <input type=\"file\" accept=\"image/*\" onChange={onReceipt} data-testid=\"dep-receipt-file\" />
              {receipt && <img src={receipt} alt=\"receipt\" style={{maxWidth:\"100%\", marginTop:10, borderRadius:8}} />}
              {err && <div className=\"text-red\" style={{marginTop:10, fontSize:13}}>{err}</div>}
              {msg && <div className=\"text-green\" style={{marginTop:10, fontSize:13}}>{msg}</div>}
              <div style={{display:\"flex\", gap:10, marginTop:14}}>
                <button className=\"btn btn-ghost\" onClick={() => { setDeposit(null); setReceipt(null); }}>Cancel</button>
                <button className=\"btn btn-primary\" onClick={onConfirm} disabled={busy || !receipt} data-testid=\"dep-confirm\">
                  {busy ? <span className=\"spinner\"/> : \"Submit Receipt\"}
                </button>
              </div>
            </div>
          )}
          {msg && !deposit && <div className=\"text-green\" style={{marginTop:10, fontSize:13}} data-testid=\"dep-msg\">{msg}</div>}
        </div>

        <div className=\"panel\" style={{padding:24}}>
          <div style={{fontWeight:600, marginBottom:12}}>Recent Deposits</div>
          <div style={{overflowX:\"auto\"}}>
          <table className=\"tbl\">
            <thead><tr><th>Time</th><th>Amount</th><th>Address</th><th>Status</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={4} className=\"text-dim\">No deposits yet</td></tr>}
              {history.map(h => (
                <tr key={h.id} data-testid={`dep-row-${h.id}`}>
                  <td style={{fontSize:12}}>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.amount} {h.currency}</td>
                  <td style={{fontSize:11, maxWidth:120, overflow:\"hidden\", textOverflow:\"ellipsis\"}}>{h.wallet_address}</td>
                  <td><StatusPill s={h.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .dep-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function StatusPill({ s }) {
  if (s === \"pending\") return <span className=\"pill pending\">⏱ Pending</span>;
  if (s === \"approved\") return <span className=\"pill approved\">✓ Deposit confirmed</span>;
  if (s === \"rejected\") return <span className=\"pill rejected\">✕ Rejected</span>;
  return <span className=\"pill\">{s}</span>;
}
"
Observation: Create successful: /app/frontend/src/pages/Deposit.jsx
