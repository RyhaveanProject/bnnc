import React, { useEffect, useState } from \"react\";
import { useTranslation } from \"react-i18next\";
import api, { SUPPORTED_CRYPTOS, fmtMoney } from \"../lib/api\";
import { useAuth, formatErr } from \"../lib/auth\";

const FEES = { USDT: 1.0, BTC: 0.0005, ETH: 0.005, TRX: 1.0, BNB: 0.001 };

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const { t } = useTranslation();
  const [currency, setCurrency] = useState(\"USDT\");
  const [amount, setAmount] = useState(\"\");
  const [address, setAddress] = useState(\"\");
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(\"\"); const [err, setErr] = useState(\"\");
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    try {
      const { data } = await api.get(\"/withdrawals/me\");
      setHistory(data || []);
    } catch { /* ignore */ }
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
      setMsg(t(\"withdraw.submitted\"));
      setAmount(\"\"); setAddress(\"\");
      await refresh(); await loadHistory();
    } catch (e2) { setErr(formatErr(e2)); }
    finally { setBusy(false); }
  };

  const statusPill = (s) => {
    if (s === \"pending\") return <span className=\"pill pending\">⏱ {t(\"status.pending\")}</span>;
    if (s === \"paid\") return <span className=\"pill paid\">✓ {t(\"status.paid\")}</span>;
    return <span className=\"pill rejected\">✕ {t(\"status.rejected\")}</span>;
  };

  return (
    <div data-testid=\"withdraw-page\" style={{maxWidth:1100, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 24px\"}}>{t(\"withdraw.title\")}</h1>
      <div style={{display:\"grid\", gridTemplateColumns:\"1fr 1fr\", gap:20}} className=\"wd-grid\">
        <form className=\"panel\" style={{padding:24}} onSubmit={submit}>
          <label className=\"lbl\">{t(\"withdraw.coin\")}</label>
          <div style={{display:\"flex\", gap:8, flexWrap:\"wrap\", marginBottom:14}}>
            {SUPPORTED_CRYPTOS.map(c => (
              <button type=\"button\" key={c} onClick={()=>setCurrency(c)} data-testid={`wd-coin-${c}`}
                className={`btn btn-sm ${currency===c?\"btn-primary\":\"btn-ghost\"}`}>{c}</button>
            ))}
          </div>
          <label className=\"lbl\">{t(\"withdraw.destination\")}</label>
          <input className=\"input\" value={address} onChange={e=>setAddress(e.target.value)} required data-testid=\"wd-address\"/>
          <div style={{height:14}}/>
          <label className=\"lbl\">{t(\"withdraw.amount_label\", { currency, bal: fmtMoney(bal, 6) })}</label>
          <input className=\"input\" type=\"number\" step=\"any\" min=\"0\" max={bal} value={amount} onChange={e=>setAmount(e.target.value)} required data-testid=\"wd-amount\"/>
          <button type=\"button\" className=\"btn btn-ghost btn-sm\" style={{marginTop:8}} onClick={()=>setAmount(String(bal))} data-testid=\"wd-max\">{t(\"withdraw.max\")}</button>

          <div className=\"panel\" style={{padding:14, marginTop:16, background:\"#0f1319\"}}>
            <Row label={t(\"withdraw.network_fee\")} value={`${fee} ${currency}`} />
            <Row label={t(\"withdraw.you_receive\")} value={`${net.toFixed(6)} ${currency}`} bold />
          </div>

          {msg && <div className=\"text-green\" style={{marginTop:10, fontSize:13}} data-testid=\"wd-msg\">{msg}</div>}
          {err && <div className=\"text-red\" style={{marginTop:10, fontSize:13}} data-testid=\"wd-err\">{err}</div>}
          <button type=\"submit\" className=\"btn btn-primary\" style={{marginTop:18, width:\"100%\"}} disabled={busy || amt<=fee || amt>bal} data-testid=\"wd-submit\">
            {busy ? <span className=\"spinner\"/> : t(\"withdraw.submit\")}
          </button>
        </form>

        <div className=\"panel\" style={{padding:24}}>
          <div style={{fontWeight:600, marginBottom:12}}>{t(\"withdraw.recent_withdrawals\")}</div>
          <div style={{overflowX:\"auto\"}}>
          <table className=\"tbl\">
            <thead><tr><th>{t(\"withdraw.col_time\")}</th><th>{t(\"withdraw.col_amount\")}</th><th>{t(\"withdraw.col_address\")}</th><th>{t(\"withdraw.col_status\")}</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={4} className=\"text-dim\">{t(\"withdraw.no_withdrawals\")}</td></tr>}
              {history.map(h => (
                <tr key={h.id}>
                  <td style={{fontSize:12}}>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.amount} {h.currency} <span className=\"text-dim\" style={{fontSize:11}}>({t(\"withdraw.fee_label\", { fee: h.fee })})</span></td>
                  <td style={{fontSize:11, maxWidth:120, overflow:\"hidden\", textOverflow:\"ellipsis\"}}>{h.address}</td>
                  <td>{statusPill(h.status)}</td>
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
