import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

import { api } from "@/src/api/client";
import { colors, font, formatInt, formatMoney, formatPct, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, EmptyState, Input, Row } from "@/src/ui/components";

type AnyRecord = Record<string, any>;
type YearKey = "y1" | "y2" | "y3";

const YEARS: { key: YearKey; label: string }[] = [
  { key: "y1", label: "Y1" },
  { key: "y2", label: "Y2" },
  { key: "y3", label: "Y3" },
];

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/schools");
}

function defaultYear() {
  return String(new Date().getFullYear());
}

function yearNode(data: AnyRecord | null, key: YearKey): AnyRecord {
  const node = data?.[key];
  return node && typeof node === "object" ? node : {};
}

function money(value: unknown) {
  return formatMoney(Number(value || 0), "USD");
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [academicYear, setAcademicYear] = useState(defaultYear());
  const [report, setReport] = useState<AnyRecord | null>(null);
  const [activeYear, setActiveYear] = useState<YearKey>("y1");
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const year = academicYear.trim();
    if (!year) {
      setErr("Akademik yil zorunlu.");
      return;
    }
    setLoading(true);
    setErr("");
    setMessage("");
    try {
      const payload = await api.adminGetRollup({ academicYear: year }) as AnyRecord;
      setReport(payload);
      setExpandedRegions(new Set());
    } catch (error: any) {
      setErr(error?.message || "Rapor yuklenemedi.");
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [academicYear]);

  const totals = useMemo(() => yearNode(report?.totals || null, activeYear), [report, activeYear]);
  const regions = Array.isArray(report?.regions) ? report.regions as AnyRecord[] : [];
  const missingNoApproved = Array.isArray(report?.missingNoApproved) ? report.missingNoApproved as AnyRecord[] : [];
  const missingKpis = Array.isArray(report?.missingKpis) ? report.missingKpis as AnyRecord[] : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-reports-screen">
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn} testID="admin-reports-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YONETIM</Text>
          <Text style={styles.headerTitle}>Raporlar</Text>
        </View>
        <Button label="Yukle" icon="refresh-outline" small onPress={load} loading={loading} disabled={!academicYear.trim()} />
      </View>

      <ScrollView
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
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
        {message ? <Notice icon="information-circle-outline" color={colors.primary} text={message} /> : null}

        <Card>
          <Input
            label="Akademik yil"
            value={academicYear}
            onChangeText={setAcademicYear}
            placeholder="2026 veya 2026-2027"
            autoCapitalize="none"
            testID="admin-reports-year"
          />
          <View style={styles.actionRow}>
            <Button label="Rollup Yukle" icon="analytics-outline" onPress={load} loading={loading} disabled={!academicYear.trim()} style={styles.flexBtn} />
            <Button label="XLSX Yok" icon="download-outline" variant="secondary" disabled style={styles.flexBtn} />
          </View>
          <Text style={styles.exportNote}>Rollup XLSX export backend tarafinda henuz uygulanmadi.</Text>
        </Card>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !report ? (
          <EmptyState icon="bar-chart-outline" title="Rapor yuklenmedi" subtitle="Akademik yil girip rollup raporu yukleyin." />
        ) : (
          <>
            <Card>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Genel Toplam</Text>
                  <Text style={styles.sectionSub}>{String(report.academicYear || academicYear)} rollup</Text>
                </View>
                <View style={styles.yearChips}>
                  {YEARS.map((year) => (
                    <Chip key={year.key} label={year.label} active={activeYear === year.key} onPress={() => setActiveYear(year.key)} />
                  ))}
                </View>
              </View>
              <Row label="Net Ciro" value={money(totals.net_ciro)} />
              <Row label="Net Gelir" value={money(totals.net_income)} />
              <Row label="Toplam Gider" value={money(totals.total_expenses)} />
              <Row label="Net Sonuc" value={money(totals.net_result)} color={Number(totals.net_result || 0) >= 0 ? colors.success : colors.danger} />
              <Row label="Ogrenci" value={formatInt(Number(totals.students_total || 0))} />
              <Row label="Kar Marji" value={totals.profitMargin == null ? "-" : formatPct(Number(totals.profitMargin) * 100)} />
            </Card>

            {missingNoApproved.length || missingKpis.length ? (
              <Card style={{ borderColor: "#F9731655" }}>
                <Text style={styles.sectionTitle}>Eksik Veri</Text>
                <Row label="Onayli senaryo yok" value={formatInt(missingNoApproved.length)} />
                <Row label="KPI eksik" value={formatInt(missingKpis.length)} />
              </Card>
            ) : null}

            {regions.map((region) => {
              const key = String(region.region || "Bolge");
              const expanded = expandedRegions.has(key);
              const regionYear = yearNode(region.years || null, activeYear);
              const countries = Array.isArray(region.countries) ? region.countries as AnyRecord[] : [];
              return (
                <Card key={key}>
                  <Pressable
                    onPress={() => {
                      setExpandedRegions((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                    style={styles.regionHead}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{key}</Text>
                      <Text style={styles.cardSub}>{countries.length} ulke</Text>
                    </View>
                    <Text style={styles.regionValue}>{money(regionYear.net_ciro)}</Text>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textDim} />
                  </Pressable>
                  {expanded ? (
                    <View style={{ marginTop: spacing.sm }}>
                      {countries.map((country) => {
                        const countryYear = yearNode(country.years || null, activeYear);
                        const schools = Array.isArray(country.schools) ? country.schools as AnyRecord[] : [];
                        return (
                          <View key={String(country.id || country.name)} style={styles.countryRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.countryTitle}>{country.name || "-"}</Text>
                              <Text style={styles.cardSub}>{schools.length} okul</Text>
                            </View>
                            <Text style={styles.countryValue}>{money(countryYear.net_ciro)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Notice({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={[styles.notice, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: { color: colors.textMuted, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { color: colors.text, ...font.h3, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  flexBtn: { flex: 1 },
  exportNote: { color: colors.warn, ...font.small, marginTop: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  yearChips: { flexDirection: "row", gap: spacing.sm },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  regionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  regionValue: { color: colors.primary, ...font.mono },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  countryTitle: { color: colors.text, ...font.bodyMd },
  countryValue: { color: colors.text, ...font.mono },
  cardTitle: { color: colors.text, ...font.bodyMd },
  cardSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  noticeText: { color: colors.text, ...font.small, flex: 1 },
});
