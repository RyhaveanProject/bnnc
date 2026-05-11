import React, { useEffect, useState } from "react";
import api, { fmtMoney } from "../lib/api";

export default function History() {
  const [trades, setTrades] = useState([]);
  const [deps, setDeps] = useState([]);
  const [wds, setWds] = useState([]);
  const [tab, setTab] = useState("trades");

  useEffect(() => {
    api.get("/trade/history").then(r => setTrades(r.data));
    api.get("/deposits/me").then(r => setDeps(r.data));
    api.get("/withdrawals/me").then(r => setWds(r.data));
  }, []);

  return (
    <div data-testid="history-page" style={{maxWidth:1200, margin:"0 auto", padding:24}} className="container-pad">
      <h1 style={{margin:"0 0 16px"}}>History</h1>
      <div style={{display:"flex", gap:8, marginBottom:16}}>
        <button onClick={()=>setTab("trades")} className={`btn btn-sm ${tab==="trades"?"btn-primary":"btn-ghost"}`} data-testid="tab-trades">Trades</button>
        <button onClick={()=>setTab("deposits")} className={`btn btn-sm ${tab==="deposits"?"btn-primary":"btn-ghost"}`} data-testid="tab-deposits">Deposits</button>
        <button onClick={()=>setTab("withdrawals")} className={`btn btn-sm ${tab==="withdrawals"?"btn-primary":"btn-ghost"}`} data-testid="tab-withdrawals">Withdrawals</button>
      </div>
      <div className="panel">
        <div style={{overflowX:"auto"}}>
        {tab === "trades" && (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Pair</th><th>Side</th><th>Price</th><th>Amount</th><th>Total</th></tr></thead>
            <tbody>
              {trades.length === 0 && <tr><td colSpan={6} className="text-dim" style={{textAlign:"center", padding:24}}>No trades</td></tr>}
              {trades.map(t => (
                <tr key={t.id}>
                  <td style={{fontSize:12}}>{new Date(t.created_at).toLocaleString()}</td>
                  <td>{t.symbol}/USDT</td>
                  <td className={t.side==="buy"?"text-green":"text-red"} style={{textTransform:"uppercase", fontWeight:600}}>{t.side}</td>
                  <td>${fmtMoney(t.price)}</td>
                  <td>{t.side==="buy" ? fmtMoney(t.executed.qty, 6)+" "+t.symbol : fmtMoney(t.executed.qty, 6)+" "+t.symbol}</td>
                  <td>{t.side==="buy" ? fmtMoney(t.executed.spent)+" USDT" : fmtMoney(t.executed.received)+" USDT"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "deposits" && (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Coin</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {deps.length === 0 && <tr><td colSpan={4} className="text-dim" style={{textAlign:"center", padding:24}}>No deposits</td></tr>}
              {deps.map(d => (
                <tr key={d.id}>
                  <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
                  <td>{d.currency}</td>
                  <td>{d.amount}</td>
                  <td>{d.status === "pending" ? <span className="pill pending">⏱ Pending</span> : d.status === "approved" ? <span className="pill approved">✓ Confirmed</span> : <span className="pill rejected">✕ {d.status}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "withdrawals" && (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Coin</th><th>Amount</th><th>Address</th><th>Status</th></tr></thead>
            <tbody>
              {wds.length === 0 && <tr><td colSpan={5} className="text-dim" style={{textAlign:"center", padding:24}}>No withdrawals</td></tr>}
              {wds.map(d => (
                <tr key={d.id}>
                  <td style={{fontSize:12}}>{new Date(d.created_at).toLocaleString()}</td>
                  <td>{d.currency}</td>
                  <td>{d.amount}</td>
                  <td style={{fontSize:11}}>{d.address}</td>
                  <td>{d.status === "pending" ? <span className="pill pending">⏱ Pending</span> : d.status === "paid" ? <span className="pill paid">✓ Paid</span> : <span className="pill rejected">✕ {d.status}</span>}</td>
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
