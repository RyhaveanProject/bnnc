
Action: file_editor create /app/frontend/src/components/MarketTicker.jsx --file-text "import React, { useEffect, useState } from \"react\";
import Marquee from \"react-fast-marquee\";
import { api, fmt } from \"@/lib/api\";
import { ArrowDownRight, ArrowUpRight } from \"lucide-react\";

export default function MarketTicker() {
  const [markets, setMarkets] = useState([]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const d = await api.markets();
        if (mounted) setMarkets(d.markets || []);
      } catch {}
    };
    load();
    const t = setInterval(load, 20000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (!markets.length) return <div className=\"h-10 border-y border-[#1E293B]\" />;

  return (
    <div className=\"border-y border-[#1E293B] bg-[#0B0F19]\" data-testid=\"market-ticker\">
      <Marquee gradient={false} speed={36} pauseOnHover>
        {markets.concat(markets).map((m, i) => {
          const up = (m.change_24h || 0) >= 0;
          return (
            <div key={i} className=\"flex items-center gap-3 px-6 py-2.5 text-sm\">
              {m.image && <img src={m.image} alt={m.symbol} className=\"w-4 h-4\" />}
              <span className=\"font-medium text-white\">{m.symbol}</span>
              <span className=\"font-mono text-slate-300\">{fmt.price(m.price)}</span>
              <span className={`font-mono flex items-center gap-0.5 ${up ? \"text-up\" : \"text-down\"}`}>
                {up ? <ArrowUpRight className=\"w-3 h-3\" /> : <ArrowDownRight className=\"w-3 h-3\" />}
                {fmt.pct(m.change_24h)}
              </span>
              <span className=\"text-slate-600\">|</span>
            </div>
          );
        })}
      </Marquee>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/components/
