import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="footer-inner">
        <div className="footer-col footer-brand-col">
          <Link to="/" className="brand" data-testid="footer-brand">
            <span className="b1">ADX</span><span className="b2">DUBAI</span>
          </Link>
          <p className="text-dim footer-tagline">{t("footer.tagline")}</p>
          <div className="footer-pills">
            <span className="pill approved">{t("footer.secure_custody")}</span>
            <span className="pill pending">{t("footer.markets_247")}</span>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-title">{t("footer.platform")}</div>
          <Link to="/markets" className="footer-link" data-testid="footer-markets">{t("nav.markets")}</Link>
          <Link to="/trade" className="footer-link" data-testid="footer-trade">{t("nav.trade")}</Link>
          <Link to="/deposit" className="footer-link" data-testid="footer-deposit">{t("nav.deposit")}</Link>
          <Link to="/withdraw" className="footer-link" data-testid="footer-withdraw">{t("nav.withdraw")}</Link>
        </div>

        <div className="footer-col">
          <div className="footer-title">{t("footer.company")}</div>
          <a href="#about" className="footer-link" data-testid="footer-about">{t("footer.about")}</a>
          <a href="#why" className="footer-link" data-testid="footer-why">{t("footer.why_adx")}</a>
          <Link to="/support" className="footer-link" data-testid="footer-support">{t("footer.support")}</Link>
        </div>

        <div className="footer-col">
          <div className="footer-title">{t("footer.legal")}</div>
          <span className="footer-link footer-static">{t("footer.terms")}</span>
          <span className="footer-link footer-static">{t("footer.privacy")}</span>
          <span className="footer-link footer-static">{t("footer.risk")}</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="text-dim">{t("footer.copyright", { year })}</span>
        <span className="text-dim footer-disclaimer">{t("footer.disclaimer")}</span>
      </div>
    </footer>
  );
}
