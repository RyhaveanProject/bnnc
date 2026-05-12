
import React from \"react\";
import { Link } from \"react-router-dom\";
import { useTranslation, Trans } from \"react-i18next\";
import { PriceTicker, MarketTable } from \"../components/Market\";
import Footer from \"../components/Footer\";
import { useAuth } from \"../lib/auth\";

export default function Landing() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const ctaTarget = user ? \"/trade\" : \"/register\";
  const ctaLabel = user ? t(\"landing.go_to_trading\") : t(\"landing.start_trading\");

  return (
    <div className=\"hero-bg\" data-testid=\"landing-page\">
      <PriceTicker />

      {/* HERO */}
      <section className=\"container-pad landing-section landing-hero\">
        <div className=\"hero-grid\">
          <div>
            <div className=\"hero-eyebrow\" data-testid=\"hero-eyebrow\">
              <span className=\"dot\" /> {t(\"landing.established\")}
            </div>
            <h1 className=\"hero-title\">
              {t(\"landing.hero_title_1\")}<br />
              {t(\"landing.hero_title_2_pre\")} <span className=\"text-yellow\">{t(\"landing.hero_title_2_highlight\")}</span>
            </h1>
            <p className=\"hero-subtitle\">{t(\"landing.hero_subtitle\")}</p>
            <div className=\"hero-cta\">
              <Link to={ctaTarget}>
                <button className=\"btn btn-primary\" data-testid=\"start-trading-btn\">{ctaLabel}</button>
              </Link>
              <Link to=\"/markets\">
                <button className=\"btn btn-ghost\" data-testid=\"view-markets-btn\">{t(\"landing.view_markets\")}</button>
              </Link>
            </div>
            <div className=\"hero-stats\">
              <div><div className=\"hs-num\">$1.2B+</div><div className=\"text-dim hs-lbl\">{t(\"landing.stats_24h_volume\")}</div></div>
              <div><div className=\"hs-num\">500K+</div><div className=\"text-dim hs-lbl\">{t(\"landing.stats_active_users\")}</div></div>
              <div><div className=\"hs-num\">5+</div><div className=\"text-dim hs-lbl\">{t(\"landing.stats_assets\")}</div></div>
              <div><div className=\"hs-num\">24/7</div><div className=\"text-dim hs-lbl\">{t(\"landing.stats_24_7\")}</div></div>
            </div>
          </div>
          <MarketTable compact />
        </div>
      </section>

      {/* ABOUT */}
      <section id=\"about\" className=\"container-pad landing-section about-section\" data-testid=\"about-section\">
        <div className=\"section-head\">
          <span className=\"section-kicker\">{t(\"landing.about_kicker\")}</span>
          <h2 className=\"section-title\">
            {t(\"landing.about_title_1\")} <span className=\"text-yellow\">{t(\"landing.about_title_2\")}</span>
          </h2>
        </div>

        <div className=\"about-grid\">
          <div className=\"about-copy\">
            <p><Trans i18nKey=\"landing.about_p1\" components={{ b: <strong /> }} /></p>
            <p>{t(\"landing.about_p2\")}</p>
            <p>{t(\"landing.about_p3\")}</p>

            <div className=\"about-pillars\">
              <div className=\"pillar\">
                <div className=\"pillar-num\">01</div>
                <div className=\"pillar-title\">{t(\"landing.pillar1_title\")}</div>
                <div className=\"text-dim pillar-text\">{t(\"landing.pillar1_text\")}</div>
              </div>
              <div className=\"pillar\">
                <div className=\"pillar-num\">02</div>
                <div className=\"pillar-title\">{t(\"landing.pillar2_title\")}</div>
                <div className=\"text-dim pillar-text\">{t(\"landing.pillar2_text\")}</div>
              </div>
              <div className=\"pillar\">
                <div className=\"pillar-num\">03</div>
                <div className=\"pillar-title\">{t(\"landing.pillar3_title\")}</div>
                <div className=\"text-dim pillar-text\">{t(\"landing.pillar3_text\")}</div>
              </div>
            </div>
          </div>

          <aside className=\"about-card panel\">
            <div className=\"about-card-head\">
              <div className=\"text-dim about-card-label\">{t(\"landing.snapshot_label\")}</div>
              <div className=\"about-card-title\">ADX DUBAI</div>
            </div>
            <ul className=\"about-meta\">
              <li>
                <span className=\"text-dim\">{t(\"landing.snapshot_founded\")}</span>
                <span>{t(\"landing.founded_date\")}</span>
              </li>
              <li>
                <span className=\"text-dim\">{t(\"landing.snapshot_focus\")}</span>
                <span>{t(\"landing.snapshot_focus_v\")}</span>
              </li>
              <li>
                <span className=\"text-dim\">{t(\"landing.snapshot_assets\")}</span>
                <span>BTC · ETH · BNB · TRX · USDT</span>
              </li>
              <li>
                <span className=\"text-dim\">{t(\"landing.snapshot_markets\")}</span>
                <span>{t(\"landing.snapshot_markets_v\")}</span>
              </li>
              <li>
                <span className=\"text-dim\">{t(\"landing.snapshot_mission\")}</span>
                <span>{t(\"landing.snapshot_mission_v\")}</span>
              </li>
            </ul>
            <div className=\"about-card-cta\">
              <Link to={ctaTarget}>
                <button className=\"btn btn-primary btn-sm\" data-testid=\"about-cta-btn\">{ctaLabel}</button>
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {/* WHY ADX */}
      <section id=\"why\" className=\"container-pad landing-section why-section\" data-testid=\"why-section\">
        <div className=\"section-head\">
          <span className=\"section-kicker\">{t(\"landing.why_kicker\")}</span>
          <h2 className=\"section-title\">{t(\"landing.why_title_1\")} <span className=\"text-yellow\">{t(\"landing.why_title_2\")}</span></h2>
        </div>

        <div className=\"feature-grid\">
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">◆</div>
            <div className=\"feature-title\">{t(\"landing.f1_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f1_text\")}</p>
          </div>
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">↗</div>
            <div className=\"feature-title\">{t(\"landing.f2_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f2_text\")}</p>
          </div>
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">⚡</div>
            <div className=\"feature-title\">{t(\"landing.f3_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f3_text\")}</p>
          </div>
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">⌬</div>
            <div className=\"feature-title\">{t(\"landing.f4_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f4_text\")}</p>
          </div>
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">◉</div>
            <div className=\"feature-title\">{t(\"landing.f5_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f5_text\")}</p>
          </div>
          <div className=\"feature-card panel\">
            <div className=\"feature-ico\">▲</div>
            <div className=\"feature-title\">{t(\"landing.f6_title\")}</div>
            <p className=\"text-dim feature-text\">{t(\"landing.f6_text\")}</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className=\"container-pad landing-section cta-section\">
        <div className=\"cta-card panel\" data-testid=\"cta-card\">
          <div>
            <div className=\"section-kicker\">{t(\"landing.cta_kicker\")}</div>
            <h3 className=\"cta-title\">{t(\"landing.cta_title\")}</h3>
            <p className=\"text-dim cta-text\">{t(\"landing.cta_text\")}</p>
          </div>
          <div className=\"cta-actions\">
            <Link to={ctaTarget}>
              <button className=\"btn btn-primary\" data-testid=\"cta-start-btn\">{ctaLabel}</button>
            </Link>
            <Link to=\"/markets\">
              <button className=\"btn btn-ghost\" data-testid=\"cta-markets-btn\">{t(\"landing.explore_markets\")}</button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
