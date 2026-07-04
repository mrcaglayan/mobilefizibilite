import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppThemeColors, alpha, font, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, isDark } = useAppTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.bgElev,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.md,
        },
        !isDark && shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
  testID,
  small,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  small?: boolean;
}) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.bgElev2
        : variant === "danger"
          ? colors.danger
          : "transparent";
  const fg =
    variant === "primary"
      ? colors.primaryText
      : variant === "danger"
        ? "#FFFFFF"
        : colors.text;
  const border =
    variant === "ghost" || variant === "secondary" ? colors.borderStrong : "transparent";

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 44,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "ghost" || variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.84 : 1,
          paddingVertical: small ? 8 : 12,
          paddingHorizontal: small ? 14 : 18,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Ionicons name={icon} size={small ? 15 : 17} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: small ? 13 : 15, fontWeight: "700" as const }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Input({
  label,
  hint,
  right,
  style,
  testID,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[styles.inputLabel, { color: colors.textDim }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.bgElev2,
            borderColor: colors.border,
          },
        ]}
      >
        <TextInput
          testID={testID}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }, style]}
          {...rest}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {hint ? <Text style={[styles.inputHint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Ara...",
  testID,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.searchWrap,
        { backgroundColor: colors.bgElev2, borderColor: colors.border },
      ]}
    >
      <Ionicons name="search-outline" size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        testID={testID}
        style={[styles.searchInput, { color: colors.text }]}
        autoCapitalize="none"
      />
    </View>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  testID,
}: {
  label: string;
  value: number | string | null | undefined;
  onChange: (v: number) => void;
  unit?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const [text, setText] = React.useState(String(value ?? ""));
  React.useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.inputLabel, { color: colors.textDim }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
        <TextInput
          testID={testID}
          value={text}
          onChangeText={(t) => {
            const cleaned = t.replace(/[^\d.-]/g, "");
            setText(cleaned);
            const n = parseFloat(cleaned);
            onChange(isNaN(n) ? 0 : n);
          }}
          keyboardType="numeric"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
        />
        {unit ? (
          <View style={styles.inputRight}>
            <Text style={{ color: colors.textDim, ...font.small }}>{unit}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.chipBgActive : colors.chipBg,
          borderColor: active ? colors.chipBgActive : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          color: active ? colors.chipTextActive : colors.textDim,
          ...font.small,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({ value, height = 7 }: { value: number; height?: number }) {
  const { colors } = useAppTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.pbTrack, { height, backgroundColor: colors.bgSoft }]}>
      <View
        style={[
          styles.pbFill,
          {
            width: `${pct}%`,
            backgroundColor:
              pct >= 80 ? colors.success : pct >= 40 ? colors.primary : colors.warn,
          },
        ]}
      />
    </View>
  );
}

export function Row({
  label,
  value,
  strong,
  color,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View testID={testID} style={[styles.rowKV, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: strong ? colors.text : colors.textDim }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: color || (strong ? colors.text : colors.textDim) }]}>
        {value}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon = "document-outline",
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.bgElev2 }]}>
        <Ionicons name={icon} size={28} color={colors.textDim} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.emptySub, { color: colors.textDim }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function BrandMark({ small }: { small?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View
        style={{
          width: small ? 26 : 34,
          height: small ? 26 : 34,
          borderRadius: small ? 9 : 11,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.primaryText, fontWeight: "900", fontSize: small ? 13 : 17 }}>F</Text>
      </View>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: small ? 15 : 19, letterSpacing: 0 }}>
        Feasibility Studio
      </Text>
    </View>
  );
}

export function ScreenScaffold({
  children,
  bottomNav,
  testID,
}: {
  children: React.ReactNode;
  bottomNav?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID={testID}>
      <View style={{ flex: 1 }}>{children}</View>
      {bottomNav}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  right,
  testID,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      testID={testID}
      style={[styles.screenHeader, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={[styles.headerBack, { backgroundColor: colors.bgElev, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text style={[styles.headerEyebrow, { color: colors.textMuted }]} numberOfLines={1}>{eyebrow}</Text> : null}
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.headerSub, { color: colors.textDim }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function StatusBadge({
  label,
  tone = "notStarted",
}: {
  label: string;
  tone?: keyof AppThemeColors["status"];
}) {
  const { colors } = useAppTheme();
  const color = colors.status[tone] || colors.textDim;
  return (
    <View style={[styles.statusBadge, { backgroundColor: alpha(color, 0.12), borderColor: alpha(color, 0.32) }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputLabel: { ...font.small, marginBottom: 6 },
  inputWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputRight: { paddingHorizontal: 12 },
  inputHint: { ...font.small, marginTop: 6 },
  searchWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  chip: {
    maxWidth: 190,
    paddingHorizontal: 13,
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  pbTrack: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  pbFill: { height: "100%", borderRadius: 999 },
  rowKV: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { ...font.body, flex: 1 },
  rowValue: { ...font.mono, textAlign: "right", flexShrink: 1 },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { ...font.h3, textAlign: "center" },
  emptySub: { ...font.body, textAlign: "center", maxWidth: 280 },
  screenHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: { ...font.tiny, letterSpacing: 0 },
  headerTitle: { ...font.h3, marginTop: 1 },
  headerSub: { ...font.small, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexShrink: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 99 },
  statusText: { ...font.tiny, fontWeight: "800" },
});
