import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadow, spacing } from "@/src/theme";

type StickyBackHeaderProps = {
  onPress: () => void;
  testID?: string;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  backgroundColor?: string;
  borderColor?: string;
  iconColor?: string;
  buttonBackgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function StickyBackHeader({
  onPress,
  testID = "shared-back-button",
  title,
  subtitle,
  right,
  backgroundColor = colors.bg,
  borderColor = colors.border,
  iconColor = colors.text,
  buttonBackgroundColor = colors.bgElev,
  style,
  contentStyle,
}: StickyBackHeaderProps) {
  return (
    <View style={[styles.wrap, { backgroundColor, borderBottomColor: borderColor }, style]}>
      <View style={[styles.content, contentStyle]}>
        <Pressable
          testID={testID}
          onPress={onPress}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => [
            styles.backButton,
            { borderColor, backgroundColor: buttonBackgroundColor, opacity: pressed ? 0.78 : 1 },
            shadow.soft,
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={iconColor} />
        </Pressable>

        {title || subtitle ? (
          <View style={styles.titleBlock}>
            {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        ) : null}

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    flexShrink: 0,
    zIndex: 100,
    elevation: 4,
  },
  content: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  right: {
    flex: 1,
    minWidth: 0,
  },
});
