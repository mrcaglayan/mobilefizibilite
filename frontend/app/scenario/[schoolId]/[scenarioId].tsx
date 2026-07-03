// Scenario editor — 6 tabs (Temel Bilgiler, Kapasite, İK, Gelirler, Giderler, Rapor).
// Tabs are chip-based sticky header. Each editor is a mobile-friendly form.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api, Inputs, Report } from "@/src/api/client";
import { colors, font, formatInt, formatMoney, formatPct, radius, spacing } from "@/src/theme";
import { Card, Chip, NumberField, Row, Button, Input } from "@/src/ui/components";

const TABS = [
  { key: "temelBilgiler", label: "Temel Bilgiler", icon: "document-text-outline" as const },
  { key: "kapasite", label: "Kapasite", icon: "layers-outline" as const },
  { key: "ik", label: "İK", icon: "people-outline" as const },
  { key: "gelirler", label: "Gelirler", icon: "trending-up-outline" as const },
  { key: "giderler", label: "Giderler", icon: "trending-down-outline" as const },
  { key: "rapor", label: "Rapor", icon: "pie-chart-outline" as const },
];

const KADEMELER = [
  { key: "anaokulu", label: "Anaokulu" },
  { key: "ilkokul", label: "İlkokul" },
  { key: "ortaokul", label: "Ortaokul" },
  { key: "lise", label: "Lise" },
];

