import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppThemeColors, alpha, font, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";

export type AppIconName = keyof typeof Ionicons.glyphMap;
export type StatusTone =
  | keyof AppThemeColors["status"]
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "info";
type GradientStops = readonly [string, string, ...string[]];

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

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toneColor(colors: AppThemeColors, tone: StatusTone = "muted") {
  const statusColors = colors.status as Record<string, string>;
  if (tone === "primary" || tone === "info") return colors.primary;
  if (tone === "accent") return colors.accent;
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warn;
  if (tone === "danger") return colors.danger;
  if (tone === "muted") return colors.textMuted;
  return statusColors[tone] || colors.textDim;
}

function HeaderIconButton({
  icon,
  onPress,
  badge,
  testID,
}: {
  icon: AppIconName;
  onPress?: () => void;
  badge?: boolean;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerIconButton,
        {
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          opacity: pressed ? 0.76 : 1,
        },
        shadow.soft,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      {badge ? <View style={[styles.headerIconDot, { backgroundColor: colors.danger }]} /> : null}
    </Pressable>
  );
}

export function StatusPill({
  label,
  tone = "muted",
  icon,
  showDot = true,
  style,
  testID,
}: {
  label: string;
  tone?: StatusTone;
  icon?: AppIconName;
  showDot?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const color = toneColor(colors, tone);
  return (
    <View
      testID={testID}
      style={[
        styles.statusBadge,
        { backgroundColor: alpha(color, 0.12), borderColor: alpha(color, 0.28) },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      {!icon && showDot ? <View style={[styles.statusDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.statusText, { color }]} numberOfLines={1}>
        {label}
      </Text>
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
  return <StatusPill label={label} tone={tone} />;
}

export function AppTopHeader({
  eyebrow,
  title = "Feasibility Studio",
  subtitle,
  onBack,
  onNotificationPress,
  onProfilePress,
  notificationDot,
  right,
  style,
  testID,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onNotificationPress?: () => void;
  onProfilePress?: () => void;
  notificationDot?: boolean;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View testID={testID} style={[styles.appTopHeader, { backgroundColor: colors.bg }, style]}>
      {onBack ? <HeaderIconButton icon="chevron-back" onPress={onBack} /> : null}
      <View style={styles.appTopTitleWrap}>
        {eyebrow ? (
          <Text style={[styles.appTopEyebrow, { color: colors.textMuted }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.appTopTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.appTopSubtitle, { color: colors.textDim }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.appTopActions}>
        {right}
        {onNotificationPress ? (
          <HeaderIconButton
            icon="notifications-outline"
            onPress={onNotificationPress}
            badge={notificationDot}
            testID={testID ? `${testID}-notifications` : undefined}
          />
        ) : null}
        {onProfilePress ? (
          <HeaderIconButton
            icon="person-circle-outline"
            onPress={onProfilePress}
            testID={testID ? `${testID}-profile` : undefined}
          />
        ) : null}
      </View>
    </View>
  );
}

export function SearchHeader({
  value,
  onChangeText,
  placeholder = "Ara...",
  onNotificationPress,
  onProfilePress,
  notificationDot,
  right,
  inputProps,
  style,
  testID,
}: {
  value?: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  onNotificationPress?: () => void;
  onProfilePress?: () => void;
  notificationDot?: boolean;
  right?: React.ReactNode;
  inputProps?: TextInputProps;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View testID={testID} style={[styles.searchHeader, { backgroundColor: colors.bg }, style]}>
      <View style={[styles.searchHeaderInputWrap, { backgroundColor: colors.bgElev, borderColor: colors.border }, shadow.soft]}>
        <Ionicons name="search-outline" size={24} color={colors.primary} />
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={[styles.searchHeaderInput, { color: colors.text }, inputProps?.style]}
          autoCapitalize={inputProps?.autoCapitalize ?? "none"}
        />
      </View>
      {right}
      {onNotificationPress ? (
        <HeaderIconButton icon="notifications" onPress={onNotificationPress} badge={notificationDot} />
      ) : null}
      {onProfilePress ? <HeaderIconButton icon="person-circle" onPress={onProfilePress} /> : null}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  right,
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View testID={testID} style={[styles.sectionHeader, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionHeaderSubtitle, { color: colors.textDim }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {actionLabel ? (
        <Pressable onPress={onActionPress} disabled={!onActionPress} hitSlop={8}>
          <Text style={[styles.sectionHeaderAction, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type QuickActionTileProps = {
  label: string;
  subtitle?: string;
  icon: AppIconName;
  onPress?: () => void;
  tone?: StatusTone;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function QuickActionGrid({
  actions,
  children,
  columns = 2,
  style,
  testID,
}: {
  actions?: QuickActionTileProps[];
  children?: React.ReactNode;
  columns?: 2 | 3 | 4;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const basis = columns === 4 ? "22%" : columns === 3 ? "30.5%" : "47%";
  const tileStyle = { flexBasis: basis } as ViewStyle;
  const sizedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement<{ style?: StyleProp<ViewStyle> }>(child)) return child;
    return React.cloneElement(child, { style: [tileStyle, child.props.style] });
  });
  return (
    <View testID={testID} style={[styles.quickGrid, style]}>
      {actions?.map((action) => (
        <QuickActionTile key={`${action.label}-${action.icon}`} {...action} style={[tileStyle, action.style]} />
      ))}
      {sizedChildren}
    </View>
  );
}

export function QuickActionTile({
  label,
  subtitle,
  icon,
  onPress,
  tone = "primary",
  active,
  disabled,
  style,
  testID,
}: QuickActionTileProps) {
  const { colors, isDark } = useAppTheme();
  const color = toneColor(colors, tone);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.quickTile,
        {
          backgroundColor: active ? alpha(color, 0.1) : colors.bgElev,
          borderColor: active ? alpha(color, 0.36) : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
        !isDark && shadow.soft,
        style,
      ]}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: alpha(color, 0.12) }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.quickTileSubtitle, { color: colors.textDim }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function GradientHeroCard({
  eyebrow,
  title,
  subtitle,
  icon,
  metricLabel,
  metricValue,
  progress,
  actionLabel,
  onAction,
  footer,
  right,
  gradientColors,
  style,
  testID,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  metricLabel?: string;
  metricValue?: string;
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
  footer?: React.ReactNode;
  right?: React.ReactNode;
  gradientColors?: GradientStops;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const pct = progress == null ? null : clampPct(progress);
  const stops = gradientColors ?? ([colors.primary, colors.primaryDark] as const);
  return (
    <LinearGradient
      testID={testID}
      colors={stops}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientHero, style]}
    >
      <View style={styles.heroTopRow}>
        {icon ? (
          <View style={[styles.heroIcon, { backgroundColor: alpha("#FFFFFF", 0.16) }]}>
            <Ionicons name={icon} size={24} color="#FFFFFF" />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Text style={styles.gradientEyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.gradientTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={styles.gradientSubtitle}>{subtitle}</Text> : null}
      {metricValue || metricLabel ? (
        <View style={styles.gradientMetricRow}>
          {metricValue ? <Text style={styles.gradientMetricValue}>{metricValue}</Text> : null}
          {metricLabel ? <Text style={styles.gradientMetricLabel}>{metricLabel}</Text> : null}
        </View>
      ) : null}
      {pct != null ? (
        <View style={styles.gradientProgressTrack}>
          <View style={[styles.gradientProgressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
        </View>
      ) : null}
      {(actionLabel && onAction) || footer ? (
        <View style={styles.gradientFooter}>
          <View style={{ flex: 1, minWidth: 0 }}>{footer}</View>
          {actionLabel && onAction ? (
            <Pressable onPress={onAction} style={({ pressed }) => [styles.gradientAction, { opacity: pressed ? 0.84 : 1 }]}>
              <Text style={[styles.gradientActionText, { color: colors.primary }]}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </LinearGradient>
  );
}

export function ProgressUsageCard({
  title,
  subtitle,
  valueLabel,
  totalLabel,
  progress,
  footerLabel,
  footerValue,
  icon = "analytics-outline",
  onPress,
  gradientColors,
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  valueLabel: string;
  totalLabel?: string;
  progress: number;
  footerLabel?: string;
  footerValue?: string;
  icon?: AppIconName;
  onPress?: () => void;
  gradientColors?: GradientStops;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const pct = clampPct(progress);
  const stops = gradientColors ?? ([colors.primary, colors.primaryDark] as const);
  const content = (
    <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.usageCard, style]}>
      <View style={styles.usageTopRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.usageTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.usageSubtitle}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </View>
      <View style={styles.usageValueRow}>
        <Text style={styles.usageValue}>{valueLabel}</Text>
        {totalLabel ? <Text style={styles.usageTotal}>{totalLabel}</Text> : null}
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
      </View>
      {(footerLabel || footerValue) ? (
        <View style={styles.usageFooter}>
          {footerLabel ? <Text style={styles.usageFooterLabel}>{footerLabel}</Text> : null}
          {footerValue ? <Text style={styles.usageFooterValue}>{footerValue}</Text> : null}
        </View>
      ) : null}
    </LinearGradient>
  );

  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
      {content}
    </Pressable>
  );
}

export function HorizontalCardRail({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  children,
  contentContainerStyle,
  style,
  testID,
}: {
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.rail, style]}>
      {title ? (
        <SectionHeader title={title} subtitle={subtitle} actionLabel={actionLabel} onActionPress={onActionPress} />
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.railContent, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function OfferLikeCard({
  title,
  subtitle,
  amount,
  detail,
  badge,
  priceLabel,
  previousPriceLabel,
  ctaLabel,
  onPress,
  icon,
  accentColor,
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  amount?: string;
  detail?: string;
  badge?: string;
  priceLabel?: string;
  previousPriceLabel?: string;
  ctaLabel?: string;
  onPress?: () => void;
  icon?: AppIconName;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, isDark } = useAppTheme();
  const accent = accentColor || colors.primary;
  const content = (
    <>
      <View style={[styles.offerStripe, { backgroundColor: accent }]} />
      <View style={styles.offerBody}>
        <View style={styles.offerTitleRow}>
          <Text style={[styles.offerTitle, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          {badge ? <Text style={[styles.offerBadge, { color: colors.accent }]}>{badge}</Text> : null}
          {icon ? <Ionicons name={icon} size={22} color={accent} /> : null}
        </View>
        {subtitle ? <Text style={[styles.offerSubtitle, { color: colors.textDim }]} numberOfLines={2}>{subtitle}</Text> : null}
        {amount ? <Text style={[styles.offerAmount, { color: colors.text }]}>{amount}</Text> : null}
        {detail ? <Text style={[styles.offerDetail, { color: colors.textDim }]}>{detail}</Text> : null}
      </View>
      {(priceLabel || previousPriceLabel || ctaLabel) ? (
        <View style={[styles.offerFooter, { backgroundColor: alpha(accent, 0.1), borderTopColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {previousPriceLabel ? <Text style={[styles.offerPrevPrice, { color: colors.textDim }]}>{previousPriceLabel}</Text> : null}
            {priceLabel ? <Text style={[styles.offerPrice, { color: accent }]} numberOfLines={1}>{priceLabel}</Text> : null}
          </View>
          {ctaLabel ? (
            <View style={[styles.offerCta, { backgroundColor: accent }]}>
              <Text style={styles.offerCtaText}>{ctaLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const cardStyle = [
    styles.offerCard,
    {
      backgroundColor: colors.bgElev,
      borderColor: colors.border,
    },
    !isDark && shadow.soft,
    style,
  ];

  if (!onPress) return <View testID={testID} style={cardStyle}>{content}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.84 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function RewardActionCard({
  title,
  description,
  subtitle,
  icon,
  statusLabel,
  statusTone = "primary",
  ctaLabel,
  onPress,
  footerText,
  accentColor,
  style,
  testID,
}: {
  title: string;
  description?: string;
  subtitle?: string;
  icon?: AppIconName;
  statusLabel?: string;
  statusTone?: StatusTone;
  ctaLabel?: string;
  onPress?: () => void;
  footerText?: string;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, isDark } = useAppTheme();
  const accent = accentColor || toneColor(colors, statusTone);
  const content = (
    <>
      <View style={styles.rewardBody}>
        <View style={styles.rewardTitleRow}>
          <Text style={[styles.rewardTitle, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          {statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : null}
        </View>
        <View style={styles.rewardContentRow}>
          {icon ? (
            <View style={[styles.rewardIcon, { backgroundColor: alpha(accent, 0.12) }]}>
              <Ionicons name={icon} size={30} color={accent} />
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            {subtitle ? <Text style={[styles.rewardSubtitle, { color: colors.textDim }]}>{subtitle}</Text> : null}
            {description ? <Text style={[styles.rewardDescription, { color: colors.text }]}>{description}</Text> : null}
          </View>
        </View>
      </View>
      {(footerText || ctaLabel) ? (
        <View style={[styles.rewardFooter, { backgroundColor: accent }]}>
          {footerText ? <Text style={styles.rewardFooterText} numberOfLines={2}>{footerText}</Text> : <View style={{ flex: 1 }} />}
          {ctaLabel ? (
            <View style={styles.rewardFooterCta}>
              <Text style={[styles.rewardFooterCtaText, { color: accent }]}>{ctaLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const cardStyle = [
    styles.rewardCard,
    { backgroundColor: colors.bgElev, borderColor: colors.border },
    !isDark && shadow.card,
    style,
  ];

  if (!onPress) return <View testID={testID} style={cardStyle}>{content}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.86 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function ModuleCard({
  title,
  subtitle,
  icon,
  statusLabel,
  statusTone = "muted",
  progress,
  ctaLabel,
  onPress,
  right,
  footer,
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  statusLabel?: string;
  statusTone?: StatusTone;
  progress?: number;
  ctaLabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, isDark } = useAppTheme();
  const tone = toneColor(colors, statusTone);
  const content = (
    <>
      <View style={styles.moduleTop}>
        {icon ? (
          <View style={[styles.moduleIcon, { backgroundColor: alpha(tone, 0.12) }]}>
            <Ionicons name={icon} size={21} color={tone} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.moduleTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={[styles.moduleSubtitle, { color: colors.textDim }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {statusLabel || progress != null ? (
        <View style={styles.moduleMetaRow}>
          {statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : null}
          {progress != null ? (
            <Text style={[styles.moduleProgressText, { color: colors.textDim }]}>{Math.round(clampPct(progress))}%</Text>
          ) : null}
        </View>
      ) : null}
      {progress != null ? <ProgressBar value={progress} height={6} /> : null}
      {(footer || ctaLabel) ? (
        <View style={styles.moduleFooter}>
          <View style={{ flex: 1, minWidth: 0 }}>{footer}</View>
          {ctaLabel ? (
            <View style={[styles.moduleCta, { backgroundColor: alpha(colors.primary, 0.1) }]}>
              <Text style={[styles.moduleCtaText, { color: colors.primary }]}>{ctaLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const cardStyle = [
    styles.moduleCard,
    { backgroundColor: colors.bgElev, borderColor: colors.border },
    !isDark && shadow.soft,
    style,
  ];

  if (!onPress) return <View testID={testID} style={cardStyle}>{content}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.84 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function EmptyStateCard({
  icon = "document-outline",
  title,
  subtitle,
  actionLabel,
  onActionPress,
  style,
  testID,
}: {
  icon?: AppIconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Card testID={testID} style={[styles.emptyStateCard, style]}>
      <EmptyState icon={icon} title={title} subtitle={subtitle} />
      {actionLabel ? <Button label={actionLabel} onPress={onActionPress} small style={styles.emptyStateAction} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerIconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  appTopHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  appTopTitleWrap: { flex: 1, minWidth: 0 },
  appTopActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  appTopEyebrow: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.5 },
  appTopTitle: { ...font.h2, fontSize: 20 },
  appTopSubtitle: { ...font.small, marginTop: 2 },
  searchHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchHeaderInputWrap: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchHeaderInput: { flex: 1, fontSize: 16, fontWeight: "600", paddingVertical: 10 },
  sectionHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeaderTitle: { ...font.h3, fontSize: 17 },
  sectionHeaderSubtitle: { ...font.small, marginTop: 2 },
  sectionHeaderAction: { ...font.bodyMd, fontWeight: "800" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickTile: {
    minHeight: 84,
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  quickTileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: { ...font.bodyMd, lineHeight: 19 },
  quickTileSubtitle: { ...font.tiny, marginTop: 3 },
  gradientHero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
    gap: spacing.md,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientEyebrow: { color: "rgba(255,255,255,0.72)", ...font.tiny, textTransform: "uppercase" },
  gradientTitle: { color: "#FFFFFF", ...font.h2, fontSize: 23 },
  gradientSubtitle: { color: "rgba(255,255,255,0.82)", ...font.body, lineHeight: 22 },
  gradientMetricRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  gradientMetricValue: { color: "#FFFFFF", ...font.h1, fontSize: 32 },
  gradientMetricLabel: { color: "rgba(255,255,255,0.84)", ...font.bodyMd, paddingBottom: 4 },
  gradientProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  gradientProgressFill: { height: "100%", borderRadius: radius.pill },
  gradientFooter: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  gradientAction: {
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  gradientActionText: { ...font.small, fontWeight: "900" },
  usageCard: {
    minHeight: 210,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
  },
  usageTopRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  usageTitle: { color: "#FFFFFF", ...font.h2, fontSize: 21 },
  usageSubtitle: { color: "rgba(255,255,255,0.82)", ...font.bodyMd, marginTop: 4 },
  usageValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  usageValue: { color: "#FFFFFF", ...font.h1, fontSize: 30 },
  usageTotal: { color: "#FFFFFF", ...font.h3 },
  usageTrack: {
    height: 9,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.34)",
    marginTop: spacing.md,
  },
  usageFill: { height: "100%", borderRadius: radius.pill },
  usageFooter: { marginTop: spacing.lg },
  usageFooterLabel: { color: "rgba(255,255,255,0.8)", ...font.body },
  usageFooterValue: { color: "#FFFFFF", ...font.h3, marginTop: 3 },
  rail: { gap: spacing.sm },
  railContent: { gap: spacing.md, paddingRight: spacing.md },
  offerCard: {
    width: 210,
    minHeight: 210,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  offerStripe: { height: 9 },
  offerBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
  offerTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  offerTitle: { ...font.bodyMd, flex: 1 },
  offerBadge: { ...font.h2, fontStyle: "italic" },
  offerSubtitle: { ...font.small },
  offerAmount: { ...font.h2, marginTop: "auto" },
  offerDetail: { ...font.bodyMd },
  offerFooter: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offerPrevPrice: { ...font.small },
  offerPrice: { ...font.h3 },
  offerCta: {
    borderRadius: radius.pill,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  offerCtaText: { color: "#FFFFFF", ...font.small, fontWeight: "900" },
  rewardCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rewardBody: { padding: spacing.lg, gap: spacing.md },
  rewardTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rewardTitle: { ...font.h2, fontSize: 20, flex: 1 },
  rewardContentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rewardIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardSubtitle: { ...font.small, marginBottom: 4 },
  rewardDescription: { ...font.body, lineHeight: 21 },
  rewardFooter: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rewardFooterText: { color: "#FFFFFF", ...font.bodyMd, flex: 1, lineHeight: 20 },
  rewardFooterCta: {
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  rewardFooterCtaText: { ...font.bodyMd, fontWeight: "900" },
  moduleCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
  },
  moduleTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  moduleIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTitle: { ...font.bodyMd, fontSize: 16 },
  moduleSubtitle: { ...font.small, marginTop: 3, lineHeight: 18 },
  moduleMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  moduleProgressText: { ...font.tiny },
  moduleFooter: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  moduleCta: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  moduleCtaText: { ...font.small, fontWeight: "900" },
  emptyStateCard: { alignItems: "center" },
  emptyStateAction: { alignSelf: "center", marginTop: -spacing.sm },
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
