import React, { useEffect, useState } from \"react\";
import { useTranslation } from \"react-i18next\";
import api, { fmtMoney } from \"../lib/api\";

export default function History() {
  const { t } = useTranslation();
  const [trades, setTrades] = useState([]);
  const [deps, setDeps] = useState([]);
  const [wds, setWds] = useState([]);
  const [tab, setTab] = useState(\"trades\");

  useEffect(() => {
    api.get(\"/trade/history\").then(r => setTrades(r.data || [])).catch(() => {});
    api.get(\"/deposits/me\").then(r => setDeps(r.data || [])).catch(() => {});
    api.get(\"/withdrawals/me\").then(r => setWds(r.data || [])).catch(() => {});
  }, []);

  const statusPill = (s) => {
    const map = {
      pending: { c: \"pending\", l: t(\"status.pending\") },
      approved: { c: \"approved\", l: t(\"status.completed\") },
      completed: { c: \"approved\", l: t(\"status.completed\") },
      paid: { c: \"paid\", l: t(\"status.paid\") },
      rejected: { c: \"rejected\", l: t(\"status.rejected\") },
    };
    const m = map[s] || { c: \"\", l: s };
    return <span className={`pill ${m.c}`}>{m.l}</span>;
  };

  return (
    <div data-testid=\"history-page\" style={{maxWidth:1200, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 16px\"}}>{t(\"history.title\")}</h1>
      <div style={{display:\"flex\", gap:8, marginBottom:16}}>
        <button onClick={()=>setTab(\"trades\")} className={`btn btn-sm ${tab===\"trades\"?\"btn-primary\":\"btn-ghost\"}`} data-testid=\"tab-trades\">{t(\"history.trades\")}</button>
        <button onClick={()=>setTab(\"deposits\")} className={`btn btn-sm ${tab===\"deposits\"?\"btn-primary\":\"btn-ghost\"}`} data-testid=\"tab-deposits\">{t(\"history.deposits\")}</button>
        <button onClick={()=>setTab(\"withdrawals\")} className={`btn btn-sm ${tab===\"withdrawals\"?\"btn-primary\":\"btn-ghost\"}`} data-testid=\"tab-withdrawals\">{t(\"history.withdrawals\")}</button>
      </div>
      <div className=\"panel\">
        <div style={{overflowX:\"auto\"}}>
        {tab === \"trades\" && (
          <table className=\"tbl\">
            <thead><tr><th>{t(\"history.time\")}</th><th>{t(\"history.pair\")}</th><th>{t(\"history.side\")}</th><th>{t(\"history.price\")}</th><th>{t(\"history.amount\")}</th><th>{t(\"history.total\")}</th></tr></thead>
            <tbody>
              {trades.length === 0 && <tr><td colSpan={6} className=\"text-dim\" style={{textAlign:\"center\", padding:24}}>{t(\"history.no_trades\")}</td></tr>}
              {trades.map(tr => (
                <tr key={tr.id}>
                  <td style={{fontSize:12}}>{new Date(tr.created_at).toLocaleString()}</td>
                  <td>{tr.symbol}/USDT</td>
                  <td className={tr.side===\"buy\"?\"text-green\":\"text-red\"} style={{textTransform:\"uppercase\", fontWeight:600}}>{tr.side===\"buy\"?t(\"trade.buy\"):t(\"trade.sell\")}</td>
                  <td>${fmtMoney(tr.price)}</td>
                  <td>{fmtMoney(tr.executed.qty, 6)+\" \"+tr.symbol}</td>
                  <td>{tr.side===\"buy\" ? fmtMoney(tr.executed.spent)+\" USDT\" : fmtMoney(tr.executed.received)+\" USDT\"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === \"deposits\" && (
          <table className=\"tbl\">
            <thead><tr><th>{t(\"history.time\")}</th><th>{t(\"history.coin\")}</th><th>{t(\"history.amount\")}</th><th>{t(\"history.status\")}</th></tr></thead>
            <tbody>
              {deps.length === 0 && <tr><td colSpan={4} className=\"text-dim\" style={{textAlign:\"center\", padding:24}}>{t(\"history.no_deposits\")}</td></tr>}
              {deps.map(d => (
                <tr key={d.id}>
                  <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
                  <td>{d.currency}</td>
                  <td>{d.amount}</td>
                  <td>{statusPill(d.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === \"withdrawals\" && (
          <table className=\"tbl\">
            <thead><tr><th>{t(\"history.time\")}</th><th>{t(\"history.coin\")}</th><th>{t(\"history.amount\")}</th><th>{t(\"history.address\")}</th><th>{t(\"history.status\")}</th></tr></thead>
            <tbody>
              {wds.length === 0 && <tr><td colSpan={5} className=\"text-dim\" style={{textAlign:\"center\", padding:24}}>{t(\"history.no_withdrawals\")}</td></tr>}
              {wds.map(d => (
                <tr key={d.id}>
                  <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
                  <td>{d.currency}</td>
                  <td>{d.amount}</td>
                  <td style={{fontSize:11}}>{d.address}</td>
                  <td>{statusPill(d.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}
