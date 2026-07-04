import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { api, School, SchoolProgressEntry } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { AppThemeColors, alpha, font, radius, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BulkSendSheet, CountryBatchSendSheet } from "@/src/operations/Pr08Sheets";
import { AppBottomNav } from "@/src/ui/AppBottomNav";
import {
  BrandMark,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ProgressBar,
  ScreenScaffold,
  SearchBar,
  StatusBadge,
} from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";

type SchoolFilter = "all" | "active" | "stale";

function roleLabel(role?: string) {
  switch (role) {
    case "admin":
      return "Yönetici";
    case "manager":
      return "Müdür";
    case "accountant":
      return "Muhasebeci";
    case "principal":
      return "Okul Müdürü";
    case "hr":
      return "İK";
    case "user":
      return "Kullanıcı";
    default:
      return role || "Kullanıcı";
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
  if (!progress) return "İlerleme bekleniyor";
  if (progress.label) return progress.label;
  if (progress.state === "empty") return "Senaryo yok";
  if (progress.state === "approved") return "Tamamlandı";
  if (progress.state === "error") return "İlerleme hesaplanamadı";
  return "Hazırlanıyor";
}

function friendlyError(error: any, fallback: string) {
  const message = String(error?.message || "");
  if (!message || /invalid limit/i.test(message)) return fallback;
  return message;
}

export default function SchoolsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  const [schools, setSchools] = useState<School[]>([]);
  const [progressBySchoolId, setProgressBySchoolId] = useState<Record<string, SchoolProgressEntry>>({});
  const [staleBySchoolId, setStaleBySchoolId] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [metadataErr, setMetadataErr] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SchoolFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [savingSchool, setSavingSchool] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [countryBatchOpen, setCountryBatchOpen] = useState(false);

  const permissionScope = { countryId: user?.country_id ?? null, schoolId: null };
  const canManageManagerUsers = can(user, "page.manage_permissions", "write", permissionScope);
  const canOpenReviewQueue =
    user?.role === "manager" ||
    user?.role === "accountant" ||
    can(user, "page.manage_permissions", "read", permissionScope) ||
    canManageManagerUsers;
  const canCreateSchool = Boolean(user?.country_id) && can(user, "school.create", "write", permissionScope);
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
        setMetadataErr("İlerleme bilgisi alınamadı.");
      }

      if (staleResult.status === "fulfilled") {
        setStaleBySchoolId(staleResult.value.staleBySchoolId || {});
      } else {
        setStaleBySchoolId({});
        setMetadataErr((prev) => prev || "Gider dağıtımı durumu alınamadı.");
      }
    } catch (error: any) {
      setErr(friendlyError(error, "Okullar yüklenemedi. Lütfen tekrar deneyin."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSchools = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return schools.filter((school) => {
      if (filter === "stale" && !staleBySchoolId[String(school.id)]) return false;
      if (filter === "active" && staleBySchoolId[String(school.id)]) return false;
      if (!q) return true;
      return `${school.name || ""} ${school.country_name || ""}`.toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [filter, schools, search, staleBySchoolId]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  async function createSchool() {
    const name = newSchoolName.trim();
    if (!name) {
      setActionErr("Okul adı zorunludur.");
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
    } catch (error: any) {
      setActionErr(friendlyError(error, "Okul oluşturulamadı."));
    } finally {
      setSavingSchool(false);
    }
  }

  const progressAverage = schools.length
    ? Math.round(
      schools.reduce((sum, school) => sum + schoolProgressValue(school, progressBySchoolId[String(school.id)]), 0) /
      schools.length,
    )
    : 0;
  const staleCount = Object.values(staleBySchoolId).filter(Boolean).length;

  return (
    <ScreenScaffold bottomNav={<AppBottomNav activeKey="schools" />} testID="schools-screen">
      <View style={styles.header}>
        <BrandMark small />
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/profile")}
            hitSlop={10}
            style={styles.iconBtn}
            testID="schools-profile-button"
          >
            <Ionicons name="person-circle-outline" size={21} color={theme.colors.textDim} />
          </Pressable>
          <Pressable
            onPress={onLogout}
            hitSlop={10}
            style={styles.iconBtn}
            testID="schools-logout-button"
          >
            <Ionicons name="log-out-outline" size={19} color={theme.colors.textDim} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={loading || err ? [] : filteredSchools}
        keyExtractor={(school) => String(school.id)}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.contentHead}>
            <View>
              <Text style={styles.hello}>Merhaba,</Text>
              <Text style={styles.userLine} testID="schools-user-email" numberOfLines={1}>
                {user?.email || "-"}
              </Text>
              <Text style={styles.roleLine} numberOfLines={1}>
                {roleLabel(user?.role)}
                {user?.country_name ? ` • ${user.country_name}` : ""}
                {isPrincipal && user?.principalSchoolIds?.length ? ` • ${user.principalSchoolIds.length} atama` : ""}
              </Text>
            </View>

            <View style={styles.kpiRow}>
              <MiniKpi icon="school-outline" label="Okul" value={String(schools.length)} />
              <MiniKpi icon="trending-up-outline" label="Ortalama" value={`${progressAverage}%`} />
              <MiniKpi icon="alert-circle-outline" label="Uyarı" value={String(staleCount)} />
            </View>

            <QuickActions
              role={user?.role}
              canManageManagerUsers={canManageManagerUsers}
              canOpenReviewQueue={canOpenReviewQueue}
              onOpen={(route) => router.push(route as any)}
            />

            <View style={styles.schoolTools}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Okullar</Text>
                <Text style={styles.sectionSub}>
                  {isPrincipal ? "Size atanmış kampüsler" : "Senaryo listesine okul üzerinden geçin"}
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
                  <Ionicons name="add" size={21} color={theme.colors.primaryText} />
                </Pressable>
              ) : null}
            </View>

            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Okul ara..."
              testID="schools-search"
            />
            <View style={styles.filterRow}>
              <Chip label="Tümü" active={filter === "all"} onPress={() => setFilter("all")} />
              <Chip label="Aktif" active={filter === "active"} onPress={() => setFilter("active")} />
              <Chip label="Gider uyarısı" active={filter === "stale"} onPress={() => setFilter("stale")} />
            </View>

            {metadataErr ? (
              <View style={styles.inlineNotice}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.warn} />
                <Text style={styles.inlineNoticeText}>{metadataErr}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : err ? (
              <Card testID="schools-error">
                <Text style={styles.errorText}>{err}</Text>
              </Card>
            ) : null}
          </View>
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + 106,
          gap: spacing.md,
        }}
        ListEmptyComponent={
          loading || err ? null : (
            <EmptyState
              icon="school-outline"
              title={search || filter !== "all" ? "Okul bulunamadı" : "Henüz okul tanımlanmamış"}
              subtitle={isPrincipal ? "Okul atamanız yok." : "Filtreyi değiştirin veya yöneticinizle iletişime geçin."}
            />
          )
        }
        renderItem={({ item }) => {
          const progress = progressBySchoolId[String(item.id)];
          const value = schoolProgressValue(item, progress);
          const isStale = Boolean(staleBySchoolId[String(item.id)]);
          return (
            <SchoolCard
              school={item}
              value={value}
              label={schoolProgressLabel(progress)}
              isStale={isStale}
              countryName={item.country_name || user?.country_name || "-"}
              onPress={() => router.push(`/school/${item.id}`)}
            />
          );
        }}
      />

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
            label="Okul adı"
            value={newSchoolName}
            onChangeText={setNewSchoolName}
            autoCapitalize="words"
            testID="schools-create-name"
          />
          {actionErr ? <Text style={styles.actionError}>{actionErr}</Text> : null}
          <Button
            label="Okul Oluştur"
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
    </ScreenScaffold>
  );
}

