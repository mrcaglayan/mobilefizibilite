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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, School, SchoolProgressEntry } from "@/src/api/client";
import { can } from "@/src/auth/permissions";
import { useAuth } from "@/src/auth/AuthContext";
import { BulkSendSheet, CountryBatchSendSheet } from "@/src/operations/Pr08Sheets";
import { AppThemeColors, alpha, font, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BottomSheet } from "@/src/ui/BottomSheet";
import {
  Button,
  Card,
  Chip,
  EmptyStateCard,
  GradientHeroCard,
  Input,
  ProgressBar,
  QuickActionGrid,
  QuickActionTile,
  ScreenScaffold,
  SearchHeader,
  SectionHeader,
  StatusPill,
} from "@/src/ui/components";

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

function schoolProgressTone(progress: SchoolProgressEntry | undefined, value: number) {
  if (progress?.state === "error") return "revision" as const;
  if (progress?.state === "approved" || value >= 80) return "complete" as const;
  if (progress?.state === "empty" || value <= 0) return "notStarted" as const;
  if (progress?.state === "active") return "review" as const;
  return "preparing" as const;
}

function schoolLocation(school: School, fallbackCountry?: string | null) {
  const parts = [school.city, school.country_name || fallbackCountry].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Konum bilgisi yok";
}

