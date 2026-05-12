import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="footer-inner">
        <div className="footer-col footer-brand-col">
          <Link to="/" className="brand" data-testid="footer-brand">
            <span className="b1">ADX</span><span className="b2">AMERICA</span>
          </Link>
          <p className="text-dim footer-tagline">
            Institutional-grade digital asset trading inspired by the standards
            of the Abu Dhabi Securities Exchange. Established 15 November 2000.
          </p>
          <div className="footer-pills">
            <span className="pill approved">Secure Custody</span>
            <span className="pill pending">24/7 Markets</span>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-title">Platform</div>
          <Link to="/markets" className="footer-link" data-testid="footer-markets">Markets</Link>
          <Link to="/trade" className="footer-link" data-testid="footer-trade">Trade</Link>
          <Link to="/deposit" className="footer-link" data-testid="footer-deposit">Deposit</Link>
          <Link to="/withdraw" className="footer-link" data-testid="footer-withdraw">Withdraw</Link>
        </div>

        <div className="footer-col">
          <div className="footer-title">Company</div>
          <a href="#about" className="footer-link" data-testid="footer-about">About</a>
          <a href="#why" className="footer-link" data-testid="footer-why">Why ADX America</a>
          <Link to="/support" className="footer-link" data-testid="footer-support">Support</Link>
        </div>

        <div className="footer-col">
          <div className="footer-title">Legal</div>
          <span className="footer-link footer-static">Terms of Service</span>
          <span className="footer-link footer-static">Privacy Policy</span>
          <span className="footer-link footer-static">Risk Disclosure</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="text-dim">© {year} ADX America. All rights reserved.</span>
        <span className="text-dim footer-disclaimer">
          Digital asset trading involves risk. Trade responsibly.
        </span>
      </div>
    </footer>
  );
}
