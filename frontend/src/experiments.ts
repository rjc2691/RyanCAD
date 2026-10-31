import {DARK_UI_PALETTE_ID,darkThemes,defaultDarkPalette,type DarkPalette} from "./themes.ts";
export const EXPERIMENT_STORAGE_KEY = "ryancad-experiments-v1";
export const ACTIVE_APPEARANCE_ID = "active-component-appearance";
export interface ActiveAppearance {
  enabled: boolean;
  strength: number;
  tint: string;
  speed: number;
  pulses: number;
}
export interface Experiments {
  version: 1;
  "dark-ui-palette": DarkPalette;
  "active-component-appearance": ActiveAppearance;
}
export const defaultAppearance = (): ActiveAppearance => ({
  enabled: false,
  strength: 0.8,
  tint: "#79bfff",
  speed: 0.16,
  pulses: 3,
});
export function normalizeExperiments(raw: unknown): Experiments {
  const defaults = defaultAppearance(),
    value =
      (raw as any)?.version === 1 ? (raw as any)[ACTIVE_APPEARANCE_ID] : null;
  return {
    version: 1,
    [DARK_UI_PALETTE_ID]: {
      enabled: (raw as any)?.version===1 && (raw as any)?.[DARK_UI_PALETTE_ID]?.enabled===true,
      theme: darkThemes.find(t=>t.id===((raw as any)?.version===1?(raw as any)?.[DARK_UI_PALETTE_ID]?.theme:null))?.id || defaultDarkPalette().theme,
    },
    [ACTIVE_APPEARANCE_ID]: {
      enabled:
        typeof value?.enabled === "boolean" ? value.enabled : defaults.enabled,
      speed:
        typeof value?.speed === "number" && Number.isFinite(value.speed)
          ? Math.max(0.02, Math.min(1, value.speed))
          : defaults.speed,
      pulses:
        typeof value?.pulses === "number" && Number.isFinite(value.pulses)
          ? Math.max(1, Math.min(6, Math.round(value.pulses)))
          : defaults.pulses,
      strength:
        typeof value?.strength === "number" && Number.isFinite(value.strength)
          ? Math.max(0.1, Math.min(1, value.strength))
          : defaults.strength,
      tint:
        typeof value?.tint === "string" && /^#[0-9a-f]{6}$/i.test(value.tint)
          ? value.tint
          : defaults.tint,
    },
  };
}
export function loadExperiments(): Experiments {
  try {
    return normalizeExperiments(
      JSON.parse(localStorage.getItem(EXPERIMENT_STORAGE_KEY) || "null"),
    );
  } catch {
    return normalizeExperiments(null);
  }
}
export function saveExperiments(value: Experiments) {
  try {
    localStorage.setItem(EXPERIMENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* View preferences still work in memory. */
  }
}
