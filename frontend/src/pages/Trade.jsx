import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { TRADING_PAIRS, fmtMoney } from "../lib/api";
import { useMarket, Sparkline } from "../components/Market";
import { useAuth, formatErr } from "../lib/auth";

export default function Trade() {
  const [params, setParams] = useSearchParams();
  const sym0 = (params.get("sym") || "BTC").toUpperCase();
  const [symbol, setSymbol] = useState(TRADING_PAIRS.includes(sym0) && sym0 !== "USDT" ? sym0 : "BTC");
  const { data } = useMarket(5000);
  const { user, refresh } = useAuth();
  const [side, setSide] = useState("buy");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const coin = useMemo(() => data.find(d => d.symbol === symbol), [data, symbol]);
  const price = coin?.price ?? 0;
  const usdtBal = user?.balances?.USDT || 0;
  const coinBal = user?.balances?.[symbol] || 0;

  const onSym = (s) => { setSymbol(s); setParams({ sym: s }); setMsg(""); setErr(""); };

  const submit = async (e) => {
    e.preventDefault();
    setMsg(""); setErr(""); setBusy(true);
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Invalid amount");
      const { data: res } = await api.post("/trade/execute", { symbol, side, amount: amt });
      setMsg(`${side === "buy" ? "Bought" : "Sold"} ${side==="buy" ? res.trade.executed.qty.toFixed(6) : res.trade.executed.received.toFixed(2)+" USDT received"} ${side==="buy"?symbol:""} @ $${fmtMoney(res.trade.price)}`);
      setAmount("");
      await refresh();
    } catch (e2) { setErr(formatErr(e2) || e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="trade-page" style={{maxWidth:1280, margin:"0 auto", padding:24}} className="container-pad">
      <div style={{display:"grid", gridTemplateColumns:"260px 1fr 360px", gap:16}} className="trade-grid">
        {/* Pair list */}
        <div className="panel" style={{padding:12, maxHeight:600, overflowY:"auto"}}>
          <div style={{fontWeight:600, padding:"6px 8px"}}>Pairs</div>
          {data.filter(d => d.symbol !== "USDT").map(d => (
            <button key={d.symbol} onClick={() => onSym(d.symbol)} data-testid={`pair-${d.symbol}`}
              style={{display:"flex", justifyContent:"space-between", width:"100%", padding:"10px 8px", background: d.symbol===symbol?"#1c2129":"transparent", border:"none", color:"var(--text)", cursor:"pointer", borderRadius:6, fontSize:14}}>
              <span>{d.symbol}/USDT</span>
              <span className={d.change24h>=0?"text-green":"text-red"}>{d.change24h.toFixed(2)}%</span>
            </button>
          ))}
        </div>

        {/* Chart panel */}
        <div className="panel" style={{padding:20}}>
          <div style={{display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"}}>
            <div style={{fontSize:22, fontWeight:700}}>{symbol}/USDT</div>
            <div style={{fontSize:24, fontWeight:700}}>${fmtMoney(price)}</div>
            <div className={(coin?.change24h ?? 0) >= 0 ? "text-green" : "text-red"} style={{fontWeight:600}}>
              {(coin?.change24h ?? 0) >= 0 ? "+" : ""}{(coin?.change24h ?? 0).toFixed(2)}%
            </div>
          </div>
          <div style={{marginTop:16, padding:"16px 0"}}>
            <svg viewBox="0 0 600 200" width="100%" height="200">
              {coin && <Sparkline points={coin.sparkline} width={600} height={200} color={coin.change24h>=0?"#0ecb81":"#f6465d"} />}
            </svg>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginTop:8}}>
            <Stat label="24h Volume" value={`$${fmtMoney(coin?.volume24h ?? 0, 0)}`} />
            <Stat label="Market Cap" value={`$${fmtMoney(coin?.marketCap ?? 0, 0)}`} />
            <Stat label="Price" value={`$${fmtMoney(price)}`} />
          </div>
        </div>

        {/* Order panel */}
        <div className="panel" style={{padding:20}}>
          <div style={{display:"flex", gap:8, marginBottom:16}}>
            <button onClick={()=>setSide("buy")} data-testid="side-buy" className={`btn ${side==="buy"?"btn-green":"btn-ghost"}`} style={{flex:1}}>Buy</button>
            <button onClick={()=>setSide("sell")} data-testid="side-sell" className={`btn ${side==="sell"?"btn-red":"btn-ghost"}`} style={{flex:1}}>Sell</button>
          </div>
          <div className="text-dim" style={{fontSize:13, marginBottom:10}}>
            Balance: <span style={{color:"#fff"}}>{fmtMoney(usdtBal)} USDT</span> · <span style={{color:"#fff"}}>{fmtMoney(coinBal, 6)} {symbol}</span>
          </div>
          <form onSubmit={submit}>
            <label className="lbl">Price (market)</label>
            <input className="input" value={`$${fmtMoney(price)}`} disabled />
            <div style={{height:10}}/>
            <label className="lbl">{side === "buy" ? "Amount (USDT to spend)" : `Amount (${symbol} to sell)`}</label>
            <input className="input" type="number" step="any" min="0" value={amount} onChange={e=>setAmount(e.target.value)} required data-testid="trade-amount"/>
            <div style={{marginTop:8, fontSize:12}} className="text-dim">
              {side==="buy" && amount && price ? `≈ ${(parseFloat(amount)/price).toFixed(6)} ${symbol}` : ""}
              {side==="sell" && amount && price ? `≈ ${(parseFloat(amount)*price).toFixed(2)} USDT` : ""}
            </div>
            <div style={{display:"flex", gap:6, marginTop:10}}>
              {[25,50,75,100].map(p =>
                <button type="button" key={p} className="btn btn-ghost btn-sm" style={{flex:1}}
                  onClick={()=> {
                    const bal = side==="buy" ? usdtBal : coinBal;
                    setAmount((bal * p/100).toString());
                  }} data-testid={`pct-${p}`}>{p}%</button>
              )}
            </div>
            <button type="submit" disabled={busy || !user} className={`btn ${side==="buy"?"btn-green":"btn-red"}`} style={{width:"100%", marginTop:16}} data-testid="trade-submit">
              {busy ? <span className="spinner"/> : `${side==="buy"?"Buy":"Sell"} ${symbol}`}
            </button>
            {msg && <div className="text-green" style={{marginTop:10, fontSize:13}} data-testid="trade-success">{msg}</div>}
            {err && <div className="text-red" style={{marginTop:10, fontSize:13}} data-testid="trade-error">{err}</div>}
          </form>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) { .trade-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

function Stat({label, value}) {
  return (
    <div>
      <div className="text-dim" style={{fontSize:12}}>{label}</div>
      <div style={{fontWeight:600, marginTop:2}}>{value}</div>
    </div>
  );
}
