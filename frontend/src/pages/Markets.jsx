
Action: file_editor create /app/frontend/src/pages/Markets.jsx --file-text "import React, { useEffect, useState } from \"react\";
import { api, fmt } from \"@/lib/api\";
import Sparkline from \"@/components/Sparkline\";
import { ArrowUpRight, ArrowDownRight } from \"lucide-react\";

export default function Markets() {
  const [markets, setMarkets] = useState([]);
  const [sortKey, setSortKey] = useState(\"market_cap\");
  const [sortDir, setSortDir] = useState(\"desc\");

  useEffect(() => {
    const load = () => api.markets().then(d => setMarkets(d.markets || [])).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const sorted = [...markets].sort((a, b) => {
    const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
    return sortDir === \"asc\" ? va - vb : vb - va;
  });
  const setSort = (k) => {
    if (sortKey === k) setSortDir(d => d === \"asc\" ? \"desc\" : \"asc\");
    else { setSortKey(k); setSortDir(\"desc\"); }
  };
  const head = (k, label, align = \"right\") => (
    <th onClick={() => setSort(k)} className={`p-4 font-medium cursor-pointer hover:text-white select-none text-${align}`}>
      {label} {sortKey === k && <span className=\"text-[#007AFF] font-mono\">{sortDir === \"asc\" ? \"↑\" : \"↓\"}</span>}
    </th>
  );

  return (
    <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-8 lg:py-10\">
      <div className=\"mb-6\">
        <div className=\"label-eyebrow mb-1\">All markets</div>
        <h1 className=\"font-display text-3xl font-semibold\">Cryptocurrency prices</h1>
      </div>
      <div className=\"card-flat overflow-x-auto\">
        <table className=\"w-full text-sm\" data-testid=\"markets-table\">
          <thead>
            <tr className=\"text-slate-500 text-xs uppercase tracking-wider\">
              <th className=\"text-left p-4 font-medium\">Asset</th>
              {head(\"price\", \"Price\")}
              {head(\"change_1h\", \"1h %\")}
              {head(\"change_24h\", \"24h %\")}
              {head(\"change_7d\", \"7d %\")}
              {head(\"market_cap\", \"Market cap\")}
              {head(\"volume_24h\", \"Volume 24h\")}
              <th className=\"text-right p-4 font-medium hidden lg:table-cell\">7d trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const up = (m.change_24h || 0) >= 0;
              return (
                <tr key={m.id} className=\"border-t border-[#1E293B] hover:bg-[#1A233A]\" data-testid={`market-row-${m.symbol}`}>
                  <td className=\"p-4\">
                    <div className=\"flex items-center gap-3\">
                      <img src={m.image} alt=\"\" className=\"w-7 h-7\" />
                      <div>
                        <div className=\"font-medium\">{m.name}</div>
                        <div className=\"text-xs text-slate-500 font-mono uppercase\">{m.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className=\"p-4 text-right font-mono\">{fmt.price(m.price)}</td>
                  <ChangeCell v={m.change_1h} />
                  <ChangeCell v={m.change_24h} />
                  <ChangeCell v={m.change_7d} />
                  <td className=\"p-4 text-right font-mono text-slate-300\">{fmt.big(m.market_cap)}</td>
                  <td className=\"p-4 text-right font-mono text-slate-300\">{fmt.big(m.volume_24h)}</td>
                  <td className=\"p-4 hidden lg:table-cell\"><div className=\"w-32 ml-auto\"><Sparkline data={m.sparkline} up={up} height={36} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeCell({ v }) {
  const up = (v || 0) >= 0;
  return (
    <td className={`p-4 text-right font-mono ${up ? \"text-up\" : \"text-down\"}`}>
      <span className=\"inline-flex items-center gap-1 justify-end\">
        {up ? <ArrowUpRight className=\"w-3 h-3\" /> : <ArrowDownRight className=\"w-3 h-3\" />}
        {fmt.pct(v)}
      </span>
    </td>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/
