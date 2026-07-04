import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { can } from "@/src/auth/permissions";
import { useAuth } from "@/src/auth/AuthContext";
import { alpha, font, radius, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";

type NavKey = "schools" | "review" | "users" | "permissions" | "settings";

type NavItem = {
  key: NavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

function activeKeyFromPath(pathname: string): NavKey {
  if (pathname.startsWith("/settings") || pathname.startsWith("/profile")) return "settings";
  if (pathname.includes("/review-queue") || pathname.includes("/approvals")) return "review";
  if (pathname.includes("/manage-permissions")) return "permissions";
  if (pathname.includes("/users") || pathname.includes("/user/")) return "users";
  return "schools";
}

export function AppBottomNav({ activeKey }: { activeKey?: NavKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark } = useAppTheme();

  const items = useMemo<NavItem[]>(() => {
    const scope = { countryId: user?.country_id ?? null, schoolId: null };
    const canManagePermissions = can(user, "page.manage_permissions", "write", scope);
    const canReview =
      user?.role === "admin" ||
      user?.role === "manager" ||
      user?.role === "accountant" ||
      can(user, "page.manage_permissions", "read", scope) ||
      canManagePermissions;

    const next: NavItem[] = [
      { key: "schools", label: "Okullar", icon: "school-outline", href: "/schools" },
    ];

    if (canReview) {
      next.push({
        key: "review",
        label: "İnceleme",
        icon: "checkbox-outline",
        href: user?.role === "admin" ? "/admin/approvals" : "/manager/review-queue",
      });
    }

    if (user?.role === "admin") {
      next.push({ key: "users", label: "Kullanıcılar", icon: "people-outline", href: "/admin/users" });
      next.push({ key: "permissions", label: "Yetkiler", icon: "key-outline", href: "/admin/manage-permissions" });
    } else if (canManagePermissions) {
      next.push({ key: "users", label: "Kullanıcılar", icon: "people-outline", href: "/manager/users" });
      next.push({ key: "permissions", label: "Yetkiler", icon: "key-outline", href: "/manager/manage-permissions" });
    }

    next.push({ key: "settings", label: "Ayarlar", icon: "settings-outline", href: "/settings" });

    if (next.length > 5) {
      return next.filter((item) => item.key !== "permissions");
    }
    return next;
  }, [user]);

  const current = activeKey || activeKeyFromPath(pathname);

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          backgroundColor: isDark ? alpha(colors.bgElev, 0.96) : alpha(colors.bgElev, 0.98),
          borderTopColor: colors.border,
        },
      ]}
    >
      {items.map((item) => {
        const active = current === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (pathname !== item.href) router.push(item.href as any);
            }}
            style={({ pressed }) => [
              styles.item,
              { opacity: pressed ? 0.72 : 1 },
            ]}
            testID={`bottom-nav-${item.key}`}
          >
            <View
              style={[
                styles.iconWrap,
                active && { backgroundColor: alpha(colors.primary, 0.18) },
              ]}
            >
              <Ionicons
                name={active ? (item.icon.replace("-outline", "") as keyof typeof Ionicons.glyphMap) : item.icon}
                size={20}
                color={active ? colors.primary : colors.textMuted}
              />
            </View>
            <Text
              style={[
                styles.label,
                { color: active ? colors.primary : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  iconWrap: {
    width: 34,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...font.tiny, fontWeight: "700", maxWidth: 74 },
});