function MiniKpi({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={{ flex: 1, padding: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name={icon} size={17} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textMuted, ...font.tiny }}>{label}</Text>
          <Text style={{ color: colors.text, ...font.bodyMd }}>{value}</Text>
        </View>
      </View>
    </Card>
  );
}

function QuickActions({
  role,
  canManageManagerUsers,
  canOpenReviewQueue,
  onOpen,
}: {
  role?: string;
  canManageManagerUsers: boolean;
  canOpenReviewQueue: boolean;
  onOpen: (route: string) => void;
}) {
  const actions =
    role === "admin"
      ? [
        { icon: "people-outline" as const, title: "Kullanıcılar", route: "/admin/users", testID: "schools-admin-users-link" },
        { icon: "earth-outline" as const, title: "Ülkeler", route: "/admin/countries", testID: "schools-admin-countries-link" },
        { icon: "key-outline" as const, title: "Yetkiler", route: "/admin/manage-permissions", testID: "schools-admin-permissions-link" },
        { icon: "checkmark-done-outline" as const, title: "Onaylar", route: "/admin/approvals", testID: "schools-admin-approvals-link" },
        { icon: "speedometer-outline" as const, title: "İlerleme", route: "/admin/progress", testID: "schools-admin-progress-link" },
        { icon: "bar-chart-outline" as const, title: "Raporlar", route: "/admin/reports", testID: "schools-admin-reports-link" },
      ]
      : [
        ...(canManageManagerUsers
          ? [
            { icon: "people-outline" as const, title: "Kullanıcılar", route: "/manager/users", testID: "schools-manager-users-link" },
            { icon: "key-outline" as const, title: "Yetkiler", route: "/manager/manage-permissions", testID: "schools-manager-permissions-link" },
          ]
          : []),
        ...(canOpenReviewQueue
          ? [{ icon: "checkmark-done-outline" as const, title: "İnceleme", route: "/manager/review-queue", testID: "schools-manager-review-link" }]
          : []),
      ];

  if (!actions.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {actions.map((action) => (
        <ActionTile
          key={action.route}
          icon={action.icon}
          title={action.title}
          testID={action.testID}
          onPress={() => onOpen(action.route)}
        />
      ))}
    </View>
  );
}

