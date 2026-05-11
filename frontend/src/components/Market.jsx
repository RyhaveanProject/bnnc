import React, { useEffect, useState, useRef } from "react";
import api, { fmtMoney } from "../lib/api";

export function useMarket(interval = 6000) {
  const [data, setData] = useState([]);
  const prev = useRef({});
  const [flash, setFlash] = useState({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data: rows } = await api.get("/market/prices");
        if (!mounted) return;
        const f = {};
        rows.forEach(r => {
          const old = prev.current[r.symbol];
          if (old != null) {
            if (r.price > old) f[r.symbol] = "up";
            else if (r.price < old) f[r.symbol] = "down";
          }
          prev.current[r.symbol] = r.price;
        });
        setFlash(f);
        setData(rows);
      } catch (e) { /* ignore */ }
    };
    load();
    const t = setInterval(load, interval);
    return () => { mounted = false; clearInterval(t); };
  }, [interval]);

  return { data, flash };
}

export function Sparkline({ points, color = "#0ecb81", width = 96, height = 32 }) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - ((p - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height}>
      <path d={d} className="spark" stroke={color} />
    </svg>
  );
}

export function PriceTicker() {
  const { data, flash } = useMarket(5000);
  if (!data.length) return <div className="ticker"><span className="text-dim">Loading markets…</span></div>;
  return (
    <div className="ticker" data-testid="price-ticker">
      {data.map(d => (
        <div key={d.symbol} className={`tk ${flash[d.symbol]==="up"?"flash-up":flash[d.symbol]==="down"?"flash-down":""}`}>
          <span className="sym">{d.symbol}/USDT</span>
          <span>${fmtMoney(d.price)}</span>
          <span className={d.change24h >= 0 ? "text-green" : "text-red"}>
            {d.change24h >= 0 ? "+" : ""}{d.change24h.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function MarketTable({ compact = false, onSelect }) {
  const { data, flash } = useMarket(6000);
  return (
    <div className="panel" data-testid="market-table">
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Live Markets</div>
      <div style={{overflowX:"auto"}}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Pair</th><th>Price</th><th>24h</th>{!compact && <th className="hide-mobile">Volume</th>}<th>Chart</th>
            {onSelect && <th></th>}
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.symbol} className={flash[d.symbol]==="up"?"flash-up":flash[d.symbol]==="down"?"flash-down":""}>
              <td style={{fontWeight:600}}>{d.symbol}/USDT</td>
              <td>${fmtMoney(d.price)}</td>
              <td className={d.change24h >= 0 ? "text-green" : "text-red"}>
                {d.change24h >= 0 ? "+" : ""}{d.change24h.toFixed(2)}%
              </td>
              {!compact && <td className="hide-mobile">${fmtMoney(d.volume24h, 0)}</td>}
              <td><Sparkline points={d.sparkline} color={d.change24h>=0?"#0ecb81":"#f6465d"} /></td>
              {onSelect && <td><button className="btn btn-primary btn-sm" data-testid={`trade-${d.symbol}-btn`} onClick={() => onSelect(d.symbol)}>Trade</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
