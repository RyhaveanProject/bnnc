import React from "react";
import { useTranslation } from "react-i18next";
import { MarketTable } from "../components/Market";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Markets() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const onSelect = (sym) => {
    if (!user) nav("/login");
    else nav(`/trade?sym=${sym}`);
  };
  return (
    <div data-testid="markets-page" style={{maxWidth:1280, margin:"0 auto", padding:24}} className="container-pad">
      <h1 style={{margin:"0 0 16px"}}>{t("markets.title")}</h1>
      <MarketTable onSelect={onSelect} />
    </div>
  );
}
