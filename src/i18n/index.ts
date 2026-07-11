import { en, type I18nKey } from "./en";

let locale = "en";
const tables: Record<string, Partial<Record<I18nKey, string>>> = { en };

/** Translate a string key. Falls back to English, then the key itself. */
export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const raw = tables[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function setLocale(code: string) {
  locale = tables[code] ? code : "en";
}

export function getLocale() {
  return locale;
}