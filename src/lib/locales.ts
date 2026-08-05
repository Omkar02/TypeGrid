/**
 * Locale helpers.
 *
 * A note on flags: they represent **countries**, not languages. Arabic is not
 * Saudi Arabia, Spanish is not only Spain, and English belongs to no single
 * flag. We show them because they make a long picker scannable, but every
 * surface that shows a flag also shows the locale code, so the actual identity
 * is never carried by the flag alone.
 */

/** Language -> the region whose flag we use when the tag has no region of its own. */
const DEFAULT_REGION: Record<string, string> = {
  ar: "SA",
  bn: "BD",
  cs: "CZ",
  da: "DK",
  de: "DE",
  el: "GR",
  en: "US",
  es: "ES",
  fi: "FI",
  fr: "FR",
  he: "IL",
  hi: "IN",
  hu: "HU",
  id: "ID",
  it: "IT",
  ja: "JP",
  ko: "KR",
  nb: "NO",
  nl: "NL",
  pl: "PL",
  pt: "PT",
  ro: "RO",
  ru: "RU",
  sv: "SE",
  th: "TH",
  tr: "TR",
  uk: "UA",
  vi: "VN",
  zh: "CN",
};

/** The locales offered in pickers. Any valid BCP-47 tag can still be typed in. */
export const LOCALE_CATALOG = [
  "en",
  "en-GB",
  "de",
  "fr",
  "fr-CA",
  "es",
  "es-MX",
  "it",
  "pt",
  "pt-BR",
  "nl",
  "sv",
  "da",
  "nb",
  "fi",
  "pl",
  "cs",
  "tr",
  "ru",
  "uk",
  "ar",
  "he",
  "hi",
  "th",
  "vi",
  "id",
  "ja",
  "ko",
  "zh-CN",
  "zh-TW",
] as const;

function intlDisplayNames(type: "language" | "region") {
  if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type });
  } catch {
    return null;
  }
}

const languageNames = intlDisplayNames("language");
const regionNames = intlDisplayNames("region");

export interface LocaleInfo {
  /** The tag itself, e.g. `pt-BR`. */
  code: string;
  /** Language subtag, e.g. `pt`. */
  language: string;
  /** Region used for the flag, e.g. `BR`. Empty when unknown. */
  region: string;
  /** "Portuguese" */
  languageName: string;
  /** "Brazil" — empty when the region is unknown. */
  regionName: string;
  /** 🇧🇷 — empty string when the region is unknown. */
  flag: string;
}

/**
 * Two uppercase ASCII letters map onto the regional-indicator block, which
 * browsers compose into a flag. Platforms without flag glyphs (notably Chrome
 * on Windows) render the two letters instead, which is a fine fallback.
 */
function flagFor(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) return "";
  return region.replace(/./g, (char) =>
    String.fromCodePoint(127397 + char.charCodeAt(0)),
  );
}

function safeDisplay(
  names: Intl.DisplayNames | null,
  value: string,
  fallback: string,
): string {
  if (!value) return fallback;
  try {
    return names?.of(value) ?? fallback;
  } catch {
    return fallback;
  }
}

const infoCache = new Map<string, LocaleInfo>();

export function localeInfo(code: string): LocaleInfo {
  const cached = infoCache.get(code);
  if (cached) return cached;

  const [languageRaw, regionRaw] = code.split("-");
  const language = languageRaw.toLowerCase();
  const region = (regionRaw ?? DEFAULT_REGION[language] ?? "").toUpperCase();

  const info: LocaleInfo = {
    code,
    language,
    region,
    languageName: safeDisplay(languageNames, language, code),
    regionName: safeDisplay(regionNames, region, ""),
    flag: flagFor(region),
  };
  infoCache.set(code, info);
  return info;
}

/** "de" -> "German". Falls back to the raw code for tags Intl doesn't know. */
export function localeLabel(code: string): string {
  return localeInfo(code).languageName;
}

/** "pt-BR" -> "Portuguese · Brazil". Used where there is room for both. */
export function localeFullLabel(code: string): string {
  const { languageName, regionName } = localeInfo(code);
  return regionName ? `${languageName} · ${regionName}` : languageName;
}

/** Normalizes user input to a lowercase-language / uppercase-region tag. */
export function normalizeLocale(input: string): string {
  const trimmed = input.trim().replace(/_/g, "-");
  if (!trimmed) return "";
  const [language, region] = trimmed.split("-");
  return region
    ? `${language.toLowerCase()}-${region.toUpperCase()}`
    : language.toLowerCase();
}

/** True when `locale` looks like a usable BCP-47 tag. */
export function isValidLocale(locale: string): boolean {
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale);
}

/** Case-insensitive match across code, language name and region name. */
export function localeMatches(code: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const { languageName, regionName } = localeInfo(code);
  return (
    code.toLowerCase().includes(needle) ||
    languageName.toLowerCase().includes(needle) ||
    regionName.toLowerCase().includes(needle)
  );
}
