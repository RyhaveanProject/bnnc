import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"; import { useNavigate } from "react-router-dom"; import api, { TRADING_PAIRS, COIN_NAMES, fmtMoney } from "../lib/api"; import { useMarket } from "../components/Market"; import { useAuth } from "../lib/auth";

const AMOUNTS = [1000, 5000, 10000, 50000]; const DURATIONS = [ { seconds: 300, label: "5 min", profit: 5 }, { seconds: 600, label: "10 min", profit: 7 }, { seconds: 900, label: "15 min", profit: 9 }, { seconds: 1200, label: "20 min", profit: 12 }, ];

function fmt(n, d) { d = (d === undefined) ? 2 : d; if (n == null || isNaN(n)) return "-"; return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }

function fmtTime(sec) { var m = Math.floor(sec / 60); var s = sec % 60; return m + ":" + String(s).padStart(2, "0"); }

export default function BinaryTrade() { const { user, refresh } = useAuth(); const { data: marketData } = useMarket(5000); const navigate = useNavigate();

const [step, setStep] = useState("select"); const [symbol, setSymbol] = useState("BTC"); const [amount, setAmount] = useState(null); const [duration, setDuration] = useState(null); const [direction, setDirection] = useState(null); const [activeTrade, setActiveTrade] = useState(null); const [timeLeft, setTimeLeft] = useState(0); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const timerRef = useRef(null);

const coin = useMemo(() => marketData.find(d => d.symbol === symbol), [marketData, symbol]); const price = coin ? coin.price : 0; const usdtBalance = (user && user.balances) ? (user.balances.USDT || 0) : 0; const selectedDuration = DURATIONS.find(d => d.seconds === duration); const estimatedProfit = (amount && selectedDuration) ? (amount * selectedDuration.profit / 100) : 0; const circumference = 2 * Math.PI * 80; const progressPct = activeTrade ? Math.max(0, Math.round((timeLeft / activeTrade.duration) * 100)) : 0;

const resetAll = () => { clearInterval(timerRef.current); setStep("select"); setAmount(null); setDuration(null); setDirection(null); setActiveTrade(null); setTimeLeft(0); setResult(null); setErr(""); };

const completeTrade = useCallback((tradeId) => { setBusy(true); api.post("/binary-trade/complete/" + tradeId) .then(res => { setResult({ win: res.data.result === "win", profit: res.data.profit, payout: res.data.payout }); return refresh(); }) .then(() => { setStep("result"); setBusy(false); }) .catch(e => { const detail = (e && e.response && e.response.data) ? (e.response.data.detail || "") : ""; if (detail.includes("not yet expired")) { setTimeout(() => completeTrade(tradeId), 2000); } else { setErr(detail || "Error completing trade."); setStep("result"); setResult({ win: false, profit: 0, payout: 0 }); setBusy(false); } }); }, [refresh]);

const placeTrade = () => { if (!symbol || !amount || !duration || !direction) return; setErr(""); setBusy(true); api.post("/binary-trade/place", { symbol, amount_usd: amount, duration, direction }) .then(res => { setActiveTrade(res.data.trade); setTimeLeft(duration); setStep("active"); return refresh(); }) .then(() => setBusy(false)) .catch(e => { setErr((e && e.response && e.response.data ? e.response.data.detail : null) || "Failed to place trade."); setBusy(false); }); };

useEffect(() => { if (step !== "active" || !activeTrade) return; clearInterval(timerRef.current); timerRef.current = setInterval(() => { setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current); completeTrade(activeTrade.id); return 0; } return prev - 1; }); }, 1000); return () => clearInterval(timerRef.current); }, [step, activeTrade, completeTrade]);

