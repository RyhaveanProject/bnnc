import React, { useEffect, useState } from \"react\";
import { useTranslation } from \"react-i18next\";
import api from \"../lib/api\";

export default function Support() {
  const { t } = useTranslation();
  const [url, setUrl] = useState(\"\");
  useEffect(() => {
    api.get(\"/config/live-chat\").then(r => setUrl(r.data.url || \"\")).catch(() => {});
  }, []);

  return (
    <div data-testid=\"support-page\" style={{maxWidth:1200, margin:\"0 auto\", padding:24}} className=\"container-pad\">
      <h1 style={{margin:\"0 0 16px\"}}>{t(\"support.title\")}</h1>
      {!url ? (
        <div className=\"panel\" style={{padding:32, textAlign:\"center\"}}>
          <div className=\"text-dim\">{t(\"support.not_configured\")}</div>
        </div>
      ) : (
        <div className=\"panel\" style={{padding:0, overflow:\"hidden\"}}>
          <div style={{padding:\"12px 16px\", borderBottom:\"1px solid var(--border)\", display:\"flex\", justifyContent:\"space-between\", alignItems:\"center\"}}>
            <span style={{fontWeight:600}}>{t(\"support.chat_with\")}</span>
            <a href={url} target=\"_blank\" rel=\"noreferrer\"><button className=\"btn btn-ghost btn-sm\" data-testid=\"open-chat-newtab\">{t(\"support.open_in_new_tab\")}</button></a>
          </div>
          <iframe src={url} title=\"live-chat\" style={{width:\"100%\", height:\"70vh\", border:\"none\", background:\"#fff\"}} data-testid=\"chat-iframe\"/>
        </div>
      )}
    </div>
  );
}
