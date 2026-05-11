import React from "react";
import { Link } from "react-router-dom";
import { PriceTicker, MarketTable } from "../components/Market";
import { useAuth } from "../lib/auth";

export default function Landing() {
  const { user } = useAuth();
  // Logged-in users go straight to Trade. Logged-out users go to Register.
  const ctaTarget = user ? "/trade" : "/register";
  const ctaLabel = user ? "Go to Trading" : "Start Trading";
  return (
    <div className="hero-bg" data-testid="landing-page">
      <PriceTicker />
      <div style={{maxWidth:1280, margin:"0 auto", padding:"60px 24px"}} className="container-pad">
        <div className="hero-grid" style={{display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:48, alignItems:"center"}}>
          <div>
            <h1 style={{fontSize:"clamp(36px, 5vw, 64px)", lineHeight:1.05, margin:"0 0 24px", fontWeight:800}}>
              Trade crypto<br/>
              with <span className="text-yellow">confidence</span>
            </h1>
            <p style={{color:"var(--text-dim)", fontSize:18, maxWidth:520, lineHeight:1.6}}>
              ADX America — fast, secure, professional crypto trading platform.
              Buy, sell, deposit and withdraw USDT, BTC, ETH, TRX and BNB instantly.
            </p>
            <div style={{display:"flex", gap:12, marginTop:32}}>
              <Link to={ctaTarget}><button className="btn btn-primary" data-testid="start-trading-btn">{ctaLabel}</button></Link>
              <Link to="/markets"><button className="btn btn-ghost" data-testid="view-markets-btn">View Markets</button></Link>
            </div>
            <div style={{display:"flex", gap:48, marginTop:56, flexWrap:"wrap"}}>
              <div><div style={{fontSize:28, fontWeight:700}}>$1.2B+</div><div className="text-dim" style={{fontSize:13}}>24h Volume</div></div>
              <div><div style={{fontSize:28, fontWeight:700}}>500K+</div><div className="text-dim" style={{fontSize:13}}>Active Users</div></div>
              <div><div style={{fontSize:28, fontWeight:700}}>5+</div><div className="text-dim" style={{fontSize:13}}>Crypto Assets</div></div>
            </div>
          </div>
          <MarketTable compact />
        </div>
      </div>
    </div>
  );
}
