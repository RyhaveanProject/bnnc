import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Support page — opens the JivoChat live-chat widget.
 *
 * The Jivo widget script is loaded globally in public/index.html.
 * By default its floating launcher button is hidden via CSS (see index.html).
 * When the user lands on this page (clicks "Online dəstək"), we:
 *   1. Add `jivo-active` class to <body> so the widget becomes visible.
 *   2. Call `window.jivo_api.open()` to pop the chat window open.
 * When the user leaves this page we hide the widget again and close the chat.
 */
export default function Support() {
  const { t } = useTranslation();

  const openJivo = () => {
    document.body.classList.add("jivo-active");
    if (window.jivo_api && typeof window.jivo_api.open === "function") {
      window.jivo_api.open();
    }
  };

  useEffect(() => {
    // Try to open immediately; if the Jivo script is still loading, retry.
    let tries = 0;
    const tryOpen = () => {
      document.body.classList.add("jivo-active");
      if (window.jivo_api && typeof window.jivo_api.open === "function") {
        window.jivo_api.open();
        return true;
      }
      return false;
    };

    if (!tryOpen()) {
      const interval = setInterval(() => {
        tries += 1;
        if (tryOpen() || tries > 40) {
          clearInterval(interval);
        }
      }, 250);
      return () => {
        clearInterval(interval);
        document.body.classList.remove("jivo-active");
        if (window.jivo_api && typeof window.jivo_api.close === "function") {
          window.jivo_api.close();
        }
      };
    }

    return () => {
      document.body.classList.remove("jivo-active");
      if (window.jivo_api && typeof window.jivo_api.close === "function") {
        window.jivo_api.close();
      }
    };
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
          data-testid="open-jivo-chat"
          onClick={openJivo}
        >
          {t("support.open_in_new_tab") || "Open live chat"}
        </button>
      </div>
    </div>
  );
}
