export const JASPE_LANGUAGES = {
  fr: { status: "LIVE", pivot: "fr" },
  en: { status: "LIVE", pivot: "fr" },
  ln: { status: "CONFIGURED", pivot: "fr" },
  kg: { status: "CONFIGURED", pivot: "fr" },
  lua: { status: "CONFIGURED", pivot: "fr" },
  sw: { status: "CONFIGURED", pivot: "fr" },
} as const;

export type JaspeLanguage = keyof typeof JASPE_LANGUAGES;

export function languageStatus(language: string): "LIVE" | "CONFIGURED" | "UNSUPPORTED" {
  return (JASPE_LANGUAGES as Record<string, { status: "LIVE" | "CONFIGURED" }>)[language]?.status ?? "UNSUPPORTED";
}
