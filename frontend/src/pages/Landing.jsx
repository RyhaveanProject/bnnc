import React from "react";
import { Link } from "react-router-dom";
import { PriceTicker, MarketTable } from "../components/Market";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";

export default function Landing() {
  const { user } = useAuth();
  // Logged-in users go straight to Trade. Logged-out users go to Register.
  const ctaTarget = user ? "/trade" : "/register";
  const ctaLabel = user ? "Go to Trading" : "Start Trading";

  return (
    <div className="hero-bg" data-testid="landing-page">
      <PriceTicker />

      {/* HERO */}
      <section className="container-pad landing-section landing-hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow" data-testid="hero-eyebrow">
              <span className="dot" /> Established 15 November 2000
            </div>
            <h1 className="hero-title">
              Trade crypto<br />
              with <span className="text-yellow">confidence</span>
            </h1>
            <p className="hero-subtitle">
              ADX DUBAI — fast, secure, professional crypto trading platform.
              Buy, sell, deposit and withdraw USDT, BTC, ETH, TRX and BNB
              instantly, backed by institutional-grade infrastructure.
            </p>
            <div className="hero-cta">
              <Link to={ctaTarget}>
                <button className="btn btn-primary" data-testid="start-trading-btn">{ctaLabel}</button>
              </Link>
              <Link to="/markets">
                <button className="btn btn-ghost" data-testid="view-markets-btn">View Markets</button>
              </Link>
            </div>
            <div className="hero-stats">
              <div><div className="hs-num">$1.2B+</div><div className="text-dim hs-lbl">24h Volume</div></div>
              <div><div className="hs-num">500K+</div><div className="text-dim hs-lbl">Active Users</div></div>
              <div><div className="hs-num">5+</div><div className="text-dim hs-lbl">Crypto Assets</div></div>
              <div><div className="hs-num">24/7</div><div className="text-dim hs-lbl">Live Markets</div></div>
            </div>
          </div>
          <MarketTable compact />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="container-pad landing-section about-section" data-testid="about-section">
        <div className="section-head">
          <span className="section-kicker">About ADX DUBAI</span>
          <h2 className="section-title">
            A professional market, <span className="text-yellow">built for the next era</span>
          </h2>
        </div>

        <div className="about-grid">
          <div className="about-copy">
            <p>
              Founded on <strong>15 November 2000</strong>, ADX DUBAI is a
              forward-looking financial markets platform inspired by the
              standards of <strong>Dubai Financial Markets</strong>.
              For more than two decades, our mission has been the same:
              bring institutional-grade market infrastructure, transparent
              execution and disciplined risk management to a wider universe
              of investors.
            </p>
            <p>
              We bridge the discipline of traditional capital markets with the
              speed and accessibility of modern blockchain assets. Through
              advanced trading technology, real-time price discovery sourced
              from the world's top venues, and investor-centric services,
              ADX DUBAI empowers individuals and institutions to participate
              confidently in the next generation of global markets.
            </p>
            <p>
              Our regional focus is rooted in a single conviction: emerging
              and frontier markets deserve the same quality of access,
              liquidity and security as established financial centres. From
              secure custody and KYC-aligned operations to 24/7 multi-asset
              trading, every system at ADX DUBAI is engineered for trust.
            </p>

            <div className="about-pillars">
              <div className="pillar">
                <div className="pillar-num">01</div>
                <div className="pillar-title">Modern Financial Technology</div>
                <div className="text-dim pillar-text">
                  Low-latency matching, real-time market data and
                  battle-tested infrastructure.
                </div>
              </div>
              <div className="pillar">
                <div className="pillar-num">02</div>
                <div className="pillar-title">Investor-Focused Services</div>
                <div className="text-dim pillar-text">
                  Transparent fees, secure custody and dedicated 24/7
                  live support for every client.
                </div>
              </div>
              <div className="pillar">
                <div className="pillar-num">03</div>
                <div className="pillar-title">Regional Market Development</div>
                <div className="text-dim pillar-text">
                  Bringing world-class access to growth markets across
                  the MENA region and beyond.
                </div>
              </div>
            </div>
          </div>

          <aside className="about-card panel">
            <div className="about-card-head">
              <div className="text-dim about-card-label">Company Snapshot</div>
              <div className="about-card-title">ADX DUBAI</div>
            </div>
            <ul className="about-meta">
              <li>
                <span className="text-dim">Founded</span>
                <span>15 November 2000</span>
              </li>
              <li>
                <span className="text-dim">Focus</span>
                <span>Digital Asset Trading</span>
              </li>
              <li>
                <span className="text-dim">Assets</span>
                <span>BTC · ETH · BNB · TRX · USDT</span>
              </li>
              <li>
                <span className="text-dim">Markets</span>
                <span>24 / 7</span>
              </li>
              <li>
                <span className="text-dim">Mission</span>
                <span>Institutional-grade access for all</span>
              </li>
            </ul>
            <div className="about-card-cta">
              <Link to={ctaTarget}>
                <button className="btn btn-primary btn-sm" data-testid="about-cta-btn">{ctaLabel}</button>
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {/* WHY ADX */}
      <section id="why" className="container-pad landing-section why-section" data-testid="why-section">
        <div className="section-head">
          <span className="section-kicker">Why ADX DUBAI</span>
          <h2 className="section-title">Engineered for <span className="text-yellow">trust</span></h2>
        </div>

        <div className="feature-grid">
          <div className="feature-card panel">
            <div className="feature-ico">◆</div>
            <div className="feature-title">Institutional Security</div>
            <p className="text-dim feature-text">
              Segregated custody, encrypted operations and multi-layer
              account protection inspired by capital-market best practice.
            </p>
          </div>
          <div className="feature-card panel">
            <div className="feature-ico">↗</div>
            <div className="feature-title">Real-Time Market Data</div>
            <p className="text-dim feature-text">
              Live prices, depth and 24-hour candles sourced from the world's
              top liquidity venues — refreshed every few seconds.
            </p>
          </div>
          <div className="feature-card panel">
            <div className="feature-ico">⚡</div>
            <div className="feature-title">Instant Execution</div>
            <p className="text-dim feature-text">
              Buy and sell BTC, ETH, BNB, TRX and USDT instantly with
              transparent pricing and fast confirmations.
            </p>
          </div>
          <div className="feature-card panel">
            <div className="feature-ico">⌬</div>
            <div className="feature-title">Multi-Network Deposits</div>
            <p className="text-dim feature-text">
              Fund your account across major networks with clear,
              traceable receipts and automated confirmations.
            </p>
          </div>
          <div className="feature-card panel">
            <div className="feature-ico">◉</div>
            <div className="feature-title">24/7 Live Support</div>
            <p className="text-dim feature-text">
              A real human team is available around the clock to help with
              deposits, withdrawals and account questions.
            </p>
          </div>
          <div className="feature-card panel">
            <div className="feature-ico">▲</div>
            <div className="feature-title">Mobile-First Experience</div>
            <p className="text-dim feature-text">
              Trade from any device. Our interface is optimised for desktop,
              tablet and mobile without compromise.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-pad landing-section cta-section">
        <div className="cta-card panel" data-testid="cta-card">
          <div>
            <div className="section-kicker">Get started in minutes</div>
            <h3 className="cta-title">Open your ADX DUBAI account today</h3>
            <p className="text-dim cta-text">
              Join hundreds of thousands of traders accessing professional
              crypto markets through a single, secure platform.
            </p>
          </div>
          <div className="cta-actions">
            <Link to={ctaTarget}>
              <button className="btn btn-primary" data-testid="cta-start-btn">{ctaLabel}</button>
            </Link>
            <Link to="/markets">
              <button className="btn btn-ghost" data-testid="cta-markets-btn">Explore Markets</button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