function schoolSummary(progress?: SchoolProgressEntry) {
  const firstTooltip = Array.isArray(progress?.tooltipLines) ? progress?.tooltipLines?.[0] : "";
  if (firstTooltip) return firstTooltip;
  if (progress?.scenarioId) return `Aktif senaryo #${progress.scenarioId}`;
  return schoolProgressLabel(progress);
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
  const colors = theme.colors;
  const styles = useMemo(() => createStyles(colors), [colors]);

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
      const progress = progressBySchoolId[String(school.id)];
      if (filter === "stale" && !staleBySchoolId[String(school.id)]) return false;
      if (filter === "active" && staleBySchoolId[String(school.id)]) return false;
      if (!q) return true;
      return `${school.name || ""} ${school.city || ""} ${school.country_name || ""} ${progress?.label || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(q);
    });
  }, [filter, progressBySchoolId, schools, search, staleBySchoolId]);

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
        schools.reduce(
          (sum, school) => sum + schoolProgressValue(school, progressBySchoolId[String(school.id)]),
          0,
        ) / schools.length,
      )
    : 0;
  const staleCount = Object.values(staleBySchoolId).filter(Boolean).length;
  const visibleCount = filteredSchools.length;

  const quickActions = useMemo(
    () => [
      {
        label: "Okullar",
        subtitle: `${visibleCount} görünür`,
        icon: "school-outline" as const,
        tone: "primary" as const,
        active: filter === "all",
        onPress: () => setFilter("all"),
        testID: "schools-action-schools",
      },
      ...(user?.role === "admin"
        ? [
            {
              label: "Onaylar",
              subtitle: "Admin kuyruğu",
              icon: "checkmark-done-outline" as const,
              tone: "success" as const,
              onPress: () => router.push("/admin/approvals"),
              testID: "schools-admin-approvals-link",
            },
            {
              label: "Raporlar",
              subtitle: "Rollup",
              icon: "bar-chart-outline" as const,
              tone: "accent" as const,
              onPress: () => router.push("/admin/reports"),
              testID: "schools-admin-reports-link",
            },
            {
              label: "Kullanıcılar",
              subtitle: "Hesaplar",
              icon: "people-outline" as const,
              tone: "info" as const,
              onPress: () => router.push("/admin/users"),
              testID: "schools-admin-users-link",
            },
            {
              label: "Ülkeler",
              subtitle: "Yönetim",
              icon: "earth-outline" as const,
              tone: "primary" as const,
              onPress: () => router.push("/admin/countries"),
              testID: "schools-admin-countries-link",
            },
            {
              label: "Yetkiler",
              subtitle: "Erişim",
              icon: "key-outline" as const,
              tone: "warning" as const,
              onPress: () => router.push("/admin/manage-permissions"),
              testID: "schools-admin-permissions-link",
            },
            {
              label: "İlerleme",
              subtitle: "Kurallar",
              icon: "speedometer-outline" as const,
              tone: "success" as const,
              onPress: () => router.push("/admin/progress"),
              testID: "schools-admin-progress-link",
            },
          ]
        : []),
      ...(canOpenReviewQueue && user?.role !== "admin"
        ? [
            {
              label: "İnceleme",
              subtitle: "Kuyruk",
              icon: "checkmark-done-outline" as const,
              tone: "success" as const,
              onPress: () => router.push("/manager/review-queue"),
              testID: "schools-manager-review-link",
            },
          ]
        : []),
      ...(canSendCountryOps
        ? [
            {
              label: "Toplu Gönder",
              subtitle: "Okullar",
              icon: "paper-plane-outline" as const,
              tone: "accent" as const,
              disabled: !schools.length,
              onPress: () => setBulkSendOpen(true),
              testID: "schools-bulk-send-button",
            },
            {
              label: "Paket Gönder",
              subtitle: "Ülke",
              icon: "albums-outline" as const,
              tone: "primary" as const,
              disabled: !schools.length || !user?.country_id,
              onPress: () => setCountryBatchOpen(true),
              testID: "schools-country-batch-button",
            },
          ]
        : []),
      ...(canManageManagerUsers && user?.role !== "admin"
        ? [
            {
              label: "Kullanıcılar",
              subtitle: "Ekip",
              icon: "people-outline" as const,
              tone: "info" as const,
              onPress: () => router.push("/manager/users"),
              testID: "schools-manager-users-link",
            },
            {
              label: "Yetkiler",
              subtitle: "Erişim",
              icon: "key-outline" as const,
              tone: "warning" as const,
              onPress: () => router.push("/manager/manage-permissions"),
              testID: "schools-manager-permissions-link",
            },
          ]
        : []),
      ...(canCreateSchool
        ? [
            {
              label: "Okul Ekle",
              subtitle: "Yeni kayıt",
              icon: "add-circle-outline" as const,
              tone: "primary" as const,
              onPress: () => {
                setActionErr("");
                setCreateOpen(true);
              },
              testID: "schools-create-button",
            },
          ]
        : []),
    ],
    [
      canCreateSchool,
      canManageManagerUsers,
      canOpenReviewQueue,
      canSendCountryOps,
      filter,
      router,
      schools.length,
      user?.country_id,
      user?.role,
      visibleCount,
    ],
  );

  const logoutButton = (
    <Pressable
      onPress={onLogout}
      hitSlop={10}
      style={({ pressed }) => [
        styles.headerIconBtn,
        {
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
      testID="schools-logout-button"
    >
      <Ionicons name="log-out-outline" size={22} color={colors.primary} />
    </Pressable>
  );

  if (isPrincipal) {
    return (
      <ScreenScaffold testID="schools-screen">
        <FlatList
          data={loading || err ? [] : schools}
          keyExtractor={(school) => String(school.id)}
          keyboardShouldPersistTaps="handled"
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
          ListHeaderComponent={
            metadataErr || loading || err ? (
              <View style={styles.principalListHead}>
              {metadataErr ? (
                <Card style={styles.inlineNotice}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.warn} />
                  <Text style={styles.inlineNoticeText}>{metadataErr}</Text>
                </Card>
              ) : null}

              {loading ? <LoadingCard /> : null}

              {err ? (
                <EmptyStateCard
                  icon="alert-circle-outline"
                  title="Okullar yüklenemedi"
                  subtitle={err}
                  actionLabel="Tekrar dene"
                  onActionPress={load}
                  testID="schools-error"
                />
              ) : null}
            </View>
            ) : null
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + 32,
            gap: spacing.md,
          }}
          ListEmptyComponent={
            loading || err ? null : (
              <EmptyStateCard
                icon="school-outline"
                title="Okul atamanız yok"
                subtitle="Size atanmış okul bulunmuyor."
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
                progress={progress}
                value={value}
                isStale={isStale}
                countryName={user?.country_name || null}
                onPress={() => router.push(`/school/${item.id}`)}
              />
            );
          }}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold testID="schools-screen">
      <SearchHeader
        value={search}
        onChangeText={setSearch}
        placeholder="Okul, senaryo veya işlem arayın"
        onProfilePress={() => router.push("/profile")}
        right={logoutButton}
        inputProps={{ testID: "schools-search" }}
        testID="schools-search-header"
      />

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
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.contentHead}>
            <View style={styles.welcomeBlock}>
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

            <GradientHeroCard
              icon="analytics-outline"
              eyebrow={isPrincipal ? "Okullarım" : "Genel Durum"}
              title={schools.length ? `${schools.length} okul takipte` : "Okul verisi bekleniyor"}
              subtitle={
                isPrincipal
                  ? "Size atanan okulların senaryo durumlarını buradan takip edin."
                  : "Okulların senaryo ilerlemesini, uyarılarını ve aksiyonlarını tek ekrandan yönetin."
              }
              metricValue={`${progressAverage}%`}
              metricLabel="ortalama ilerleme"
              progress={progressAverage}
              actionLabel={staleCount ? "Uyarıları göster" : undefined}
              onAction={staleCount ? () => setFilter("stale") : undefined}
              footer={
                <Text style={styles.heroFooterText} numberOfLines={2}>
                  {staleCount
                    ? `${staleCount} okul gider dağıtımı güncellemesi bekliyor.`
                    : schools.length
                      ? "Gider dağıtımı uyarısı görünmüyor."
                      : "Okul listesi yüklendiğinde özet burada güncellenir."}
                </Text>
              }
              testID="schools-hero-card"
            />

            <View style={styles.statsRow}>
              <DashboardStat icon="school-outline" label="Toplam" value={String(schools.length)} />
              <DashboardStat icon="eye-outline" label="Görünen" value={String(visibleCount)} />
              <DashboardStat icon="alert-circle-outline" label="Uyarı" value={String(staleCount)} tone="warning" />
            </View>

            {quickActions.length ? (
              <View style={styles.sectionBlock}>
                <SectionHeader title="Hızlı İşlemler" subtitle="Yetkinize göre kullanılabilir aksiyonlar" />
                <QuickActionGrid columns={2}>
                  {quickActions.map((action) => (
                    <QuickActionTile key={action.testID} {...action} />
                  ))}
                </QuickActionGrid>
              </View>
            ) : null}

            <View style={styles.sectionBlock}>
              <SectionHeader
                title="Okullarım"
                subtitle={isPrincipal ? "Size atanmış kampüsler" : "Senaryo listesine okul üzerinden geçin"}
                right={<StatusPill label={`${visibleCount}/${schools.length}`} tone="primary" showDot={false} />}
              />
              <View style={styles.filterRow}>
                <Chip label="Tümü" active={filter === "all"} onPress={() => setFilter("all")} />
                <Chip label="Aktif" active={filter === "active"} onPress={() => setFilter("active")} />
                <Chip label="Uyarılı" active={filter === "stale"} onPress={() => setFilter("stale")} />
              </View>
            </View>

            {metadataErr ? (
              <Card style={styles.inlineNotice}>
                <Ionicons name="information-circle-outline" size={18} color={colors.warn} />
                <Text style={styles.inlineNoticeText}>{metadataErr}</Text>
              </Card>
            ) : null}

            {loading ? <LoadingCard /> : null}

            {err ? (
              <EmptyStateCard
                icon="alert-circle-outline"
                title="Okullar yüklenemedi"
                subtitle={err}
                actionLabel="Tekrar dene"
                onActionPress={load}
                testID="schools-error"
              />
            ) : null}
          </View>
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + 120,
          gap: spacing.md,
        }}
        ListEmptyComponent={
          loading || err ? null : (
            <EmptyStateCard
              icon="school-outline"
              title={search || filter !== "all" ? "Okul bulunamadı" : "Henüz okul tanımlanmamış"}
              subtitle={
                isPrincipal
                  ? "Okul atamanız yok."
                  : "Filtreyi değiştirin veya okul tanımı için yöneticinizle iletişime geçin."
              }
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
              progress={progress}
              value={value}
              isStale={isStale}
              countryName={user?.country_name || null}
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

function DashboardStat({
  icon,
  label,
  value,
  tone = "primary",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "primary" | "warning";
}) {
  const { colors } = useAppTheme();
  const accent = tone === "warning" ? colors.warn : colors.primary;
  return (
    <Card style={stylesForStat.card}>
      <View style={[stylesForStat.icon, { backgroundColor: alpha(accent, 0.12) }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[stylesForStat.label, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[stylesForStat.value, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

function LoadingCard() {
  const { colors } = useAppTheme();
  return (
    <Card style={stylesForStat.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[stylesForStat.loadingText, { color: colors.textDim }]}>Okullar yükleniyor...</Text>
    </Card>
  );
}

function SchoolCard({
  school,
  progress,
  value,
  isStale,
  countryName,
  onPress,
}: {
  school: School;
  progress?: SchoolProgressEntry;
  value: number;
  isStale: boolean;
  countryName?: string | null;
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const progressTone = schoolProgressTone(progress, value);
  const statusLabel = isStale ? "Uyarı var" : schoolProgressLabel(progress);
  const actionLabel = value >= 100 ? "Aç" : "Devam et";
  const summary = isStale
    ? "Gider dağıtımı güncellemesi bekliyor."
    : schoolSummary(progress);

  return (
    <Pressable
      testID={`school-card-${school.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        stylesForSchool.card,
        {
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        !isDark && shadow.card,
      ]}
    >
      <View style={stylesForSchool.topRow}>
        <View style={stylesForSchool.titleWrap}>
          <Text style={[stylesForSchool.title, { color: colors.text }]} numberOfLines={2}>
            {school.name}
          </Text>
          <Text style={[stylesForSchool.meta, { color: colors.textDim }]} numberOfLines={1}>
            {schoolLocation(school, countryName)}
          </Text>
        </View>
        <StatusPill
          label={statusLabel}
          tone={isStale ? "revision" : progressTone}
          icon={isStale ? "alert-circle-outline" : undefined}
          showDot={!isStale}
          style={stylesForSchool.statusPill}
        />
      </View>

      <View style={stylesForSchool.progressRow}>
        <View style={stylesForSchool.progressTrack}>
          <ProgressBar value={value} height={9} />
        </View>
        <Text style={[stylesForSchool.percent, { color: colors.text }]}>{Math.round(value)}%</Text>
      </View>

      <View style={[stylesForSchool.footerRow, { borderTopColor: colors.border }]}>
        <Text style={[stylesForSchool.summary, { color: colors.textDim }]} numberOfLines={2}>
          {summary}
        </Text>
        <View style={[stylesForSchool.cta, { backgroundColor: value >= 100 ? colors.bgElev2 : colors.primary, borderColor: value >= 100 ? colors.borderStrong : colors.primary }]}>
          <Text style={[stylesForSchool.ctaText, { color: value >= 100 ? colors.primary : colors.primaryText }]}>
            {actionLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const stylesForStat = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 76,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...font.tiny },
  value: { ...font.h3, marginTop: 1 },
  loading: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: { ...font.small },
});

