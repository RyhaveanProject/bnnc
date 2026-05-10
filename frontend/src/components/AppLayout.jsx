
Action: file_editor create /app/frontend/src/components/AppLayout.jsx --file-text "import React, { useEffect, useState } from \"react\";
import { Link, useLocation, useNavigate, Outlet } from \"react-router-dom\";
import { useAuth } from \"@/context/AuthContext\";
import { api } from \"@/lib/api\";
import { LogOut, LayoutDashboard, LineChart, Wallet, Shield, MessageCircle } from \"lucide-react\";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [chatUrl, setChatUrl] = useState(\"\");

  useEffect(() => {
    api.liveChat().then(d => setChatUrl(d.url || \"\")).catch(() => {});
    // Heartbeat for live user count
    const ping = () => api.ping().catch(() => {});
    ping();
    const t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, []);

  const nav_items = [
    { to: \"/dashboard\", label: \"Dashboard\", icon: LayoutDashboard },
    { to: \"/markets\", label: \"Markets\", icon: LineChart },
    { to: \"/deposit\", label: \"Deposit\", icon: Wallet },
  ];
  if (user?.role === \"admin\") nav_items.push({ to: \"/admin\", label: \"Admin\", icon: Shield });

  const handleLogout = async () => {
    await logout();
    nav(\"/\");
  };

  return (
    <div className=\"min-h-screen bg-[#0B0F19] text-white flex flex-col\">
      <header className=\"glass-nav sticky top-0 z-50\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 h-16 flex items-center justify-between\">
          <Link to=\"/dashboard\" className=\"flex items-center gap-2.5\" data-testid=\"brand-link\">
            <div className=\"w-7 h-7 bg-[#007AFF] flex items-center justify-center rounded-sm\">
              <span className=\"font-display font-bold text-white text-sm\">P</span>
            </div>
            <span className=\"font-display text-lg font-semibold tracking-tight\">PROCX</span>
          </Link>
          <nav className=\"hidden md:flex items-center gap-1\">
            {nav_items.map(n => {
              const Icon = n.icon;
              const active = loc.pathname === n.to;
              return (
                <Link key={n.to} to={n.to} data-testid={`nav-${n.label.toLowerCase()}`}
                  className={`px-4 py-2 rounded-sm text-sm font-medium flex items-center gap-2 transition-colors ${active ? \"bg-[#1A233A] text-white\" : \"text-slate-400 hover:text-white hover:bg-[#131A2A]\"}`}>
                  <Icon className=\"w-4 h-4\" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className=\"flex items-center gap-3\">
            {chatUrl && (
              <a href={chatUrl} target=\"_blank\" rel=\"noreferrer\" data-testid=\"live-chat-btn\"
                className=\"hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-[#334155] px-3 py-1.5 rounded-sm\">
                <MessageCircle className=\"w-3.5 h-3.5\" /> Support
              </a>
            )}
            <span className=\"hidden sm:block text-sm text-slate-400 font-mono\" data-testid=\"header-email\">{user?.email}</span>
            <button onClick={handleLogout} data-testid=\"logout-btn\"
              className=\"text-slate-400 hover:text-white border border-[#334155] p-2 rounded-sm\">
              <LogOut className=\"w-4 h-4\" />
            </button>
          </div>
        </div>
      </header>
      <main className=\"flex-1\">
        <Outlet />
      </main>
      <footer className=\"border-t border-[#1E293B] py-6 mt-12\">
        <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500\">
          <span>© {new Date().getFullYear()} PROCX Exchange. All rights reserved.</span>
          <span className=\"font-mono\">Trading involves risk. Past performance does not guarantee future results.</span>
        </div>
      </footer>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src/components/
