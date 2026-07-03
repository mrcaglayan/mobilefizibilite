// Reusable UI primitives: Card, Button, Input, ProgressBar, Chip, ScreenHeader, ErrorState.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/src/theme";

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, style]}>
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
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "ghost" || variant === "secondary" ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
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
          {icon ? <Ionicons name={icon} size={small ? 14 : 16} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg, fontSize: small ? 13 : 15 }]}>{label}</Text>
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
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          testID={testID}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...rest}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {hint ? <Text style={styles.inputHint}>{hint}</Text> : null}
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
  const [text, setText] = React.useState(String(value ?? ""));
  React.useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputWrap}>
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
          style={styles.input}
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

export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.pbTrack, { height }]}>
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
  return (
    <View testID={testID} style={styles.rowKV}>
      <Text style={[styles.rowLabel, strong && { color: colors.text }]}>{label}</Text>
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
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.textDim} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function BrandMark({ small }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: small ? 22 : 28,
          height: small ? 22 : 28,
          borderRadius: 8,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.primaryText, fontWeight: "900", fontSize: small ? 12 : 15 }}>F</Text>
      </View>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: small ? 14 : 17, letterSpacing: -0.3 }}>
        Feasibility Studio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  btn: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { fontWeight: "700" },
  inputLabel: { color: colors.textDim, ...font.small, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputRight: { paddingHorizontal: 12 },
  inputHint: { color: colors.textMuted, ...font.small, marginTop: 6 },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pbTrack: {
    width: "100%",
    backgroundColor: colors.bgElev2,
    borderRadius: 999,
    overflow: "hidden",
  },
  pbFill: { height: "100%", borderRadius: 999 },
  rowKV: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textDim, ...font.body },
  rowValue: { ...font.mono },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.bgElev2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { color: colors.text, ...font.h3, textAlign: "center" },
  emptySub: { color: colors.textDim, ...font.body, textAlign: "center", maxWidth: 260 },
});