export default function ScenarioScreen() {
  const { schoolId, scenarioId } = useLocalSearchParams<{ schoolId: string; scenarioId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("temelBilgiler");
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const [initial, setInitial] = useState<Inputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const dirty = useMemo(
    () => inputs && initial && JSON.stringify(inputs) !== JSON.stringify(initial),
    [inputs, initial],
  );

  const load = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    setErr("");
    try {
      const res = await api.getInputs(schoolId, scenarioId);
      setInputs(res.inputs);
      setInitial(res.inputs);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [schoolId, scenarioId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadReport = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    setReportLoading(true);
    try {
      const r = await api.getReport(schoolId, scenarioId);
      setReport(r);
    } catch (e: any) {
      setErr(e?.message || "Rapor alınamadı");
    } finally {
      setReportLoading(false);
    }
  }, [schoolId, scenarioId]);

  useEffect(() => {
    if (activeTab === "rapor") loadReport();
  }, [activeTab, loadReport]);

  function setSection(section: string, updater: (prev: any) => any) {
    setInputs((prev) => {
      if (!prev) return prev;
      return { ...prev, [section]: updater(prev[section] || {}) };
    });
  }

  async function save() {
    if (!inputs || !schoolId || !scenarioId) return;
    setSaving(true);
    setErr("");
    try {
      await api.saveInputs(schoolId, scenarioId, inputs);
      setInitial(inputs);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Kaydedildi");
      if (activeTab === "rapor") await loadReport();
    } catch (e: any) {
      setErr(e?.message || "Kayıt başarısız");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const currency = inputs?.temelBilgiler?.kur || "TRY";

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="scenario-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            testID="scenario-back-button"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>SENARYO</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {inputs?.temelBilgiler?.okulAdi || "Senaryo"}
            </Text>
          </View>
          <Button
            testID="scenario-save-button"
            label={dirty ? "Kaydet" : "Kayıtlı"}
            onPress={save}
            small
            loading={saving}
            disabled={!dirty}
            icon={dirty ? "save-outline" : "checkmark"}
            variant={dirty ? "primary" : "secondary"}
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
          >
            {TABS.map((t) => (
              <Chip
                key={t.key}
                label={t.label}
                active={activeTab === t.key}
                onPress={() => setActiveTab(t.key)}
                testID={`tab-${t.key}`}
              />
            ))}
          </ScrollView>
        </View>

        {err ? (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
            <View style={styles.errBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errText}>{err}</Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {activeTab === "temelBilgiler" && (
            <TemelBilgilerTab
              value={inputs?.temelBilgiler || {}}
              onChange={(u) => setSection("temelBilgiler", (p) => ({ ...p, ...u }))}
            />
          )}
          {activeTab === "kapasite" && (
            <KapasiteTab
              value={inputs?.kapasite || {}}
              onChange={(u) => setSection("kapasite", (p) => ({ ...p, ...u }))}
            />
          )}
          {activeTab === "ik" && (
            <IKTab
              value={inputs?.ik || {}}
              currency={currency}
              onChange={(u) => setSection("ik", (p) => ({ ...p, ...u }))}
            />
          )}
          {activeTab === "gelirler" && (
            <GelirlerTab
              value={inputs?.gelirler || {}}
              currency={currency}
              onChange={(u) => setSection("gelirler", (p) => ({ ...p, ...u }))}
            />
          )}
          {activeTab === "giderler" && (
            <GiderlerTab
              value={inputs?.giderler || {}}
              currency={currency}
              onChange={(u) => setSection("giderler", (p) => ({ ...p, ...u }))}
            />
          )}
          {activeTab === "rapor" && (
            <RaporTab report={report} loading={reportLoading} dirty={!!dirty} onReload={loadReport} />
          )}
        </ScrollView>

        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 20 }]} testID="scenario-toast">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ------------------- TABS -------------------

function SectionCard({ title, subtitle, children }: any) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      <View style={{ height: spacing.md }} />
      {children}
    </Card>
  );
}

function TemelBilgilerTab({ value, onChange }: { value: any; onChange: (u: any) => void }) {
  const kademeler: string[] = Array.isArray(value.kademeler) ? value.kademeler : [];

  function toggleKademe(k: string) {
    const next = kademeler.includes(k) ? kademeler.filter((x) => x !== k) : [...kademeler, k];
    onChange({ kademeler: next });
  }

  const currencies = ["TRY", "USD", "EUR"];

  return (
    <>
      <SectionCard title="Okul Bilgileri" subtitle="Senaryonun temel tanımları">
        <Input
          label="Okul Adı"
          value={value.okulAdi || ""}
          onChangeText={(t) => onChange({ okulAdi: t })}
          testID="tb-okul-adi"
        />
        <Input
          label="Kampüs"
          value={value.kampus || ""}
          onChangeText={(t) => onChange({ kampus: t })}
          testID="tb-kampus"
        />
        <Input
          label="Şehir"
          value={value.sehir || ""}
          onChangeText={(t) => onChange({ sehir: t })}
          testID="tb-sehir"
        />
      </SectionCard>

      <SectionCard title="Kademeler" subtitle="Bu senaryoda işletilen kademeler">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {KADEMELER.map((k) => (
            <Chip
              key={k.key}
              label={k.label}
              active={kademeler.includes(k.key)}
              onPress={() => toggleKademe(k.key)}
              testID={`tb-kademe-${k.key}`}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Planlama" subtitle="Yıllık planlama ve para birimi">
        <NumberField
          label="Başlangıç Yılı"
          value={value.baslangicYili}
          onChange={(n) => onChange({ baslangicYili: n })}
          testID="tb-baslangic"
        />
        <NumberField
          label="Planlama Yılı Sayısı"
          value={value.planlamaYili}
          onChange={(n) => onChange({ planlamaYili: n })}
          unit="yıl"
          testID="tb-planlama"
        />
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.tinyLabel}>PARA BİRİMİ</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {currencies.map((c) => (
              <Chip
                key={c}
                label={c}
                active={value.kur === c}
                onPress={() => onChange({ kur: c })}
                testID={`tb-currency-${c}`}
              />
            ))}
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Notlar" subtitle="İsteğe bağlı açıklama">
        <Input
          value={value.notlar || ""}
          onChangeText={(t) => onChange({ notlar: t })}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" }}
          placeholder="Senaryo notları..."
          testID="tb-notlar"
        />
      </SectionCard>
    </>
  );
}

function KapasiteTab({ value, onChange }: { value: any; onChange: (u: any) => void }) {
  const kapasite = Number(value.toplamKapasite || 0);
  const doluluk = Number(value.hedefDoluluk || 0);
  const aktif = Math.round(kapasite * (doluluk / 100));

  return (
    <>
      <SectionCard title="Toplam Kapasite" subtitle="Fiziksel öğrenci kapasitesi">
        <NumberField
          label="Toplam Kapasite"
          value={value.toplamKapasite}
          onChange={(n) => onChange({ toplamKapasite: n })}
          unit="öğrenci"
          testID="kap-toplam"
        />
        <NumberField
          label="Sınıf Sayısı"
          value={value.siniflarSayisi}
          onChange={(n) => onChange({ siniflarSayisi: n })}
          unit="sınıf"
          testID="kap-sinif"
        />
        <NumberField
          label="Sınıf Başına Öğrenci"
          value={value.sinifBasinaOgrenci}
          onChange={(n) => onChange({ sinifBasinaOgrenci: n })}
          unit="kişi"
          testID="kap-sinif-ogrenci"
        />
        <NumberField
          label="Hedef Doluluk"
          value={value.hedefDoluluk}
          onChange={(n) => onChange({ hedefDoluluk: n })}
          unit="%"
          testID="kap-doluluk"
        />
      </SectionCard>

      <SectionCard title="Tahmini Doluluk" subtitle="Girilen değerlerden hesaplanır">
        <Row label="Aktif öğrenci (tahmini)" value={formatInt(aktif)} strong color={colors.primary} />
        <Row label="Boş kontenjan" value={formatInt(kapasite - aktif)} />
      </SectionCard>
    </>
  );
}

function IKTab({ value, currency, onChange }: any) {
  const totalStaff =
    Number(value.ogretmenSayisi || 0) +
    Number(value.idariPersonel || 0) +
    Number(value.destekPersonel || 0);
  const monthlyCost = totalStaff * Number(value.ortalamaMaas || 0);
  const yearlyCost = monthlyCost * 12;

  return (
    <>
      <SectionCard title="Personel Sayıları" subtitle="Öğretmen ve idari kadro">
        <NumberField
          label="Öğretmen Sayısı"
          value={value.ogretmenSayisi}
          onChange={(n) => onChange({ ogretmenSayisi: n })}
          unit="kişi"
          testID="ik-ogretmen"
        />
        <NumberField
          label="İdari Personel"
          value={value.idariPersonel}
          onChange={(n) => onChange({ idariPersonel: n })}
          unit="kişi"
          testID="ik-idari"
        />
        <NumberField
          label="Destek Personel"
          value={value.destekPersonel}
          onChange={(n) => onChange({ destekPersonel: n })}
          unit="kişi"
          testID="ik-destek"
        />
      </SectionCard>

      <SectionCard title="Maaş" subtitle="Ortalama ve yıllık artış">
        <NumberField
          label="Ortalama Aylık Maaş"
          value={value.ortalamaMaas}
          onChange={(n) => onChange({ ortalamaMaas: n })}
          unit={currency}
          testID="ik-maas"
        />
        <NumberField
          label="Yıllık Maaş Artışı"
          value={value.yillikArtis}
          onChange={(n) => onChange({ yillikArtis: n })}
          unit="%"
          testID="ik-artis"
        />
      </SectionCard>

      <SectionCard title="Toplam Maliyet" subtitle="Girdilerden otomatik hesaplanır">
        <Row label="Toplam personel" value={formatInt(totalStaff) + " kişi"} />
        <Row label="Aylık maaş yükü" value={formatMoney(monthlyCost, currency)} />
        <Row label="Yıllık maaş yükü" value={formatMoney(yearlyCost, currency)} strong color={colors.primary} />
      </SectionCard>
    </>
  );
}

function GelirlerTab({ value, currency, onChange }: any) {
  return (
    <>
      <SectionCard title="Öğrenim Ücreti" subtitle="Öğrenci başına yıllık ücret">
        <NumberField
          label="Yıllık Öğrenim Ücreti"
          value={value.yillikUcret}
          onChange={(n) => onChange({ yillikUcret: n })}
          unit={currency}
          testID="gel-yillik"
        />
        <NumberField
          label="Kayıt Ücreti"
          value={value.kayitUcreti}
          onChange={(n) => onChange({ kayitUcreti: n })}
          unit={currency}
          testID="gel-kayit"
        />
      </SectionCard>

      <SectionCard title="İndirim & Ek Gelir">
        <NumberField
          label="Genel İndirim Oranı"
          value={value.indirimOrani}
          onChange={(n) => onChange({ indirimOrani: n })}
          unit="%"
          testID="gel-indirim"
        />
        <NumberField
          label="Ek Gelirler (yıllık)"
          value={value.ekGelirler}
          onChange={(n) => onChange({ ekGelirler: n })}
          unit={currency}
          testID="gel-ek"
        />
      </SectionCard>
    </>
  );
}

function GiderlerTab({ value, currency, onChange }: any) {
  const total =
    Number(value.personel || 0) +
    Number(value.kira || 0) +
    Number(value.islektme || 0) +
    Number(value.yatirim || 0) +
    Number(value.digerGiderler || 0);
  return (
    <>
      <SectionCard title="Faaliyet Giderleri" subtitle="Yıllık gider kalemleri">
        <NumberField
          label="Personel"
          value={value.personel}
          onChange={(n) => onChange({ personel: n })}
          unit={currency}
          testID="gid-personel"
        />
        <NumberField
          label="Kira"
          value={value.kira}
          onChange={(n) => onChange({ kira: n })}
          unit={currency}
          testID="gid-kira"
        />
        <NumberField
          label="İşletme Giderleri"
          value={value.islektme}
          onChange={(n) => onChange({ islektme: n })}
          unit={currency}
          testID="gid-isletme"
        />
        <NumberField
          label="Yatırım Giderleri"
          value={value.yatirim}
          onChange={(n) => onChange({ yatirim: n })}
          unit={currency}
          testID="gid-yatirim"
        />
        <NumberField
          label="Diğer Giderler"
          value={value.digerGiderler}
          onChange={(n) => onChange({ digerGiderler: n })}
          unit={currency}
          testID="gid-diger"
        />
      </SectionCard>

      <SectionCard title="Toplam Gider">
        <Row
          label="Toplam yıllık gider"
          value={formatMoney(total, currency)}
          strong
          color={colors.warn}
        />
      </SectionCard>
    </>
  );
}

function RaporTab({
  report,
  loading,
  dirty,
  onReload,
}: {
  report: Report | null;
  loading: boolean;
  dirty: boolean;
  onReload: () => void;
}) {
  if (loading || !report) {
    return (
      <Card>
        <View style={{ padding: spacing.lg, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textDim, marginTop: 10 }}>Rapor hesaplanıyor...</Text>
        </View>
      </Card>
    );
  }
  const cur = report.currency || "TRY";
  const k = report.kpis;
  return (
    <>
      {dirty ? (
        <View style={styles.dirtyBanner} testID="rapor-dirty-banner">
          <Ionicons name="alert-circle-outline" size={18} color={colors.warn} />
          <Text style={styles.dirtyText}>Kaydedilmemiş değişiklikler var. Rapor son kayıtlı verilere göredir.</Text>
          <Pressable onPress={onReload} testID="rapor-refresh">
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <Kpi title="Toplam Gelir" value={formatMoney(k.toplamGelir, cur)} tint={colors.success} />
        <Kpi title="Toplam Gider" value={formatMoney(k.toplamGider, cur)} tint={colors.warn} />
        <Kpi
          title="Faaliyet Karı"
          value={formatMoney(k.faaliyetKari, cur)}
          tint={k.faaliyetKari >= 0 ? colors.success : colors.danger}
        />
        <Kpi title="Kâr Marjı" value={formatPct(k.karMarji)} tint={colors.primary} />
      </View>

      <SectionCard title="Kapasite Kullanımı">
        <Row label="Aktif Öğrenci" value={formatInt(k.aktifOgrenci)} strong />
        <Row label="Toplam Kapasite" value={formatInt(k.toplamKapasite)} />
        <Row label="Doluluk" value={formatPct(k.doluluk)} color={colors.primary} />
      </SectionCard>

      <SectionCard title="Öğrenci Başına">
        <Row label="Gelir" value={formatMoney(k.ogrenciBasinaGelir, cur)} strong color={colors.success} />
        <Row label="Gider" value={formatMoney(k.ogrenciBasinaGider, cur)} strong color={colors.warn} />
        <Row
          label="Marj"
          value={formatMoney(k.ogrenciBasinaGelir - k.ogrenciBasinaGider, cur)}
          strong
          color={colors.primary}
        />
      </SectionCard>

      <SectionCard title="Gelir Dağılımı">
        <StackedBars items={report.gelirDagilim} currency={cur} tint={colors.success} />
      </SectionCard>

      <SectionCard title="Gider Dağılımı">
        <StackedBars items={report.giderDagilim} currency={cur} tint={colors.warn} />
      </SectionCard>
    </>
  );
}

function Kpi({ title, value, tint }: { title: string; value: string; tint: string }) {
  return (
    <View style={[styles.kpi, { borderColor: colors.border }]}>
      <View style={[styles.kpiBar, { backgroundColor: tint }]} />
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function StackedBars({
  items,
  currency,
  tint,
}: {
  items: { label: string; value: number }[];
  currency: string;
  tint: string;
}) {
  const total = items.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((it) => {
        const pct = Math.max(0, it.value) / total;
        return (
          <View key={it.label} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, ...font.small }}>{it.label}</Text>
              <Text style={{ color: colors.textDim, ...font.small }}>
                {formatMoney(it.value, currency)} · {formatPct(pct * 100)}
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.bgElev2, borderRadius: 999, overflow: "hidden" }}>
              <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: tint, borderRadius: 999 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  tabRow: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EF444422",
    borderColor: "#EF444455",
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
  },
  errText: { color: "#FCA5A5", ...font.small, flex: 1 },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  tinyLabel: { color: colors.textDim, ...font.small, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgElev,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: colors.text, ...font.bodyMd },
  kpi: {
    width: "48%",
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    overflow: "hidden",
  },
  kpiBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  kpiTitle: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  kpiValue: { color: colors.text, ...font.h3, marginTop: 6, ...font.mono },
  dirtyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9731622",
    borderColor: "#F9731655",
    borderWidth: 1,
    padding: 12,
    borderRadius: radius.md,
  },
  dirtyText: { color: "#FDBA74", ...font.small, flex: 1 },
});