const stylesForSchool = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { ...font.h3, fontSize: 17, letterSpacing: -0.2 },
  meta: { ...font.small, marginTop: 4 },
  statusPill: { maxWidth: 132 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressTrack: { flex: 1, minWidth: 0 },
  percent: { ...font.small, width: 42, flexShrink: 0, textAlign: "right", fontWeight: "900" },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  summary: { ...font.small, flex: 1, lineHeight: 18 },
  cta: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { ...font.small, fontWeight: "900" },
});


function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    headerIconBtn: {
      width: 46,
      height: 46,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
      ...shadow.soft,
    },
    contentHead: { paddingTop: spacing.md, gap: spacing.lg },
    principalListHead: { gap: spacing.md },
    welcomeBlock: { gap: 2 },
    hello: { color: colors.textDim, ...font.small },
    userLine: { color: colors.text, ...font.h2, marginTop: 2 },
    roleLine: { color: colors.textDim, ...font.small, marginTop: 4 },
    heroFooterText: { color: "rgba(255,255,255,0.86)", ...font.small, lineHeight: 18 },
    statsRow: { flexDirection: "row", gap: spacing.sm },
    sectionBlock: { gap: spacing.sm },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    inlineNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: alpha(colors.warn, 0.1),
      borderColor: alpha(colors.warn, 0.28),
    },
    inlineNoticeText: { color: colors.textDim, ...font.small, flex: 1 },
    sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
    actionError: { color: colors.danger, ...font.small, marginBottom: spacing.md },
  });
}
