// Shared design tokens. Keep `colors` as the dark fallback for legacy imports;
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
  primary: "#F5B301",
  primaryDark: "#C99000",
  primaryText: "#09111F",
  accent: "#4C8DFF",
  success: "#22C55E",
  warn: "#F97316",
  danger: "#EF4444",
  chipBg: "#16233A",
  chipBgActive: "#F5B301",
  chipTextActive: "#09111F",
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
  bg: "#F4F6FA",
  bgSoft: "#EEF2F7",
  bgElev: "#FFFFFF",
  bgElev2: "#F8FAFC",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  textDim: "#475569",
  textMuted: "#94A3B8",
  primary: "#F5B301",
  primaryDark: "#C99000",
  primaryText: "#111827",
  accent: "#2563EB",
  success: "#16A34A",
  warn: "#EA580C",
  danger: "#DC2626",
  chipBg: "#EEF2F7",
  chipBgActive: "#F5B301",
  chipTextActive: "#111827",
  overlay: "rgba(15,23,42,0.42)",
  status: {
    notStarted: "#64748B",
    preparing: "#EA580C",
    review: "#2563EB",
    complete: "#16A34A",
    revision: "#DC2626",
  },
};

export const colors = darkColors;

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
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
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
