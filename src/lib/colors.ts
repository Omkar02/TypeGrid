/**
 * Project colour coding.
 *
 * Twelve hues, each with four intensity steps so a project can drive a
 * GitHub-style heatmap on its own. Values are literal hex rather than Tailwind
 * classes because the class names would be built at runtime
 * (`bg-${color}-500`) and get purged from the production CSS.
 *
 * Tuned for the light UI, which is what the app actually renders today — there
 * is no theme toggle and `.dark` is never applied.
 */

export const PROJECT_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "violet",
  "fuchsia",
  "rose",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const DEFAULT_PROJECT_COLOR: ProjectColor = "blue";

interface ColorSpec {
  label: string;
  /** The swatch shown in pickers and next to project names. */
  base: string;
  /** Four heatmap steps, lightest to darkest. */
  levels: [string, string, string, string];
}

export const COLOR_SPECS: Record<ProjectColor, ColorSpec> = {
  slate: {
    label: "Slate",
    base: "#64748b",
    levels: ["#cbd5e1", "#94a3b8", "#64748b", "#334155"],
  },
  red: {
    label: "Red",
    base: "#ef4444",
    levels: ["#fecaca", "#f87171", "#ef4444", "#b91c1c"],
  },
  orange: {
    label: "Orange",
    base: "#f97316",
    levels: ["#fed7aa", "#fb923c", "#f97316", "#c2410c"],
  },
  amber: {
    label: "Amber",
    base: "#f59e0b",
    levels: ["#fde68a", "#fbbf24", "#f59e0b", "#b45309"],
  },
  lime: {
    label: "Lime",
    base: "#84cc16",
    levels: ["#d9f99d", "#a3e635", "#84cc16", "#4d7c0f"],
  },
  green: {
    label: "Green",
    base: "#22c55e",
    levels: ["#bbf7d0", "#4ade80", "#22c55e", "#15803d"],
  },
  teal: {
    label: "Teal",
    base: "#14b8a6",
    levels: ["#99f6e4", "#2dd4bf", "#14b8a6", "#0f766e"],
  },
  cyan: {
    label: "Cyan",
    base: "#06b6d4",
    levels: ["#a5f3fc", "#22d3ee", "#06b6d4", "#0e7490"],
  },
  blue: {
    label: "Blue",
    base: "#3b82f6",
    levels: ["#bfdbfe", "#60a5fa", "#3b82f6", "#1d4ed8"],
  },
  violet: {
    label: "Violet",
    base: "#8b5cf6",
    levels: ["#ddd6fe", "#a78bfa", "#8b5cf6", "#6d28d9"],
  },
  fuchsia: {
    label: "Fuchsia",
    base: "#d946ef",
    levels: ["#f5d0fe", "#e879f9", "#d946ef", "#a21caf"],
  },
  rose: {
    label: "Rose",
    base: "#f43f5e",
    levels: ["#fecdd3", "#fb7185", "#f43f5e", "#be123c"],
  },
};

/** Colour of a heatmap cell with nothing scheduled. */
export const EMPTY_LEVEL_COLOR = "#ebedf0";

export function isProjectColor(value: unknown): value is ProjectColor {
  return (
    typeof value === "string" &&
    (PROJECT_COLORS as readonly string[]).includes(value)
  );
}

export function colorSpec(color: ProjectColor): ColorSpec {
  return COLOR_SPECS[color] ?? COLOR_SPECS[DEFAULT_PROJECT_COLOR];
}

/**
 * Maps a per-day count onto one of the four steps. Counts are small here — a
 * handful of releases a day at most — so the thresholds stay tight rather than
 * scaling to the maximum in view, which would make one busy day wash out the
 * rest of the year.
 */
export function intensityFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function cellColor(color: ProjectColor, count: number): string {
  const level = intensityFor(count);
  return level === 0 ? EMPTY_LEVEL_COLOR : colorSpec(color).levels[level - 1];
}

/** First colour not already taken, so new projects look distinct by default. */
export function nextFreeColor(taken: readonly ProjectColor[]): ProjectColor {
  const used = new Set(taken);
  return (
    PROJECT_COLORS.find((color) => !used.has(color)) ?? DEFAULT_PROJECT_COLOR
  );
}