return ( <div data-testid="binary-trade-page" style={{ maxWidth: 900, margin: "0 auto", padding: 24 }} className="container-pad"> <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}> <h1 style={{ margin: 0, fontSize: 24 }}>Trading</h1> <span className="pill approved" style={{ fontSize: 11 }}>Binary Options</span> {user && !user.trading_enabled && ( <span className="pill rejected" style={{ fontSize: 11, background: "rgba(246,70,93,0.15)", color: "var(--color-red)", border: "1px solid rgba(246,70,93,0.3)" }}> Demo Mode </span> )} <div style={{ marginLeft: "auto", textAlign: "right" }}> <div className="text-dim" style={{ fontSize: 11 }}>Available Balance</div> <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-accent)" }}>${fmt(usdtBalance)} USDT</div> </div> </div>

  {user && !user.trading_enabled && (
    <div style={{ 
      padding: 16, 
      marginBottom: 20, 
      background: "rgba(246,70,93,0.08)", 
      border: "1px solid rgba(246,70,93,0.2)", 
      borderRadius: 10,
      fontSize: 13,
      color: "var(--color-red)"
    }}>
      <strong>Trading is risky — if you don’t take risks, you can’t make profits</strong>
    </div>
  )}

  {step === "select" && (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }} className="text-dim">1. Select Asset</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {TRADING_PAIRS.filter(s => s !== "USDT").map(sym => {
            const c = marketData.find(d => d.symbol === sym);
            const p = c ? c.price : 0;
            const chg = c ? c.change24h : 0;
            const active = symbol === sym;
            return (
              <button key={sym} onClick={() => setSymbol(sym)}
                style={{ border: `2px solid ${active ? "var(--color-accent)" : "var(--border)"}`, background: active ? "rgba(240,185,11,0.08)" : "transparent", borderRadius: 10, padding: "10px 16px", cursor: "pointer", minWidth: 120, textAlign: "left", transition: "all 0.15s" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--color-accent)" : "inherit" }}>{sym}</div>
                <div style={{ fontSize: 11 }} className="text-dim">{COIN_NAMES[sym] || sym}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>${fmt(p, p < 1 ? 4 : 2)}</div>
                <div style={{ fontSize: 11, color: chg >= 0 ? "var(--color-green)" : "var(--color-red)" }}>{chg >= 0 ? "+" : ""}{fmt(chg, 2)}%</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }} className="text-dim">2. Investment Amount (USDT)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {AMOUNTS.map(a => (
            <button key={a} onClick={() => setAmount(a)} disabled={usdtBalance < a}
              className={`btn btn-sm ${amount === a ? "btn-primary" : "btn-ghost"}`}
              style={{ minWidth: 100, opacity: usdtBalance < a ? 0.4 : 1 }}>
              ${a.toLocaleString()}
            </button>
          ))}
        </div>
        {usdtBalance < 1000 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-red)" }}>
            Minimum balance $1,000 required.{" "}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => navigate("/deposit")}>Deposit now</button>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }} className="text-dim">3. Profit Period</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {DURATIONS.map(d => {
            const active = duration === d.seconds;
            return (
              <button key={d.seconds} onClick={() => setDuration(d.seconds)}
                style={{ border: `2px solid ${active ? "var(--color-accent)" : "var(--border)"}`, background: active ? "rgba(240,185,11,0.08)" : "transparent", borderRadius: 10, padding: "12px 18px", cursor: "pointer", textAlign: "center", minWidth: 110, transition: "all 0.15s" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-green)", fontWeight: 600 }}>+{d.profit}% profit</div>
                <div style={{ fontSize: 10 }} className="text-dim">{d.seconds}s</div>
              </button>
            );
          })}
        </div>
      </div>

      {amount && duration && (
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }} className="text-dim">Order Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              ["Asset", `${symbol} (${COIN_NAMES[symbol] || symbol})`],
              ["Current Price", `$${fmt(price, price < 1 ? 4 : 2)}`],
              ["Investment", `$${amount.toLocaleString()} USDT`],
              ["Duration", selectedDuration ? `${selectedDuration.label} (${duration}s)` : "-"],
              ["Profit Rate", selectedDuration ? `${selectedDuration.profit}%` : "-"],
              ["Estimated Profit", `+$${fmt(estimatedProfit)} USDT`],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11 }} className="text-dim">{k}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, padding: "12px 16px", borderRadius: 8, background: "rgba(240,185,11,0.05)", border: "1px solid rgba(240,185,11,0.2)", marginBottom: 16 }}>
            Total return if win: <span style={{ color: "var(--color-accent)" }}>${fmt(amount + estimatedProfit)} USDT</span>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }} className="text-dim">4. Select Direction</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <button onClick={() => setDirection("rise")}
              style={{ flex: 1, padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer", border: "2px solid", borderColor: direction === "rise" ? "var(--color-green)" : "var(--border)", background: direction === "rise" ? "rgba(3,166,109,0.12)" : "transparent", color: direction === "rise" ? "var(--color-green)" : "inherit", transition: "all 0.15s" }}>
              &#9650; Buy Rise
            </button>
            <button onClick={() => setDirection("fall")}
              style={{ flex: 1, padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer", border: "2px solid", borderColor: direction === "fall" ? "var(--color-red)" : "var(--border)", background: direction === "fall" ? "rgba(246,70,93,0.12)" : "transparent", color: direction === "fall" ? "var(--color-red)" : "inherit", transition: "all 0.15s" }}>
              &#9660; Buy Fall
            </button>
          </div>
          {direction && (
            <button onClick={placeTrade} disabled={busy} className="btn btn-primary"
              style={{ width: "100%", padding: "14px 0", fontSize: 16, fontWeight: 700 }}>
              {busy ? "Placing Order..." : "Confirm Order"}
            </button>
          )}
          {err && <div style={{ color: "var(--color-red)", marginTop: 10, fontSize: 13 }}>{err}</div>}
        </div>
      )}
    </div>
  )}

  {step === "active" && activeTrade && (
    <div className="panel" style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 13, marginBottom: 8 }} className="text-dim">Active Trade</div>
      <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>{activeTrade.symbol}</div>
      <div style={{ fontSize: 15, marginBottom: 24 }} className="text-dim">
        {activeTrade.direction === "rise" ? "▲ Buy Rise" : "▼ Buy Fall"} &bull; ${activeTrade.amount_usd.toLocaleString()} USDT
      </div>
      <div style={{ margin: "0 auto 24px", width: 180, height: 180, position: "relative" }}>
        <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="90" cy="90" r="80" fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle cx="90" cy="90" r="80" fill="none"
            stroke={timeLeft <= 30 ? "var(--color-red)" : "var(--color-accent)"}
            strokeWidth="10" strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progressPct / 100)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: timeLeft <= 30 ? "var(--color-red)" : "inherit" }}>{fmtTime(timeLeft)}</div>
          <div style={{ fontSize: 11 }} className="text-dim">remaining</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          ["Investment", `$${activeTrade.amount_usd.toLocaleString()}`],
          ["Profit Rate", `+${(activeTrade.profit_rate * 100).toFixed(0)}%`],
          ["Potential Gain", `+$${fmt(activeTrade.amount_usd * activeTrade.profit_rate)}`],
        ].map(([k, v]) => (
          <div key={k} className="panel" style={{ padding: 12 }}>
            <div style={{ fontSize: 11 }} className="text-dim">{k}</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13 }} className="text-dim">Your trade is active. Please wait for the timer to complete.</div>
      {busy && <div style={{ marginTop: 12, fontSize: 12 }} className="text-dim">Processing result...</div>}
      {err && <div style={{ color: "var(--color-red)", marginTop: 10, fontSize: 13 }}>{err}</div>}
    </div>
  )}

  {step === "result" && result != null && (
    <div className="panel" style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>{result.win ? "\uD83C\uDFC6" : "\uD83D\uDCC9"}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: result.win ? "var(--color-green)" : "var(--color-red)" }}>
        {result.win ? "Trade Won!" : "Trade Closed"}
      </div>
      {result.win
        ? <div style={{ fontSize: 16, marginBottom: 24 }} className="text-dim">Profit has been credited to your balance.</div>
        : <div style={{ fontSize: 15, marginBottom: 24 }} className="text-dim">Better luck next time!</div>
      }
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 11 }} className="text-dim">Payout</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: result.win ? "var(--color-green)" : "inherit" }}>${fmt(result.payout)}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 11 }} className="text-dim">{result.win ? "Profit" : "Result"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: result.win ? "var(--color-green)" : "var(--color-red)" }}>
            {result.win ? "+" : ""}{fmt(result.profit)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={resetAll} style={{ minWidth: 180 }}>New Trade</button>
        <button className="btn btn-ghost" onClick={() => navigate("/history")} style={{ minWidth: 140 }}>View History</button>
      </div>
    </div>
);
}
