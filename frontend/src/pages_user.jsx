 
Action: file_editor create /app/frontend/src/ --file-text "import React, { useEffect, useState } from \"react\";
import client from \"./api\";
import Navbar from \"./Navbar\";
import MarketTicker from \"./MarketTicker\";
import Sparkline from \"./Sparkline\";
import { useAuth, formatError } from \"./auth\";
import { useNavigate } from \"react-router-dom\";

export function Markets() {
  const [items, setItems] = useState([]);
  const [prev, setPrev] = useState({});
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await client.get(\"/market\");
        setItems((cur) => {
          const map = {};
          cur.forEach((c) => (map[c.symbol] = c.price));
          setPrev(map);
          return data.data || [];
        });
      } catch {}
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      <Navbar />
      <MarketTicker />
      <div style={{ maxWidth: 1240, margin: \"0 auto\", padding: 24 }}>
        <h2>Markets</h2>
        <div className=\"bnnc-card\">
          <table className=\"bnnc-table\">
            <thead>
              <tr><th>#</th><th>Coin</th><th>Price</th><th>24h Change</th><th>24h Volume</th><th>Market Cap</th><th>Chart (7d)</th></tr>
            </thead>
            <tbody>
              {items.map((c, i) => {
                const flash = prev[c.symbol] && prev[c.symbol] !== c.price ? (c.price > prev[c.symbol] ? \"flash-up\" : \"flash-down\") : \"\";
                return (
                  <tr key={c.symbol} className={flash} data-testid={`market-row-${c.symbol}`}>
                    <td>{i + 1}</td>
                    <td>
                      <div style={{ display: \"flex\", gap: 10, alignItems: \"center\" }}>
                        {c.image && <img src={c.image} alt={c.symbol} width={22} height={22} />}
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.symbol}</div>
                          <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>{c.name}</div>
                        </div>
                      </div>
                    </td>
                    <td>${c.price?.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className={c.change_24h >= 0 ? \"text-up\" : \"text-down\"}>{c.change_24h?.toFixed(2)}%</td>
                    <td>${(c.volume_24h || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td>${(c.market_cap || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td><Sparkline data={c.sparkline} up={c.change_24h >= 0} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Wallet() {
  const { user, refresh } = useAuth();
  const [bals, setBals] = useState(user?.balances || {});
  const [prices, setPrices] = useState({});
  useEffect(() => {
    const load = async () => {
      try {
        const me = await client.get(\"/auth/me\");
        setBals(me.data.user.balances || {});
        const mkt = await client.get(\"/market\");
        const p = {};
        mkt.data.data.forEach((c) => (p[c.symbol] = c.price));
        setPrices(p);
      } catch {}
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);
  const totalUSD = Object.entries(bals).reduce((sum, [sym, amt]) => {
    const p = sym === \"USDT\" ? 1 : prices[sym] || 0;
    return sum + (amt || 0) * p;
  }, 0);
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 1240, margin: \"0 auto\", padding: 24 }}>
        <h2>My Wallet</h2>
        <div className=\"bnnc-card\" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ color: \"var(--bnnc-text-dim)\", fontSize: 13 }}>Total Estimated Balance</div>
          <div style={{ fontSize: 36, fontWeight: 800, marginTop: 6 }} data-testid=\"total-balance\">≈ ${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className=\"bnnc-card\">
          <table className=\"bnnc-table\">
            <thead><tr><th>Coin</th><th>Balance</th><th>Price (USD)</th><th>Value (USD)</th></tr></thead>
            <tbody>
              {Object.entries(bals).map(([sym, amt]) => {
                const p = sym === \"USDT\" ? 1 : prices[sym] || 0;
                return (
                  <tr key={sym} data-testid={`wallet-row-${sym}`}>
                    <td><strong>{sym}</strong></td>
                    <td>{(amt || 0).toFixed(8)}</td>
                    <td>${p.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    <td>${((amt || 0) * p).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Trade() {
  const [items, setItems] = useState([]);
  const [symbol, setSymbol] = useState(\"BTC\");
  const [side, setSide] = useState(\"buy\");
  const [qty, setQty] = useState(\"\");
  const [msg, setMsg] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [bals, setBals] = useState({});
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    try {
      const { data } = await client.get(\"/market\");
      setItems((data.data || []).filter((c) => [\"BTC\", \"ETH\", \"BNB\", \"XRP\", \"SOL\"].includes(c.symbol)));
      const me = await client.get(\"/auth/me\");
      setBals(me.data.user.balances || {});
    } catch {}
  };
  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 5000);
    return () => clearInterval(id);
  }, []);
  const current = items.find((c) => c.symbol === symbol);
  const price = current?.price || 0;
  const total = side === \"buy\" ? Number(qty) || 0 : (Number(qty) || 0) * price;

  const submit = async () => {
    setErr(\"\"); setMsg(\"\");
    if (!qty || Number(qty) <= 0) { setErr(\"Miqdar daxil edin\"); return; }
    setLoading(true);
    try {
      const body = side === \"buy\"
        ? { symbol, side, quote_amount: Number(qty) }
        : { symbol, side, base_amount: Number(qty) };
      const { data } = await client.post(\"/trade\", body);
      setMsg(`✓ ${side === \"buy\" ? \"Aldı\" : \"Satdı\"}: ${data.trade.amount.toFixed(8)} ${symbol} @ $${data.trade.price.toFixed(2)}`);
      setBals(data.balances);
      setQty(\"\");
    } catch (e) {
      setErr(formatError(e));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <Navbar />
      <MarketTicker />
      <div style={{ maxWidth: 1240, margin: \"0 auto\", padding: 24, display: \"grid\", gridTemplateColumns: \"2fr 1fr\", gap: 20 }}>
        <div>
          <div className=\"bnnc-card\" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: \"flex\", justifyContent: \"space-between\", alignItems: \"center\" }}>
              <div>
                <h2 style={{ margin: 0 }}>{symbol}/USDT</h2>
                <div style={{ display: \"flex\", gap: 24, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Last Price</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }} data-testid=\"trade-price\">${price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>24h Change</div>
                    <div className={current?.change_24h >= 0 ? \"text-up\" : \"text-down\"} style={{ fontSize: 18, fontWeight: 600 }}>{current?.change_24h?.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>24h High</div>
                    <div>${current?.high_24h?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>24h Low</div>
                    <div>${current?.low_24h?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <Sparkline data={current?.sparkline} up={current?.change_24h >= 0} width={200} height={70} />
            </div>
          </div>
          <div className=\"bnnc-card\" style={{ padding: 0 }}>
            <div style={{ display: \"flex\", borderBottom: \"1px solid var(--bnnc-border)\" }}>
              {items.map((c) => (
                <button
                  key={c.symbol}
                  onClick={() => setSymbol(c.symbol)}
                  className={`tab ${symbol === c.symbol ? \"active\" : \"\"}`}
                  style={{ background: \"transparent\", border: \"none\", borderBottom: symbol === c.symbol ? \"2px solid var(--bnnc-gold)\" : \"2px solid transparent\" }}
                  data-testid={`tab-${c.symbol}`}
                >
                  {c.symbol}/USDT
                </button>
              ))}
            </div>
            <div style={{ padding: 20 }}>
              <table className=\"bnnc-table\">
                <thead><tr><th>Pair</th><th>Price</th><th>24h Change</th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.symbol} onClick={() => setSymbol(c.symbol)} style={{ cursor: \"pointer\" }}>
                      <td><strong>{c.symbol}</strong>/USDT</td>
                      <td>${c.price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className={c.change_24h >= 0 ? \"text-up\" : \"text-down\"}>{c.change_24h?.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div>
          <div className=\"bnnc-card\" style={{ padding: 20 }}>
            <div style={{ display: \"flex\", marginBottom: 16, borderBottom: \"1px solid var(--bnnc-border)\" }}>
              <div className={`tab ${side === \"buy\" ? \"active\" : \"\"}`} onClick={() => setSide(\"buy\")} data-testid=\"tab-buy\">Buy</div>
              <div className={`tab ${side === \"sell\" ? \"active\" : \"\"}`} onClick={() => setSide(\"sell\")} data-testid=\"tab-sell\">Sell</div>
            </div>
            <div style={{ marginBottom: 10, fontSize: 13, color: \"var(--bnnc-text-dim)\" }}>
              Mövcud: {side === \"buy\" ? `${(bals.USDT||0).toFixed(2)} USDT` : `${(bals[symbol]||0).toFixed(8)} ${symbol}`}
            </div>
            <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>
              {side === \"buy\" ? \"Total (USDT)\" : `Amount (${symbol})`}
            </label>
            <input className=\"bnnc-input\" type=\"number\" step=\"any\" value={qty} onChange={(e) => setQty(e.target.value)} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"trade-qty\"/>
            <div style={{ fontSize: 13, color: \"var(--bnnc-text-dim)\", marginBottom: 16 }}>
              {side === \"buy\" ? `~ ${(total / (price||1)).toFixed(8)} ${symbol}` : `~ ${total.toFixed(2)} USDT`}
            </div>
            {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"trade-error\">{err}</div>}
            {msg && <div className=\"text-up\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"trade-success\">{msg}</div>}
            <button
              className={side === \"buy\" ? \"bnnc-btn bnnc-btn-green\" : \"bnnc-btn bnnc-btn-red\"}
              style={{ width: \"100%\" }}
              disabled={loading}
              onClick={submit}
              data-testid=\"trade-submit\"
            >
              {loading ? \"...\" : side === \"buy\" ? `Buy ${symbol}` : `Sell ${symbol}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Deposit() {
  const [currency, setCurrency] = useState(\"USDT\");
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState(\"\");
  const [msg, setMsg] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setErr(\"\"); setMsg(\"\");
      try {
        const { data } = await client.get(`/deposit/info/${currency}`);
        setInfo(data);
      } catch (e) { setErr(formatError(e)); }
    };
    load();
  }, [currency]);

  const copy = () => {
    if (info?.address) navigator.clipboard.writeText(info.address);
  };

  const confirm = async () => {
    setErr(\"\"); setMsg(\"\");
    if (!amount || Number(amount) <= 0) { setErr(\"Məbləğ daxil edin\"); return; }
    setLoading(true);
    try {
      await client.post(\"/deposit/request\", { currency, amount: Number(amount) });
      setMsg(\"✓ Deposit sorğusu admin təsdiqinə göndərildi. Admin təsdiqlədikdən sonra balansınıza əlavə olunacaq.\");
      setAmount(\"\");
    } catch (e) {
      setErr(formatError(e));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 900, margin: \"0 auto\", padding: 24 }}>
        <h2>Deposit</h2>
        <div className=\"bnnc-card\" style={{ padding: 24 }}>
          <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Valyuta seçin</label>
          <div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\", marginTop: 8, marginBottom: 24 }}>
            {[\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"].map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={currency === c ? \"bnnc-btn\" : \"bnnc-btn-ghost bnnc-btn\"}
                style={{ padding: \"8px 18px\" }}
                data-testid={`deposit-coin-${c}`}
              >{c}</button>
            ))}
          </div>
          {info && (
            <div style={{ display: \"grid\", gridTemplateColumns: \"1fr 200px\", gap: 24, alignItems: \"start\" }}>
              <div>
                <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Network</div>
                <div style={{ marginBottom: 14, fontWeight: 600 }} data-testid=\"deposit-network\">{info.network}</div>

                <div style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Wallet Address</div>
                <div style={{ display: \"flex\", gap: 8, alignItems: \"center\", marginBottom: 14 }}>
                  <code style={{ background: \"var(--bnnc-panel-2)\", padding: \"10px 12px\", borderRadius: 4, fontSize: 13, wordBreak: \"break-all\", flex: 1 }} data-testid=\"deposit-address\">
                    {info.address}
                  </code>
                  <button className=\"copy-btn\" onClick={copy} data-testid=\"deposit-copy\">Copy</button>
                </div>

                <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Deposit miqdarı ({currency})</label>
                <input className=\"bnnc-input\" type=\"number\" step=\"any\" value={amount} onChange={(e)=>setAmount(e.target.value)} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"deposit-amount\"/>

                {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"deposit-error\">{err}</div>}
                {msg && <div className=\"text-up\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"deposit-success\">{msg}</div>}
                <button className=\"bnnc-btn\" style={{ width: \"100%\" }} disabled={loading} onClick={confirm} data-testid=\"deposit-confirm\">
                  {loading ? \"...\" : \"Ödənişi təsdiqlə\"}
                </button>
                <p style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\", marginTop: 12 }}>
                  ⚠️ Ödənişi yuxarıdakı ünvana göndərdikdən sonra \"Ödənişi təsdiqlə\" düyməsinə basın. Admin təsdiqlədikdə balansınız avtomatik artırılacaq.
                </p>
              </div>
              <div style={{ textAlign: \"center\" }}>
                {info.qr ? (
                  <img src={info.qr} alt=\"QR\" style={{ width: 180, height: 180, background: \"white\", padding: 8, borderRadius: 8 }} data-testid=\"deposit-qr\"/>
                ) : (
                  <div style={{ width: 180, height: 180, background: \"var(--bnnc-panel-2)\", borderRadius: 8, display: \"flex\", alignItems: \"center\", justifyContent: \"center\", color: \"var(--bnnc-text-dim)\" }}>No QR</div>
                )}
                <div style={{ fontSize: 11, color: \"var(--bnnc-text-dim)\", marginTop: 8 }}>Scan QR code</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Withdraw() {
  const [currency, setCurrency] = useState(\"USDT\");
  const [amount, setAmount] = useState(\"\");
  const [address, setAddress] = useState(\"\");
  const [fee, setFee] = useState(0);
  const [network, setNetwork] = useState(\"\");
  const [bals, setBals] = useState({});
  const [msg, setMsg] = useState(\"\");
  const [err, setErr] = useState(\"\");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const f = await client.get(`/withdraw/fee/${currency}`);
        setFee(f.data.fee);
        setNetwork(f.data.network);
        const me = await client.get(\"/auth/me\");
        setBals(me.data.user.balances || {});
      } catch {}
    };
    load();
  }, [currency]);

  const total = (Number(amount) || 0) + fee;
  const submit = async () => {
    setErr(\"\"); setMsg(\"\");
    if (!amount || Number(amount) <= 0) { setErr(\"Məbləğ daxil edin\"); return; }
    if (!address || address.length < 10) { setErr(\"Düzgün cüzdan ünvanı daxil edin\"); return; }
    setLoading(true);
    try {
      await client.post(\"/withdraw/request\", { currency, amount: Number(amount), address });
      setMsg(\"✓ Withdraw sorğusu göndərildi. Admin təsdiqinə gözləyin.\");
      setAmount(\"\"); setAddress(\"\");
      const me = await client.get(\"/auth/me\");
      setBals(me.data.user.balances || {});
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 720, margin: \"0 auto\", padding: 24 }}>
        <h2>Withdraw</h2>
        <div className=\"bnnc-card\" style={{ padding: 24 }}>
          <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Valyuta seçin</label>
          <div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\", marginTop: 8, marginBottom: 18 }}>
            {[\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"].map((c) => (
              <button key={c} onClick={() => setCurrency(c)} className={currency === c ? \"bnnc-btn\" : \"bnnc-btn-ghost bnnc-btn\"} style={{ padding: \"8px 18px\" }} data-testid={`withdraw-coin-${c}`}>{c}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: \"var(--bnnc-text-dim)\", marginBottom: 14 }}>
            Balans: <strong style={{ color: \"var(--bnnc-text)\" }}>{(bals[currency] || 0).toFixed(8)} {currency}</strong> · Network: {network}
          </div>
          <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Cüzdan ünvanı</label>
          <input className=\"bnnc-input\" value={address} onChange={(e)=>setAddress(e.target.value)} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"withdraw-address\" placeholder={`${currency} address`}/>
          <label style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>Məbləğ ({currency})</label>
          <input className=\"bnnc-input\" type=\"number\" step=\"any\" value={amount} onChange={(e)=>setAmount(e.target.value)} style={{ marginTop: 6, marginBottom: 14 }} data-testid=\"withdraw-amount\"/>
          <div style={{ background: \"var(--bnnc-panel-2)\", padding: 14, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
            <div style={{ display: \"flex\", justifyContent: \"space-between\" }}><span>Network Fee:</span><strong>{fee} {currency}</strong></div>
            <div style={{ display: \"flex\", justifyContent: \"space-between\", marginTop: 6 }}><span>Total dəyəcək:</span><strong data-testid=\"withdraw-total\">{total.toFixed(8)} {currency}</strong></div>
          </div>
          {err && <div className=\"text-down\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"withdraw-error\">{err}</div>}
          {msg && <div className=\"text-up\" style={{ fontSize: 13, marginBottom: 10 }} data-testid=\"withdraw-success\">{msg}</div>}
          <button className=\"bnnc-btn\" style={{ width: \"100%\" }} disabled={loading} onClick={submit} data-testid=\"withdraw-submit\">
            {loading ? \"...\" : \"Withdraw sorğusu göndər\"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function History() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = async () => {
      try { const { data } = await client.get(\"/transactions\"); setItems(data.transactions || []); }
      catch {}
    };
    load();
  }, []);
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 1240, margin: \"0 auto\", padding: 24 }}>
        <h2>Transaction History</h2>
        <div className=\"bnnc-card\">
          <table className=\"bnnc-table\">
            <thead><tr><th>Time</th><th>Type</th><th>Currency</th><th>Amount</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6} style={{ textAlign: \"center\", color: \"var(--bnnc-text-dim)\" }}>No transactions</td></tr>}
              {items.map((t) => (
                <tr key={t.id} data-testid={`history-row-${t.id}`}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td style={{ textTransform: \"capitalize\" }}>{t.type} {t.side ? `(${t.side})` : \"\"}</td>
                  <td>{t.currency || t.symbol}</td>
                  <td>{(t.amount || 0).toFixed(8)}</td>
                  <td><span style={{ padding: \"2px 8px\", borderRadius: 4, fontSize: 12, background: t.status === \"approved\" || t.status === \"filled\" ? \"rgba(14,203,129,.15)\" : t.status === \"rejected\" ? \"rgba(246,70,93,.15)\" : \"rgba(240,185,11,.15)\", color: t.status === \"approved\" || t.status === \"filled\" ? \"var(--bnnc-green)\" : t.status === \"rejected\" ? \"var(--bnnc-red)\" : \"var(--bnnc-gold)\" }}>{t.status}</span></td>
                  <td style={{ fontSize: 12, color: \"var(--bnnc-text-dim)\" }}>
                    {t.address ? `→ ${t.address.slice(0, 10)}...` : \"\"}
                    {t.price ? `@ $${t.price.toFixed(2)}` : \"\"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Support() {
  const [url, setUrl] = useState(\"\");
  useEffect(() => {
    client.get(\"/live-chat\").then(({ data }) => setUrl(data.url || \"\")).catch(() => {});
  }, []);
  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 1240, margin: \"0 auto\", padding: 24 }}>
        <h2>💬 Live Support</h2>
        {!url || url.includes(\"placeholder\") ? (
          <div className=\"bnnc-card\" style={{ padding: 24 }}>
            <p>Live chat URL hələ konfiqurasiya edilməyib. Admin .env faylında <code>LIVE_CHAT_URL</code> dəyişənini təyin etməlidir.</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <a href={url} target=\"_blank\" rel=\"noopener noreferrer\">
                <button className=\"bnnc-btn\" data-testid=\"support-open-link\">Yeni pəncərədə aç</button>
              </a>
            </div>
            <div className=\"bnnc-card\" style={{ padding: 0, overflow: \"hidden\" }}>
              <iframe src={url} style={{ width: \"100%\", height: 600, border: 0 }} title=\"Live Chat\" data-testid=\"support-iframe\"/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/pages_user.jsx
