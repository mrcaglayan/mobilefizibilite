import React from "react";
import {
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

import { colors, font, radius, spacing } from "@/src/theme";

type NumberValue = number | null;

function parseNumber(text: string): NumberValue {
  const normalized = text.replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function numberText(value: NumberValue | undefined) {
  return value == null ? "" : String(value);
}

export function FormSection({
  title,
  subtitle,
  right,
  children,
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function FormRow({
  label,
  hint,
  error,
  required,
  children,
  testID,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      </View>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FinancialNumberInput({
  value,
  onChange,
  unit,
  placeholder,
  disabled,
  testID,
  inputProps,
}: {
  value: NumberValue | undefined;
  onChange: (value: NumberValue) => void;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  inputProps?: TextInputProps;
}) {
  const [text, setText] = React.useState(numberText(value));

  React.useEffect(() => {
    setText(numberText(value));
  }, [value]);

  return (
    <View style={styles.inputWrap}>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={(nextText) => {
          if (disabled) return;
          setText(nextText);
          onChange(parseNumber(nextText));
        }}
        editable={!disabled}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, disabled && styles.disabledText]}
        {...inputProps}
      />
      {unit ? (
        <View style={styles.unitBox}>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MoneyInput(props: Omit<React.ComponentProps<typeof FinancialNumberInput>, "unit"> & { currency: string }) {
  const { currency, ...rest } = props;
  return <FinancialNumberInput {...rest} unit={currency} />;
}

export function PercentInput(props: Omit<React.ComponentProps<typeof FinancialNumberInput>, "unit">) {
  return <FinancialNumberInput {...props} unit="%" />;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  testID,
}: {
  options: { label: string; value: T; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            disabled={disabled || option.disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: active ? colors.primary : "transparent",
                opacity: disabled || option.disabled ? 0.45 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.segmentText, { color: active ? colors.primaryText : colors.textDim }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleField({
  label,
  value,
  onChange,
  hint,
  disabled,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!value)}
      disabled={disabled}
      style={({ pressed }) => [styles.toggleRow, { opacity: disabled ? 0.5 : pressed ? 0.82 : 1 }]}
    >
      <View style={[styles.checkbox, value && styles.checkboxActive]}>
        {value ? <Ionicons name="checkmark" size={15} color={colors.primaryText} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function ReadonlyValueRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    ...font.h3,
  },
  sectionSub: {
    color: colors.textDim,
    ...font.small,
    marginTop: 4,
  },
  sectionBody: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: colors.textDim,
    ...font.small,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  required: {
    color: colors.warn,
  },
  hint: {
    color: colors.textMuted,
    ...font.small,
  },
  error: {
    color: colors.danger,
    ...font.small,
  },
  inputWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  disabledText: {
    color: colors.textMuted,
  },
  unitBox: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  unit: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "700",
  },
  segmented: {
    minHeight: 42,
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  segmentText: {
    ...font.small,
    fontWeight: "800",
    textAlign: "center",
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev2,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleLabel: {
    color: colors.text,
    ...font.bodyMd,
  },
  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  readonlyLabel: {
    flex: 1,
    color: colors.textDim,
    ...font.body,
  },
  readonlyValue: {
    color: colors.text,
    ...font.mono,
    textAlign: "right",
  },
});
