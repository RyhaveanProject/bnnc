
Action: file_editor create /app/frontend/src/pages/Withdraw.jsx --file-text "import React, { useEffect, useState } from \"react\";
import api, { SUPPORTED_CRYPTOS, fmtMoney } from \"../lib/api\";
import { useAuth, formatErr } from \"../lib/auth\";

const FEES = { USDT: 1.0, BTC: 0.0005, ETH: 0.005, TRX: 1.0, BNB: 0.001 };

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [currency, setCurrency] = useState(\"USDT\");
  const [amount, setAmount] = useState(\"\");
  const [address, setAddress] = useState(\"\");
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(\"\"); const [err, setErr] = useState(\"\");
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    const { data } = await api.get(\"/withdrawals/me\");
    setHistory(data);
  };
  useEffect(() => { loadHistory(); }, []);

  const fee = FEES[currency] || 0;
  const amt = parseFloat(amount) || 0;
  const net = Math.max(amt - fee, 0);
  const bal = user?.balances?.[currency] || 0;

  const submit = async (e) => {
    e.preventDefault();
    setMsg(\"\"); setErr(\"\"); setBusy(true);
    try {
      await api.post(\"/withdrawals/create\", { currency, amount: amt, address });
      setMsg(\"Withdrawal request submitted. Awaiting admin processing.\");
      setAmount(\"\"); setAddress(\"\");
      await refresh(); await loadHistory();
    } catch (e2) { setErr(formatErr(e2)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid=\"withdraw-page\" style={{maxWidth:1100, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 24px\"}}>Withdraw</h1>
      <div style={{display:\"grid\", gridTemplateColumns:\"1fr 1fr\", gap:20}} className=\"wd-grid\">
        <form className=\"panel\" style={{padding:24}} onSubmit={submit}>
          <label className=\"lbl\">Coin</label>
          <div style={{display:\"flex\", gap:8, flexWrap:\"wrap\", marginBottom:14}}>
            {SUPPORTED_CRYPTOS.map(c => (
              <button type=\"button\" key={c} onClick={()=>setCurrency(c)} data-testid={`wd-coin-${c}`}
                className={`btn btn-sm ${currency===c?\"btn-primary\":\"btn-ghost\"}`}>{c}</button>
            ))}
          </div>
          <label className=\"lbl\">Destination Address</label>
          <input className=\"input\" value={address} onChange={e=>setAddress(e.target.value)} required data-testid=\"wd-address\"/>
          <div style={{height:14}}/>
          <label className=\"lbl\">Amount ({currency}) — Available: {fmtMoney(bal, 6)}</label>
          <input className=\"input\" type=\"number\" step=\"any\" min=\"0\" max={bal} value={amount} onChange={e=>setAmount(e.target.value)} required data-testid=\"wd-amount\"/>
          <button type=\"button\" className=\"btn btn-ghost btn-sm\" style={{marginTop:8}} onClick={()=>setAmount(String(bal))} data-testid=\"wd-max\">Max</button>

          <div className=\"panel\" style={{padding:14, marginTop:16, background:\"#0f1319\"}}>
            <Row label=\"Network Fee\" value={`${fee} ${currency}`} />
            <Row label=\"You Receive\" value={`${net.toFixed(6)} ${currency}`} bold />
          </div>

          {msg && <div className=\"text-green\" style={{marginTop:10, fontSize:13}} data-testid=\"wd-msg\">{msg}</div>}
          {err && <div className=\"text-red\" style={{marginTop:10, fontSize:13}} data-testid=\"wd-err\">{err}</div>}
          <button type=\"submit\" className=\"btn btn-primary\" style={{marginTop:18, width:\"100%\"}} disabled={busy || amt<=fee || amt>bal} data-testid=\"wd-submit\">
            {busy ? <span className=\"spinner\"/> : \"Submit Withdrawal\"}
          </button>
        </form>

        <div className=\"panel\" style={{padding:24}}>
          <div style={{fontWeight:600, marginBottom:12}}>Recent Withdrawals</div>
          <div style={{overflowX:\"auto\"}}>
          <table className=\"tbl\">
            <thead><tr><th>Time</th><th>Amount</th><th>Address</th><th>Status</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={4} className=\"text-dim\">No withdrawals yet</td></tr>}
              {history.map(h => (
                <tr key={h.id}>
                  <td style={{fontSize:12}}>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.amount} {h.currency} <span className=\"text-dim\" style={{fontSize:11}}>(fee {h.fee})</span></td>
                  <td style={{fontSize:11, maxWidth:120, overflow:\"hidden\", textOverflow:\"ellipsis\"}}>{h.address}</td>
                  <td>{h.status === \"pending\" ? <span className=\"pill pending\">⏱ Pending</span> : h.status === \"paid\" ? <span className=\"pill paid\">✓ Paid</span> : <span className=\"pill rejected\">✕ {h.status}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .wd-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Row({ label, value, bold }) {
  return <div style={{display:\"flex\", justifyContent:\"space-between\", padding:\"4px 0\", fontSize:13}}>
    <span className=\"text-dim\">{label}</span>
    <span style={{fontWeight: bold?700:400}}>{value}</span>
  </div>;
}
"
Observation: Create successful: /app/frontend/src/pages/Withdraw.jsx
