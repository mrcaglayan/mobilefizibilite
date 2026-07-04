// Schools list - main dashboard after login.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { api, School, SchoolProgressEntry } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { colors, font, radius, spacing } from "@/src/theme";
import { BottomSheet } from "@/src/ui/BottomSheet";
import { BrandMark, Button, Card, EmptyState, Input, ProgressBar } from "@/src/ui/components";
import { BulkSendSheet, CountryBatchSendSheet } from "@/src/operations/Pr08Sheets";

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

function roleLabel(role?: string) {
  switch (role) {
    case "admin":
      return "Yonetici";
    case "manager":
      return "Mudur";
    case "accountant":
      return "Muhasebeci";
    case "principal":
      return "Okul Muduru";
    case "hr":
      return "IK";
    case "user":
      return "Kullanici";
    default:
      return role || "Kullanici";
  }
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
}

function schoolProgressValue(school: School, progress?: SchoolProgressEntry) {
  const pct = Number(progress?.pct ?? school.progress ?? 0);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

function schoolProgressLabel(progress?: SchoolProgressEntry) {
  if (!progress) return "Ilerleme bekleniyor";
  if (progress.label) return progress.label;
  if (progress.state === "empty") return "Senaryo yok";
  if (progress.state === "approved") return "Tum senaryolar onayli";
  if (progress.state === "error") return "Ilerleme hesaplanamadi";
  return "Aktif senaryo ilerlemesi";
}

export default function SchoolsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [progressBySchoolId, setProgressBySchoolId] = useState<Record<string, SchoolProgressEntry>>({});
  const [staleBySchoolId, setStaleBySchoolId] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [metadataErr, setMetadataErr] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [savingSchool, setSavingSchool] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [countryBatchOpen, setCountryBatchOpen] = useState(false);

  const permissionScope = {
    countryId: user?.country_id ?? null,
    schoolId: null,
  };
  const canManageManagerUsers =
    user?.role === "manager" || can(user, "page.manage_permissions", "write", permissionScope);
  const canCreateSchool =
    Boolean(user?.country_id) && can(user, "school.create", "write", permissionScope);
  const isPrincipal = user?.role === "principal";
  const canSendCountryOps = user?.role === "manager" || user?.role === "accountant";

  const load = useCallback(async () => {
    setErr("");
    setMetadataErr("");
    try {
      const res = await api.listSchools({ fields: "all", order: "name:asc" });
      const nextSchools = res.items;
      setSchools(nextSchools);

      const ids = nextSchools.map((school) => school.id);
      if (!ids.length) {
        setProgressBySchoolId({});
        setStaleBySchoolId({});
        return;
      }

      const [progressResult, staleResult] = await Promise.allSettled([
        api.getSchoolsProgressBulk(ids),
        api.getSchoolsExpenseSplitStale(ids),
      ]);

      if (progressResult.status === "fulfilled") {
        setProgressBySchoolId(progressResult.value.progressBySchoolId || {});
      } else {
        setProgressBySchoolId({});
        setMetadataErr("Ilerleme bilgisi alinamadi.");
      }

      if (staleResult.status === "fulfilled") {
        setStaleBySchoolId(staleResult.value.staleBySchoolId || {});
      } else {
        setStaleBySchoolId({});
        setMetadataErr((prev) => prev || "Gider paylastirma durumu alinamadi.");
      }
    } catch (e: any) {
      setErr(e?.message || "Okullar yuklenemedi");
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

  async function createSchool() {
    const name = newSchoolName.trim();
    if (!name) {
      setActionErr("Okul adi zorunludur.");
      return;
    }

    setSavingSchool(true);
    setActionErr("");
    try {
      const created = await api.createSchool({ name });
      setCreateOpen(false);
      setNewSchoolName("");
      await load();
      router.push(`/school/${created.id}`);
    } catch (e: any) {
      setActionErr(e?.message || "Okul olusturulamadi.");
    } finally {
      setSavingSchool(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="schools-screen">
      <View style={styles.header}>
        <BrandMark small />
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/profile")}
            hitSlop={10}
            style={styles.iconBtn}
            testID="schools-profile-button"
          >
            <Ionicons name="person-circle-outline" size={20} color={colors.textDim} />
          </Pressable>
          <Pressable
            onPress={onLogout}
            hitSlop={10}
            style={styles.iconBtn}
            testID="schools-logout-button"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      <View style={styles.greetWrap}>
        <Text style={styles.hello}>Merhaba,</Text>
        <Text style={styles.userLine} testID="schools-user-email">
          {user?.email || "-"}
        </Text>
        <Text style={styles.roleLine}>
          {roleLabel(user?.role)}
          {user?.country_name ? ` · ${user.country_name}` : ""}
          {isPrincipal && user?.principalSchoolIds?.length
            ? ` · ${user.principalSchoolIds.length} atama`
            : ""}
        </Text>

        {user?.role === "admin" ? (
          <View style={styles.adminGrid}>
            <AdminTile
              icon="people-outline"
              title="Kullanicilar"
              subtitle="Kullanici ekle ve rol"
              onPress={() => router.push("/admin/users")}
              testID="schools-admin-users-link"
            />
            <AdminTile
              icon="earth-outline"
              title="Ulkeler"
              subtitle="Ulke ve okul yonetimi"
              onPress={() => router.push("/admin/countries")}
              testID="schools-admin-countries-link"
            />
            <AdminTile
              icon="checkmark-done-outline"
              title="Onaylar"
              subtitle="Senaryo onayi"
              onPress={() => router.push("/admin/approvals")}
              testID="schools-admin-approvals-link"
            />
          </View>
        ) : canManageManagerUsers ? (
          <View style={styles.adminGrid}>
            <AdminTile
              icon="people-outline"
              title="Kullanicilar"
              subtitle={`${user?.country_name || "Ulke"} ekipleri`}
              onPress={() => router.push("/manager/users")}
              testID="schools-manager-users-link"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Okullar</Text>
          <Text style={styles.sectionSub}>
            {isPrincipal ? "Size atanmis kampusler" : "Ulkenizdeki aktif kampusler"}
          </Text>
        </View>
        {canSendCountryOps ? (
          <View style={styles.sectionActions}>
            <Button
              label="Toplu"
              icon="paper-plane-outline"
              small
              variant="secondary"
              onPress={() => setBulkSendOpen(true)}
              disabled={!schools.length}
              testID="schools-bulk-send-button"
            />
            <Button
              label="Paket"
              icon="albums-outline"
              small
              onPress={() => setCountryBatchOpen(true)}
              disabled={!schools.length || !user?.country_id}
              testID="schools-country-batch-button"
            />
          </View>
        ) : null}
        {canCreateSchool ? (
          <Pressable
            onPress={() => {
              setActionErr("");
              setCreateOpen(true);
            }}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}
            testID="schools-create-button"
          >
            <Ionicons name="add" size={20} color={colors.primaryText} />
          </Pressable>
        ) : null}
      </View>

      {metadataErr ? (
        <View style={styles.inlineNotice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warn} />
          <Text style={styles.inlineNoticeText}>{metadataErr}</Text>
        </View>
      ) : null}

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
          title="Henuz okul tanimlanmamis"
          subtitle={isPrincipal ? "Okul atamaniz yok." : "Yeni okul ekleyebilir veya yoneticinizle iletisime gecebilirsiniz."}
        />
      ) : (
        <FlatList
          data={schools}
          keyExtractor={(s) => String(s.id)}
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
          renderItem={({ item }) => {
            const progress = progressBySchoolId[String(item.id)];
            const value = schoolProgressValue(item, progress);
            const isStale = Boolean(staleBySchoolId[String(item.id)]);
            return (
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
                    <Text style={styles.schoolName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.schoolMeta}>
                      {item.country_name || user?.country_name || "-"} · Guncelleme {formatDate(item.updated_at || item.created_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </View>

                <View style={styles.schoolProgress}>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={value} />
                  </View>
                  <Text style={styles.progressText}>{Math.round(value)}%</Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.metaPill}>
                    <Ionicons name="analytics-outline" size={13} color={colors.textDim} />
                    <Text style={styles.metaPillText}>{schoolProgressLabel(progress)}</Text>
                  </View>
                  {isStale ? (
                    <View style={[styles.metaPill, styles.stalePill]}>
                      <Ionicons name="alert-circle-outline" size={13} color={colors.warn} />
                      <Text style={[styles.metaPillText, { color: colors.warn }]}>Gider dagitimi eski</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheet
        visible={createOpen}
        onClose={() => {
          if (!savingSchool) setCreateOpen(false);
        }}
        title="Okul Ekle"
        testID="schools-create-sheet"
      >
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Input
            label="Okul adi"
            value={newSchoolName}
            onChangeText={setNewSchoolName}
            autoCapitalize="words"
            testID="schools-create-name"
          />
          {actionErr ? <Text style={styles.actionError}>{actionErr}</Text> : null}
          <Button
            label="Okul Olustur"
            icon="add-circle-outline"
            onPress={createSchool}
            loading={savingSchool}
            disabled={!newSchoolName.trim()}
            testID="schools-create-submit"
          />
        </ScrollView>
      </BottomSheet>

      <BulkSendSheet
        visible={bulkSendOpen}
        schoolIds={schools.map((school) => school.id)}
        onClose={() => setBulkSendOpen(false)}
        onApplied={load}
      />

      <CountryBatchSendSheet
        visible={countryBatchOpen}
        countryId={user?.country_id || null}
        onClose={() => setCountryBatchOpen(false)}
        onSent={load}
      />
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
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
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "#F9731644",
    borderRadius: radius.md,
    backgroundColor: "#F9731614",
  },
  inlineNoticeText: { color: colors.textDim, ...font.small, flex: 1 },
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
  cardFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stalePill: {
    borderColor: "#F9731655",
    backgroundColor: "#F9731614",
  },
  metaPillText: { color: colors.textDim, ...font.tiny, letterSpacing: 0 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  actionError: { color: colors.danger, ...font.small, marginBottom: spacing.md },
});
