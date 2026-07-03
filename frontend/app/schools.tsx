// Schools list — main dashboard after login.

import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth/AuthContext";
import { api, School } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme";
import { BrandMark, Card, EmptyState, ProgressBar } from "@/src/ui/components";

function AdminTile({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.adminTile, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.adminTileIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.adminTileTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.adminTileSub} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export default function SchoolsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await api.listSchools();
      setSchools(res.items || []);
    } catch (e: any) {
      setErr(e?.message || "Okullar yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="schools-screen">
      {/* Header */}
      <View style={styles.header}>
        <BrandMark small />
        <Pressable
          onPress={onLogout}
          hitSlop={10}
          style={styles.logoutBtn}
          testID="schools-logout-button"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      {/* Greeting */}
      <View style={styles.greetWrap}>
        <Text style={styles.hello}>Merhaba,</Text>
        <Text style={styles.userLine} testID="schools-user-email">
          {user?.email || "-"}
        </Text>
        <Text style={styles.roleLine}>
          {user?.role === "admin" ? "Yönetici" : user?.role === "manager" ? "Müdür" : "Kullanıcı"}
          {user?.country_name ? ` · ${user.country_name}` : ""}
        </Text>

        {user?.role === "admin" ? (
          <View style={styles.adminGrid}>
            <AdminTile
              icon="people-outline"
              title="Kullanıcılar"
              subtitle="Kullanıcı ekle & rol"
              onPress={() => router.push("/admin/users")}
              testID="schools-admin-users-link"
            />
            <AdminTile
              icon="earth-outline"
              title="Ülkeler"
              subtitle="Ülke & okul yönetimi"
              onPress={() => router.push("/admin/countries")}
              testID="schools-admin-countries-link"
            />
            <AdminTile
              icon="checkmark-done-outline"
              title="Onaylar"
              subtitle="Senaryo & batch onayı"
              onPress={() => router.push("/admin/approvals")}
              testID="schools-admin-approvals-link"
            />
          </View>
        ) : null}
      </View>

      {/* Section title */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Okullar</Text>
        <Text style={styles.sectionSub}>Size atanan kampüsler</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={{ padding: spacing.lg }}>
          <Card testID="schools-error">
            <Text style={{ color: colors.danger, ...font.bodyMd }}>{err}</Text>
          </Card>
        </View>
      ) : schools.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="Henüz okul tanımlanmamış"
          subtitle="Lütfen yöneticinizle iletişime geçin."
        />
      ) : (
        <FlatList
          data={schools}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.md,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`school-card-${item.id}`}
              onPress={() => router.push(`/school/${item.id}`)}
              style={({ pressed }) => [styles.schoolCard, { opacity: pressed ? 0.9 : 1 }]}
            >
              <View style={styles.schoolTop}>
                <View style={styles.schoolIcon}>
                  <Ionicons name="school-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.schoolName}>{item.name}</Text>
                  <Text style={styles.schoolMeta}>
                    {item.city || "-"} · Güncelleme{" "}
                    {new Date(item.updated_at || item.created_at).toLocaleDateString("tr-TR")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              </View>
              <View style={styles.schoolProgress}>
                <View style={{ flex: 1 }}>
                  <ProgressBar value={item.progress ?? 0} />
                </View>
                <Text style={styles.progressText}>{Math.round(item.progress ?? 0)}%</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  greetWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  hello: { color: colors.textDim, ...font.small, textTransform: "uppercase", letterSpacing: 0.6 },
  userLine: { color: colors.text, ...font.h2, marginTop: 2 },
  roleLine: { color: colors.textDim, ...font.small, marginTop: 4 },
  adminGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  adminTile: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  adminTileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  adminTileTitle: { color: colors.text, ...font.bodyMd, fontSize: 14 },
  adminTileSub: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.4 },
  adminCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  adminIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  adminTitle: { ...font.bodyMd, color: colors.text, fontSize: 15 },
  adminSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  sectionHead: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  schoolCard: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  schoolTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  schoolIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  schoolName: { ...font.bodyMd, color: colors.text, fontSize: 16 },
  schoolMeta: { color: colors.textDim, ...font.small, marginTop: 2 },
  schoolProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
  },
  progressText: { color: colors.textDim, ...font.small, minWidth: 44, textAlign: "right" },
});