function ActionTile({
  icon,
  title,
  testID,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  testID?: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 52,
          flexGrow: 1,
          flexBasis: "30%",
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: colors.bgElev,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.sm,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: alpha(colors.primary, 0.14),
        }}
      >
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={{ color: colors.text, ...font.small, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

function SchoolCard({
  school,
  value,
  label,
  isStale,
  countryName,
  onPress,
}: {
  school: School;
  value: number;
  label: string;
  isStale: boolean;
  countryName: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      testID={`school-card-${school.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.bgElev,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.md,
            backgroundColor: alpha(colors.primary, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="business-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, ...font.bodyMd, fontSize: 16 }} numberOfLines={2}>
            {school.name}
          </Text>
          <Text style={{ color: colors.textDim, ...font.small, marginTop: 2 }} numberOfLines={1}>
            {countryName} • Güncelleme {formatDate(school.updated_at || school.created_at)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={value} />
        </View>
        <Text style={{ color: colors.textDim, ...font.small, minWidth: 42, textAlign: "right" }}>
          {Math.round(value)}%
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
        <StatusBadge
          label={label}
          tone={value >= 80 ? "complete" : value > 0 ? "preparing" : "notStarted"}
        />
        {isStale ? <StatusBadge label="Gider dağıtımı eski" tone="revision" /> : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.bgElev,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    contentHead: { paddingTop: spacing.lg, gap: spacing.md },
    hello: { color: colors.textDim, ...font.small },
    userLine: { color: colors.text, ...font.h2, marginTop: 2 },
    roleLine: { color: colors.textDim, ...font.small, marginTop: 4 },
    kpiRow: { flexDirection: "row", gap: spacing.sm },
    schoolTools: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    sectionActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sectionTitle: { color: colors.text, ...font.h3 },
    sectionSub: { color: colors.textDim, ...font.small, marginTop: 2 },
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    inlineNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: alpha(colors.warn, 0.32),
      borderRadius: radius.md,
      backgroundColor: alpha(colors.warn, 0.1),
    },
    inlineNoticeText: { color: colors.textDim, ...font.small, flex: 1 },
    loadingBlock: { padding: spacing.xl, alignItems: "center", justifyContent: "center" },
    errorText: { color: colors.danger, ...font.bodyMd },
    sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
    actionError: { color: colors.danger, ...font.small, marginBottom: spacing.md },
  });
}
