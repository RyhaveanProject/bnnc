import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Support page — opens the built-in live support widget
 * (components/LiveSupport.jsx, connected via REACT_APP_LIVE_SUPPORT_URL).
 */
const openLiveSupport = () => window.dispatchEvent(new Event("open-live-support"));

export default function Support() {
  const { t } = useTranslation();

  useEffect(() => {
    const id = setTimeout(openLiveSupport, 100);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      data-testid="support-page"
      style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}
      className="container-pad"
    >
      <h1 style={{ margin: "0 0 16px" }}>{t("support.title")}</h1>
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <div className="text-dim" style={{ marginBottom: 16 }}>
          {t("support.chat_with") || "Live support"}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="open-live-chat"
          onClick={openLiveSupport}
        >
          {t("support.open_in_new_tab") || "Open live chat"}
        </button>
      </div>
    </div>
  );
}
