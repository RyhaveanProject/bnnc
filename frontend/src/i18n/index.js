import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import az from "./locales/az.json";
import tr from "./locales/tr.json";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";

export const SUPPORTED_LANGS = [
  { code: "az", label: "Azərbaycan", flag: "🇦🇿", dir: "ltr" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷", dir: "ltr" },
  { code: "en", label: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "zh", label: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "ru", label: "Русский", flag: "🇷🇺", dir: "ltr" },
];

const RTL_LANGS = ["ar"];

export function applyDirection(lng) {
  const dir = RTL_LANGS.includes(lng) ? "rtl" : "ltr";
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lng);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      az: { translation: az },
      tr: { translation: tr },
      en: { translation: en },
      ar: { translation: ar },
      zh: { translation: zh },
      ru: { translation: ru },
    },
    // Default language is English. Browser language is intentionally NOT used
    // so that the site always opens in EN unless the user explicitly picks
    // another language (which is then persisted in localStorage + cookie).
    fallbackLng: "en",
    supportedLngs: ["az", "tr", "en", "ar", "zh", "ru"],
    nonExplicitSupportedLngs: false,
    load: "languageOnly",
    detection: {
      // Only honour an explicit user choice. If neither localStorage nor the
      // cookie has a value, i18next falls back to `fallbackLng` ("en").
      order: ["localStorage", "cookie"],
      caches: ["localStorage", "cookie"],
      lookupLocalStorage: "adx_lang",
      lookupCookie: "adx_lang",
      cookieMinutes: 60 * 24 * 365, // 1 year
      cookieOptions: { path: "/", sameSite: "lax" },
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

// Ensure a sensible default on the very first visit.
if (!i18n.language || !["az", "tr", "en", "ar", "zh", "ru"].includes(i18n.language)) {
  i18n.changeLanguage("en");
}

applyDirection(i18n.language || "en");
i18n.on("languageChanged", (lng) => applyDirection(lng));

export default i18n;
