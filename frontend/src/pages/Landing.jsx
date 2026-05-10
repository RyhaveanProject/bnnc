 
Action: file_editor create /app/frontend/src/pages/Landing.jsx --file-text "import React, { useEffect, useState } from \"react\";
import { Link } from \"react-router-dom\";
import { ArrowRight, Shield, Zap, Globe, ArrowUpRight, ArrowDownRight, ChevronRight } from \"lucide-react\";
import { api, fmt } from \"@/lib/api\";
import Sparkline from \"@/components/Sparkline\";
import MarketTicker from \"@/components/MarketTicker\";

const FEATURES = [
  { icon: Shield, title: \"Institutional-grade security\", body: \"Cold storage, encrypted vaults and 24/7 risk monitoring keep your capital protected.\" },
  { icon: Zap, title: \"Sub-second execution\", body: \"Direct market access with low-latency matching engine for serious traders.\" },
  { icon: Globe, title: \"Global liquidity\", body: \"Aggregated order books across major venues for tighter spreads, deeper books.\" },
];

export default function Landing() {
  const [markets, setMarkets] = useState([]);
  useEffect(() => {
    api.markets().then(d => setMarkets(d.markets || [])).catch(() => {});
    const t = setInterval(() => api.markets().then(d => setMarkets(d.markets || [])).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className=\"min-h-screen bg-[#0B0F19] text-white\">
      {/* Nav */}
      <header className=\"glass-nav sticky top-0 z-50\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 h-16 flex items-center justify-between\">
          <Link to=\"/\" className=\"flex items-center gap-2.5\" data-testid=\"landing-brand\">
            <div className=\"w-7 h-7 bg-[#007AFF] flex items-center justify-center rounded-sm\">
              <span className=\"font-display font-bold text-white text-sm\">P</span>
            </div>
            <span className=\"font-display text-lg font-semibold tracking-tight\">PROCX</span>
          </Link>
          <nav className=\"hidden md:flex items-center gap-7 text-sm text-slate-400\">
            <a href=\"#markets\" className=\"hover:text-white transition-colors\">Markets</a>
            <a href=\"#features\" className=\"hover:text-white transition-colors\">Why PROCX</a>
            <a href=\"#security\" className=\"hover:text-white transition-colors\">Security</a>
          </nav>
          <div className=\"flex items-center gap-3\">
            <Link to=\"/login\" className=\"text-sm text-slate-300 hover:text-white px-3 py-2\" data-testid=\"nav-login\">Sign in</Link>
            <Link to=\"/register\" className=\"btn-primary text-sm\" data-testid=\"nav-register\">Open account</Link>
          </div>
        </div>
      </header>

      <MarketTicker />

      {/* Hero */}
      <section className=\"relative overflow-hidden grid-bg\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-20 lg:py-28 grid lg:grid-cols-12 gap-10 items-center\">
          <div className=\"lg:col-span-7\">
            <div className=\"label-eyebrow mb-6\">Pro-grade digital asset exchange</div>
            <h1 className=\"font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]\">
              The institutional <br />
              <span className=\"text-[#007AFF]\">crypto desk,</span> <br />
              built for everyone.
            </h1>
            <p className=\"mt-7 text-slate-400 max-w-xl leading-relaxed\">
              Trade Bitcoin, Ethereum and the world's leading digital assets with deep liquidity,
              transparent fees and execution engineered for professionals.
            </p>
            <div className=\"mt-10 flex flex-wrap gap-3\">
              <Link to=\"/register\" className=\"btn-primary inline-flex items-center gap-2\" data-testid=\"hero-cta-register\">
                Start trading <ArrowRight className=\"w-4 h-4\" />
              </Link>
              <Link to=\"/login\" className=\"btn-ghost inline-flex items-center gap-2\" data-testid=\"hero-cta-login\">
                Existing account
              </Link>
            </div>
            <div className=\"mt-12 grid grid-cols-3 gap-6 max-w-lg\">
              <Stat label=\"Volume 24h\" value=\"$184B\" />
              <Stat label=\"Assets\" value=\"120+\" />
              <Stat label=\"Uptime\" value=\"99.99%\" />
            </div>
          </div>
          <div className=\"lg:col-span-5\">
            <div className=\"card-flat p-5\">
              <div className=\"flex items-center justify-between mb-4\">
                <span className=\"label-eyebrow\">Live market</span>
                <span className=\"text-xs text-slate-500 font-mono\">CoinGecko · 30s</span>
              </div>
              <div className=\"space-y-1\">
                {markets.slice(0, 5).map((m) => {
                  const up = (m.change_24h || 0) >= 0;
                  return (
                    <div key={m.id} className=\"flex items-center justify-between py-3 divider-row last:border-0\">
                      <div className=\"flex items-center gap-3\">
                        <img src={m.image} alt=\"\" className=\"w-7 h-7\" />
                        <div>
                          <div className=\"font-medium text-sm\">{m.name}</div>
                          <div className=\"text-xs text-slate-500 font-mono uppercase\">{m.symbol}</div>
                        </div>
                      </div>
                      <div className=\"w-24 hidden sm:block\"><Sparkline data={m.sparkline} up={up} height={32} /></div>
                      <div className=\"text-right\">
                        <div className=\"font-mono text-sm\">{fmt.price(m.price)}</div>
                        <div className={`text-xs font-mono ${up ? \"text-up\" : \"text-down\"}`}>{fmt.pct(m.change_24h)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Markets list */}
      <section id=\"markets\" className=\"border-t border-[#1E293B]\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-16\">
          <div className=\"flex items-end justify-between mb-8\">
            <div>
              <div className=\"label-eyebrow mb-2\">Top markets</div>
              <h2 className=\"font-display text-2xl sm:text-3xl font-semibold\">Live across major assets</h2>
            </div>
            <Link to=\"/markets\" className=\"text-sm text-[#007AFF] hover:underline flex items-center gap-1\">All markets <ChevronRight className=\"w-4 h-4\" /></Link>
          </div>
          <div className=\"card-flat overflow-x-auto\">
            <table className=\"w-full text-sm\">
              <thead>
                <tr className=\"text-slate-500 text-xs uppercase tracking-wider\">
                  <th className=\"text-left p-4 font-medium\">Asset</th>
                  <th className=\"text-right p-4 font-medium\">Price</th>
                  <th className=\"text-right p-4 font-medium hidden sm:table-cell\">24h</th>
                  <th className=\"text-right p-4 font-medium hidden md:table-cell\">Market cap</th>
                  <th className=\"text-right p-4 font-medium hidden md:table-cell\">Volume 24h</th>
                  <th className=\"text-right p-4 font-medium hidden lg:table-cell\">7d trend</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => {
                  const up = (m.change_24h || 0) >= 0;
                  return (
                    <tr key={m.id} className=\"border-t border-[#1E293B] hover:bg-[#1A233A] transition-colors\" data-testid={`landing-row-${m.symbol}`}>
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
                      <td className={`p-4 text-right font-mono hidden sm:table-cell ${up ? \"text-up\" : \"text-down\"}`}>
                        <span className=\"inline-flex items-center gap-1 justify-end\">
                          {up ? <ArrowUpRight className=\"w-3 h-3\" /> : <ArrowDownRight className=\"w-3 h-3\" />}
                          {fmt.pct(m.change_24h)}
                        </span>
                      </td>
                      <td className=\"p-4 text-right font-mono text-slate-300 hidden md:table-cell\">{fmt.big(m.market_cap)}</td>
                      <td className=\"p-4 text-right font-mono text-slate-300 hidden md:table-cell\">{fmt.big(m.volume_24h)}</td>
                      <td className=\"p-4 hidden lg:table-cell\"><div className=\"w-28 ml-auto\"><Sparkline data={m.sparkline} up={up} height={36} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id=\"features\" className=\"border-t border-[#1E293B]\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-20\">
          <div className=\"label-eyebrow mb-3\">Why PROCX</div>
          <h2 className=\"font-display text-3xl sm:text-4xl font-semibold mb-12 max-w-2xl\">A trading floor in your pocket. With the controls of a hedge fund.</h2>
          <div className=\"grid md:grid-cols-3 gap-4\">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className=\"card-flat p-7\">
                  <div className=\"w-9 h-9 bg-[#1A233A] flex items-center justify-center rounded-sm mb-5\">
                    <Icon className=\"w-4 h-4 text-[#007AFF]\" />
                  </div>
                  <div className=\"font-display text-lg font-semibold mb-2\">{f.title}</div>
                  <p className=\"text-sm text-slate-400 leading-relaxed\">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id=\"security\" className=\"border-t border-[#1E293B]\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-20\">
          <div className=\"card-flat p-10 sm:p-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6\">
            <div>
              <div className=\"label-eyebrow mb-3\">Get started in minutes</div>
              <h3 className=\"font-display text-2xl sm:text-3xl font-semibold max-w-xl\">Open a professional account today. Deposit in 5 networks.</h3>
            </div>
            <Link to=\"/register\" className=\"btn-primary inline-flex items-center gap-2 whitespace-nowrap\" data-testid=\"cta-register-bottom\">
              Open account <ArrowRight className=\"w-4 h-4\" />
            </Link>
          </div>
        </div>
      </section>

      <footer className=\"border-t border-[#1E293B]\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500\">
          <span>© {new Date().getFullYear()} PROCX Exchange.</span>
          <Link to=\"/admin-login\" className=\"hover:text-slate-300 transition-colors\" data-testid=\"footer-admin-link\">Administration</Link>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className=\"text-2xl font-display font-semibold\">{value}</div>
      <div className=\"text-xs text-slate-500 uppercase tracking-wider mt-1\">{label}</div>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/
