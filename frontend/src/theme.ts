// Shared design tokens. Keep `colors` as the light-first fallback for legacy imports;
// new UI should prefer `useAppTheme()` from theme-provider.

export type AppThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export type AppThemeColors = {
  bg: string;
  bgSoft: string;
  bgElev: string;
  bgElev2: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textMuted: string;
  primary: string;
  primaryDark: string;
  primaryText: string;
  accent: string;
  success: string;
  warn: string;
  danger: string;
  chipBg: string;
  chipBgActive: string;
  chipTextActive: string;
  overlay: string;
  status: {
    notStarted: string;
    preparing: string;
    review: string;
    complete: string;
    revision: string;
  };
};

export const darkColors: AppThemeColors = {
  bg: "#071020",
  bgSoft: "#0B1628",
  bgElev: "#101A2D",
  bgElev2: "#16233A",
  border: "#21304B",
  borderStrong: "#334665",
  text: "#F4F7FB",
  textDim: "#A8B3C7",
  textMuted: "#64748B",
  primary: "#4C8DFF",
  primaryDark: "#1D4ED8",
  primaryText: "#FFFFFF",
  accent: "#F5B301",
  success: "#22C55E",
  warn: "#F97316",
  danger: "#EF4444",
  chipBg: "#16233A",
  chipBgActive: "#4C8DFF",
  chipTextActive: "#FFFFFF",
  overlay: "rgba(3,7,18,0.72)",
  status: {
    notStarted: "#94A3B8",
    preparing: "#F97316",
    review: "#4C8DFF",
    complete: "#22C55E",
    revision: "#EF4444",
  },
};

export const lightColors: AppThemeColors = {
  bg: "#F3F7FB",
  bgSoft: "#EAF1F8",
  bgElev: "#FFFFFF",
  bgElev2: "#F8FBFF",
  border: "#DDE7F2",
  borderStrong: "#B8C7D9",
  text: "#122033",
  textDim: "#5A6B82",
  textMuted: "#91A0B4",
  primary: "#1557B0",
  primaryDark: "#0B47A1",
  primaryText: "#FFFFFF",
  accent: "#FFC400",
  success: "#16A34A",
  warn: "#EA580C",
  danger: "#DC2626",
  chipBg: "#EDF4FC",
  chipBgActive: "#1557B0",
  chipTextActive: "#FFFFFF",
  overlay: "rgba(15,23,42,0.42)",
  status: {
    notStarted: "#64748B",
    preparing: "#EA580C",
    review: "#1557B0",
    complete: "#16A34A",
    revision: "#DC2626",
  },
};

export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const font = {
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: 0 },
  h2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: 0 },
  h3: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  bodyMd: { fontSize: 15, fontWeight: "600" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
  tiny: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0 },
  mono: { fontSize: 15, fontWeight: "700" as const, fontVariant: ["tabular-nums" as const] },
};

export const shadow = {
  card: {
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  soft: {
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  nav: {
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
};

export function alpha(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${amount})`;
}

export function formatMoney(n: number, currency = "TRY"): string {
  if (!isFinite(n)) return "-";
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1_000_000_000) out = (n / 1_000_000_000).toFixed(2) + " Mr";
  else if (abs >= 1_000_000) out = (n / 1_000_000).toFixed(2) + " M";
  else if (abs >= 1_000) out = (n / 1_000).toFixed(1) + " B";
  else out = Math.round(n).toString();
  const sym = currency === "TRY" ? "TL " : currency === "USD" ? "$" : currency === "EUR" ? "EUR " : currency + " ";
  return `${sym}${out}`;
}

export function formatInt(n: number): string {
  if (!isFinite(n)) return "-";
  return Math.round(n).toLocaleString("tr-TR");
}

export function formatPct(n: number, digits = 1): string {
  if (!isFinite(n)) return "-";
  return n.toFixed(digits) + "%";
}
