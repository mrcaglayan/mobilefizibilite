// Design tokens — dark corporate finance palette.
// Inspired by the original "Feasibility Studio" web app but tuned for mobile.

export const colors = {
  bg: "#0B1220",         // deep navy — canvas
  bgElev: "#111A2E",     // card
  bgElev2: "#17233D",    // hovered card / input
  border: "#1F2C48",
  borderStrong: "#2A3A5F",
  text: "#E6ECF7",       // primary text
  textDim: "#98A3BE",    // secondary text
  textMuted: "#5A6785",  // tertiary
  primary: "#F5B301",    // amber — brand accent (finance/energy)
  primaryDark: "#C99000",
  primaryText: "#0B1220",
  accent: "#4C8DFF",     // blue accent
  success: "#22C55E",
  warn: "#F97316",
  danger: "#EF4444",
  chipBg: "#17233D",
  chipBgActive: "#F5B301",
  chipTextActive: "#0B1220",
  overlay: "rgba(0,0,0,0.5)",
};

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
  xl: 24,
  pill: 999,
};

export const font = {
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  bodyMd: { fontSize: 15, fontWeight: "600" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
  tiny: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.6 },
  mono: { fontSize: 15, fontWeight: "700" as const, fontVariant: ["tabular-nums" as const] },
};

export function formatMoney(n: number, currency = "TRY"): string {
  if (!isFinite(n)) return "-";
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1_000_000_000) out = (n / 1_000_000_000).toFixed(2) + " Mr";
  else if (abs >= 1_000_000) out = (n / 1_000_000).toFixed(2) + " M";
  else if (abs >= 1_000) out = (n / 1_000).toFixed(1) + " B";
  else out = Math.round(n).toString();
  const sym = currency === "TRY" ? "₺" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency + " ";
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
