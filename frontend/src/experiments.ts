export const EXPERIMENT_STORAGE_KEY = "ryancad-experiments-v1";
export const ACTIVE_APPEARANCE_ID = "active-component-appearance";
export const ACTIVE_APPEARANCE_STYLES = [
  { id: "soft-glow", name: "Soft glow" },
  { id: "rim-glow", name: "Rim glow" },
  { id: "height-gradient", name: "Height gradient" },
] as const;
export interface ActiveAppearance {
  enabled: boolean;
  style: (typeof ACTIVE_APPEARANCE_STYLES)[number]["id"];
  strength: number;
  tint: string;
}
export interface Experiments {
  version: 1;
  "active-component-appearance": ActiveAppearance;
}
export const defaultAppearance = (): ActiveAppearance => ({
  enabled: false,
  style: "soft-glow",
  strength: 0.65,
  tint: "#f3b879",
});
export function normalizeExperiments(raw: unknown): Experiments {
  const defaults = defaultAppearance(),
    value =
      (raw as any)?.version === 1 ? (raw as any)[ACTIVE_APPEARANCE_ID] : null;
  return {
    version: 1,
    [ACTIVE_APPEARANCE_ID]: {
      enabled:
        typeof value?.enabled === "boolean" ? value.enabled : defaults.enabled,
      style: ACTIVE_APPEARANCE_STYLES.some((s) => s.id === value?.style)
        ? value.style
        : defaults.style,
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
