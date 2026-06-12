import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { TRADING_PAIRS, fmtMoney } from "../lib/api";
import { useMarket, Sparkline } from "../components/Market";
import { useAuth } from "../lib/auth";

const AMOUNTS = [100, 1000, 5000, 50000];
const DURATIONS = [
  { seconds: 120, label: "2 min", profit: 3 },
  { seconds: 240, label: "4 min", profit: 5 },
  { seconds: 360, label: "6 min", profit: 7 },
  { seconds: 480, label: "8 min", profit: 9 },
];

// Profit tiers unlock based on the user's current USDT balance.
// Balance < 1000  -> only 3% allowed
// Balance < 5000  -> up to 5% (3%, 5%)
// Balance < 8000  -> up to 7% (3%, 5%, 7%)
// Balance < 10000 -> up to 9% (3%, 5%, 7%, 9%)
// Balance >= 10000 -> all (same set, max 9%)
function maxAllowedProfitPct(balance) {
  if (balance < 1000) return 3;
  if (balance < 5000) return 5;
  if (balance < 8000) return 7;
  return 9;
}
const PAIRS = TRADING_PAIRS.filter((s) => s !== "USDT");

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "-";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function BinaryTrade() {
  const { user, refresh } = useAuth();
  const { data: marketData } = useMarket(5000);
  const navigate = useNavigate();

  const [symbol, setSymbol] = useState("BTC");
  // Use string state so the input can be cleared/edited freely without a
  // lingering "0" sticking around. Numeric value is derived via `amount`.
  const [amountStr, setAmountStr] = useState("");
  const amount = Number(amountStr) || 0;
  const setAmount = (v) => setAmountStr(v === "" || v == null ? "" : String(v));
  const [duration, setDuration] = useState(120);
  const [activeTrade, setActiveTrade] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  const coin = useMemo(() => marketData.find((d) => d.symbol === symbol), [marketData, symbol]);
  const price = coin ? coin.price : 0;
  const change = coin ? coin.change24h : 0;
  const usdtBalance = user?.balances?.USDT || 0;
  const maxAllowedPct = maxAllowedProfitPct(usdtBalance);
  const selectedDuration = DURATIONS.find((d) => d.seconds === duration);

  // If the currently selected duration's profit tier becomes locked
  // (e.g. balance dropped), fall back to the lowest tier (2 min / 3%).
  useEffect(() => {
    if (selectedDuration && selectedDuration.profit > maxAllowedPct) {
      setDuration(120);
    }
  }, [maxAllowedPct, selectedDuration]);

  const profitPct = selectedDuration ? selectedDuration.profit : 0;
  const estimatedProfit = (amount * profitPct) / 100;
  const estimatedPayout = amount + estimatedProfit;

  const loadHistory = useCallback(() => {
    api.get("/binary-trade/history").then((r) => setOrders(r.data || [])).catch(() => {});
  }, []);

  // On mount: resume any in-flight trade so the timer continues across page
  // reloads / tab closes. Backend sweeper guarantees credit even if the user
  // never returns.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/binary-trade/active")
      .then((r) => {
        if (cancelled) return;
        if (r.data?.active) {
          const t = r.data.active;
          const remaining = Math.max(
            0,
            Math.floor((new Date(t.expires_at).getTime() - Date.now()) / 1000)
          );
          setActiveTrade(t);
          setTimeLeft(remaining);
        } else if (r.data?.last_completed) {
          // Show the auto-settled result once if it happened while away.
          const c = r.data.last_completed;
          const completedAt = new Date(c.completed_at).getTime();
          if (Date.now() - completedAt < 5 * 60 * 1000) {
            setLastResult({ win: c.result === "win", payout: c.payout, profit: c.profit, symbol: c.symbol });
          }
        }
      })
      .catch(() => {});
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  const completeTrade = useCallback(
    (tradeId) => {
      setBusy(true);
      api
        .post("/binary-trade/complete/" + tradeId)
        .then((res) => {
          setLastResult({
            win: res.data.result === "win",
            payout: res.data.payout,
            profit: res.data.profit,
            symbol: activeTrade?.symbol || symbol,
          });
          setActiveTrade(null);
          setTimeLeft(0);
          return refresh();
        })
        .then(() => {
          loadHistory();
          setBusy(false);
        })
        .catch((e) => {
          const detail = e?.response?.data?.detail || "";
          if (detail.includes("not yet expired")) {
            setTimeout(() => completeTrade(tradeId), 2000);
          } else {
            setBusy(false);
            setActiveTrade(null);
            setTimeLeft(0);
            loadHistory();
            refresh();
          }
        });
    },
    [refresh, loadHistory, activeTrade, symbol]
  );

  // Live countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!activeTrade) return;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(activeTrade.expires_at).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        completeTrade(activeTrade.id);
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [activeTrade, completeTrade]);

  const placeTrade = (direction) => {
    if (busy || activeTrade) return;
    setErr("");
    setLastResult(null);
    setBusy(true);
    api
      .post("/binary-trade/place", { symbol, amount_usd: amount, duration, direction })
      .then((res) => {
        setActiveTrade(res.data.trade);
        const remaining = Math.max(
          0,
          Math.floor((new Date(res.data.trade.expires_at).getTime() - Date.now()) / 1000)
        );
        setTimeLeft(remaining);
        return refresh();
      })
      .then(() => {
        loadHistory();
        setBusy(false);
      })
      .catch((e) => {
        setErr(e?.response?.data?.detail || "Failed to place trade.");
        setBusy(false);
      });
  };

  const chartColor = change >= 0 ? "var(--color-green)" : "var(--color-red)";

  return (
    <div data-testid="binary-trade-page" className="container-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Trading</h1>
          <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>
            Predict the direction of the market and earn fixed profit at expiry.
          </div>
        </div>
        <div className="panel" style={{ padding: "12px 18px", minWidth: 200, textAlign: "right" }}>
          <div className="text-dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>USDT Balance</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>${fmt(usdtBalance)}</div>
        </div>
      </div>

      {user && !user.trading_enabled && (
        <div style={{ padding: 12, marginBottom: 16, background: "rgba(246,70,93,0.08)", border: "1px solid rgba(246,70,93,0.2)", borderRadius: 10, fontSize: 13, color: "var(--color-red)" }}>
          <strong>Trading is risky — if you don’t take risks, you can’t make profits.</strong>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }} className="bt-grid">
        {/* Left: Pairs list */}
        <div className="panel" style={{ padding: 16, alignSelf: "start" }} data-testid="bt-pairs">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }} className="text-dim">Pairs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {PAIRS.map((sym) => {
              const c = marketData.find((d) => d.symbol === sym);
              const chg = c ? c.change24h : 0;
              const active = symbol === sym;
              return (
                <button
                  key={sym}
                  onClick={() => setSymbol(sym)}
                  data-testid={`pair-${sym}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: active ? "rgba(240,185,11,0.08)" : "transparent",
                    border: "1px solid",
                    borderColor: active ? "rgba(240,185,11,0.4)" : "transparent",
                    borderRadius: 8,
                    cursor: "pointer",
                    color: "inherit",
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    transition: "all 0.15s",
                  }}
                >
                  <span>{sym}/USDT</span>
                  <span style={{ fontSize: 12, color: chg >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                    {chg >= 0 ? "+" : ""}{fmt(chg, 2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: main trading panel */}
        <div className="panel" style={{ padding: 22 }}>
          {/* Price header */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{symbol}/USDT</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>${fmt(price, price < 1 ? 4 : 2)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: change >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
              {change >= 0 ? "+" : ""}{fmt(change, 2)}%
            </div>
          </div>

          {/* Chart */}
          <div style={{ width: "100%", height: 180, background: "transparent", marginBottom: 22 }}>
            <Sparkline
              points={coin?.sparkline || []}
              color={chartColor}
              width={820}
              height={180}
              responsive
            />
          </div>

          {/* Active trade overlay */}
          {activeTrade && (
            <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, background: "rgba(240,185,11,0.06)", border: "1px solid rgba(240,185,11,0.25)" }} data-testid="bt-active">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="text-dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Active Trade</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                    {activeTrade.symbol}/USDT &nbsp;
                    <span style={{ color: activeTrade.direction === "rise" ? "var(--color-green)" : "var(--color-red)" }}>
                      {activeTrade.direction === "rise" ? "▲ Buy Up" : "▼ Buy Down"}
                    </span>
                  </div>
                  <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>
                    ${activeTrade.amount_usd.toLocaleString()} · +{(activeTrade.profit_rate * 100).toFixed(0)}%
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="text-dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Time Left</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: timeLeft <= 30 ? "var(--color-red)" : "var(--color-accent)" }}>{fmtTime(timeLeft)}</div>
                </div>
              </div>
              <div className="text-dim" style={{ fontSize: 11, marginTop: 10 }}>
                You can safely close this page — the trade will settle automatically when the timer ends.
              </div>
            </div>
          )}

          {lastResult && !activeTrade && (
            <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: lastResult.win ? "rgba(3,166,109,0.1)" : "rgba(246,70,93,0.08)", border: `1px solid ${lastResult.win ? "rgba(3,166,109,0.3)" : "rgba(246,70,93,0.25)"}` }} data-testid="bt-last-result">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: lastResult.win ? "var(--color-green)" : "var(--color-red)" }}>
                    {lastResult.win ? "🏆 Trade Won" : "📉 Trade Closed"}
                  </div>
                  <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>{lastResult.symbol}/USDT</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="text-dim" style={{ fontSize: 11 }}>Payout</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: lastResult.win ? "var(--color-green)" : "inherit" }}>${fmt(lastResult.payout)}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setLastResult(null)} data-testid="bt-dismiss-result">Dismiss</button>
              </div>
            </div>
          )}

          {/* Amount */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Amount (USDT)</div>
          <div className="bt-amount-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
            {AMOUNTS.map((a) => {
              const active = amount === a;
              const disabled = usdtBalance < a;
              return (
                <button
                  key={a}
                  onClick={() => !disabled && setAmount(a)}
                  disabled={disabled || !!activeTrade}
                  data-testid={`amount-${a}`}
                  style={{
                    padding: "14px 0",
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: active ? "var(--color-accent)" : "var(--border)",
                    background: active ? "var(--color-accent)" : "transparent",
                    color: active ? "#0b0e11" : "inherit",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: disabled || activeTrade ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.4 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  ${a.toLocaleString()}
                </button>
              );
            })}
          </div>

          {/* Manual amount input — accepts any positive amount up to your balance */}
          <div className="bt-manual-row" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>
              Manual
            </span>
            <div style={{ position: "relative", flex: 1, minWidth: 140 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", fontWeight: 700, pointerEvents: "none" }}>$</span>
              <input
                type="number"
                min={1}
                step="any"
                value={amountStr}
                disabled={!!activeTrade}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="Enter amount"
                data-testid="amount-manual"
                inputMode="decimal"
                className="input"
                style={{ paddingLeft: 26, width: "100%" }}
              />
            </div>
            <span className="text-dim" style={{ fontSize: 11, flexShrink: 0 }}>
              Type any amount you want
            </span>
          </div>

          {/* Duration */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Duration</div>
          <div className="bt-duration-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
            {DURATIONS.map((d) => {
              const active = duration === d.seconds;
              const locked = d.profit > maxAllowedPct;
              return (
                <button
                  key={d.seconds}
                  onClick={() => !locked && setDuration(d.seconds)}
                  disabled={!!activeTrade || locked}
                  data-testid={`duration-${d.seconds}`}
                  title={locked ? "Bu faiz dərəcəsi balansınız üçün kilidlidir" : ""}
                  style={{
                    padding: "14px 0",
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: active ? "var(--color-accent)" : "var(--border)",
                    background: active ? "var(--color-accent)" : "transparent",
                    color: active ? "#0b0e11" : "inherit",
                    cursor: activeTrade || locked ? "not-allowed" : "pointer",
                    opacity: locked ? 0.4 : 1,
                    transition: "all 0.15s",
                    position: "relative",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{d.label}</div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: active ? 0.8 : 0.7 }}>
                    +{d.profit}% profit{locked ? " 🔒" : ""}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Order Summary */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Order Summary</div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, marginBottom: 20 }} data-testid="bt-summary">
            {[
              ["Coin", `${symbol}/USDT`],
              ["Amount", `$${amount.toLocaleString()}`],
              ["Duration", selectedDuration?.label || "-"],
              ["Profit %", `${profitPct}%`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-dim" style={{ fontSize: 13 }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="text-dim" style={{ fontSize: 13 }}>Estimated payout</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-green)" }}>${fmt(estimatedPayout)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span className="text-dim" style={{ fontSize: 13 }}>Net profit</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-green)" }}>+${fmt(estimatedProfit)}</span>
            </div>
          </div>

          {err && <div style={{ color: "var(--color-red)", marginBottom: 12, fontSize: 13 }} data-testid="bt-err">{err}</div>}
          {amount > 0 && usdtBalance < amount && (
            <div style={{ color: "var(--color-red)", marginBottom: 12, fontSize: 13 }}>
              Insufficient balance.{" "}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => navigate("/deposit")}>Deposit now</button>
            </div>
          )}

          {/* Buy Up / Buy Down */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <button
              onClick={() => placeTrade("rise")}
              disabled={busy || !!activeTrade || amount <= 0 || usdtBalance < amount}
              data-testid="buy-up-btn"
              className="bt-buybtn bt-buyup"
              style={{
                padding: "20px 0",
                borderRadius: 12,
                border: "none",
                color: "#fff",
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 0.5,
                cursor: busy || activeTrade ? "not-allowed" : "pointer",
                opacity: busy || activeTrade || amount <= 0 || usdtBalance < amount ? 0.5 : 1,
                transition: "all 0.18s ease",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              ▲ Buy Up
            </button>
            <button
              onClick={() => placeTrade("fall")}
              disabled={busy || !!activeTrade || amount <= 0 || usdtBalance < amount}
              data-testid="buy-down-btn"
              className="bt-buybtn bt-buydown"
              style={{
                padding: "20px 0",
                borderRadius: 12,
                border: "none",
                color: "#fff",
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 0.5,
                cursor: busy || activeTrade ? "not-allowed" : "pointer",
                opacity: busy || activeTrade || amount <= 0 || usdtBalance < amount ? 0.5 : 1,
                transition: "all 0.18s ease",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              ▼ Buy Down
            </button>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="panel" style={{ marginTop: 22, padding: 0 }} data-testid="bt-recent-orders">
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Recent Orders</div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pair</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Duration</th>
                <th>Profit %</th>
                <th>Status</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={8} className="text-dim" style={{ textAlign: "center", padding: 24 }}>No orders yet.</td></tr>
              )}
              {orders.slice(0, 25).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()}</td>
                  <td>{o.symbol}/USDT</td>
                  <td style={{ color: o.direction === "rise" ? "var(--color-green)" : "var(--color-red)", fontWeight: 600 }}>
                    {o.direction === "rise" ? "▲ Up" : "▼ Down"}
                  </td>
                  <td>${o.amount_usd.toLocaleString()}</td>
                  <td>{Math.round(o.duration / 60)} min</td>
                  <td>+{(o.profit_rate * 100).toFixed(0)}%</td>
                  <td>
                    {o.status === "active"
                      ? <span className="pill pending">Active</span>
                      : <span className="pill approved">Completed</span>}
                  </td>
                  <td style={{ fontWeight: 700, color: o.result === "win" ? "var(--color-green)" : o.result === "loss" ? "var(--color-red)" : "inherit" }}>
                    {o.result === "win" ? `+$${fmt(o.profit)}` : o.result === "loss" ? `-$${fmt(Math.abs(o.profit))}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media (max-width: 880px) {
          .bt-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
