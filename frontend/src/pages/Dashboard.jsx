
Action: file_editor create /app/frontend/src/pages/Dashboard.jsx --file-text "import React, { useEffect, useRef, useState } from \"react\";
import { api, fmt } from \"@/lib/api\";
import { useAuth } from \"@/context/AuthContext\";
import Sparkline from \"@/components/Sparkline\";
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, Activity } from \"lucide-react\";
import { Link } from \"react-router-dom\";

export default function Dashboard() {
  const { user } = useAuth();
  const [markets, setMarkets] = useState([]);
  const prevPrices = useRef({});
  const [flash, setFlash] = useState({}); // {id: 'up'|'down'}

  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.markets();
        const newFlash = {};
        (d.markets || []).forEach(m => {
          const prev = prevPrices.current[m.id];
          if (prev !== undefined && prev !== m.price) newFlash[m.id] = m.price > prev ? \"up\" : \"down\";
          prevPrices.current[m.id] = m.price;
        });
        setMarkets(d.markets || []);
        if (Object.keys(newFlash).length) {
          setFlash(newFlash);
          setTimeout(() => setFlash({}), 1100);
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-8 lg:py-10\">
      {/* Top: balance */}
      <div className=\"grid lg:grid-cols-3 gap-4 mb-8\">
        <div className=\"card-flat p-6 lg:col-span-2\">
          <div className=\"label-eyebrow mb-2\">Portfolio balance · USD</div>
          <div className=\"font-display text-4xl sm:text-5xl font-semibold tracking-tight\" data-testid=\"dashboard-balance\">
            {fmt.usd(user?.balance_usd || 0)}
          </div>
          <div className=\"mt-6 flex flex-wrap gap-3\">
            <Link to=\"/deposit\" className=\"btn-primary inline-flex items-center gap-2\" data-testid=\"dashboard-deposit-btn\">
              <Wallet className=\"w-4 h-4\" /> Deposit
            </Link>
            <Link to=\"/markets\" className=\"btn-ghost inline-flex items-center gap-2\">
              <TrendingUp className=\"w-4 h-4\" /> Markets
            </Link>
          </div>
        </div>
        <div className=\"card-flat p-6\">
          <div className=\"label-eyebrow mb-2\">Account</div>
          <div className=\"space-y-2.5 mt-4 text-sm\">
            <Row k=\"Email\" v={<span className=\"font-mono\">{user?.email}</span>} />
            <Row k=\"Account type\" v={<span className=\"capitalize\">{user?.role}</span>} />
            <Row k=\"Member since\" v={<span className=\"font-mono text-xs\">{user?.created_at?.slice(0,10)}</span>} />
          </div>
        </div>
      </div>

      {/* Market cards grid */}
      <div className=\"flex items-end justify-between mb-5\">
        <div>
          <div className=\"label-eyebrow mb-1\">Live markets</div>
          <h2 className=\"font-display text-2xl font-semibold flex items-center gap-2\">
            <Activity className=\"w-5 h-5 text-[#007AFF]\" /> Watchlist
          </h2>
        </div>
        <span className=\"text-xs text-slate-500 font-mono\">auto-refresh 15s</span>
      </div>

      <div className=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4\">
        {markets.map((m) => {
          const up = (m.change_24h || 0) >= 0;
          const flashClass = flash[m.id] === \"up\" ? \"price-flash-up\" : flash[m.id] === \"down\" ? \"price-flash-down\" : \"\";
          return (
            <div key={m.id} className={`card-flat p-5 ${flashClass}`} data-testid={`dash-card-${m.symbol}`}>
              <div className=\"flex items-center gap-2.5 mb-4\">
                <img src={m.image} alt=\"\" className=\"w-8 h-8\" />
                <div>
                  <div className=\"font-medium text-sm\">{m.symbol}</div>
                  <div className=\"text-xs text-slate-500\">{m.name}</div>
                </div>
              </div>
              <div className=\"font-mono text-xl font-semibold\" data-testid={`dash-price-${m.symbol}`}>{fmt.price(m.price)}</div>
              <div className={`text-xs font-mono mt-1 flex items-center gap-1 ${up ? \"text-up\" : \"text-down\"}`}>
                {up ? <ArrowUpRight className=\"w-3 h-3\" /> : <ArrowDownRight className=\"w-3 h-3\" />}
                {fmt.pct(m.change_24h)} <span className=\"text-slate-600 ml-1\">24h</span>
              </div>
              <div className=\"mt-3 -mx-1\"><Sparkline data={m.sparkline} up={up} height={48} /></div>
              <div className=\"mt-3 pt-3 border-t border-[#1E293B] grid grid-cols-2 gap-2 text-xs\">
                <div>
                  <div className=\"text-slate-500\">Market cap</div>
                  <div className=\"font-mono text-slate-300\">{fmt.big(m.market_cap)}</div>
                </div>
                <div>
                  <div className=\"text-slate-500\">Volume</div>
                  <div className=\"font-mono text-slate-300\">{fmt.big(m.volume_24h)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className=\"flex items-center justify-between divider-row pb-2.5 last:border-0\">
    <span className=\"text-slate-500 text-xs uppercase tracking-wider\">{k}</span>
    <span>{v}</span>
  </div>
);
"
Observation: Create successful: /app/frontend/src/pages/
