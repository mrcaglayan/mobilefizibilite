import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Scenario, User } from "@/src/api/client";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { TemelBilgilerDraft } from "@/src/scenario/temelBilgilerAdapter";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Input } from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";
import {
  FinancialNumberInput,
  FormRow,
  FormSection,
  MoneyInput,
  PercentInput,
  ReadonlyValueRow,
  SegmentedControl,
  ToggleField,
} from "@/src/ui/financialForm";

type TemelObject = Record<string, unknown>;

export type TemelSectionFilter = "missing" | "done";

export type TemelSectionKey =
  | "bolgeKampus"
  | "programTuru"
  | "okulEgitimBilgileri"
  | "kademeler"
  | "okulUcretleri"
  | "enflasyonParametreler"
  | "ikMevcut"
  | "bursIndirimler"
  | "rakipAnalizi"
  | "performans"
  | "degerlendirme";

export type Props = {
  value: unknown;
  scenario: Scenario | null;
  user: User | null | undefined;
  currencyCode: string;
  canEdit: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: TemelBilgilerDraft) => Promise<void>;
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: TemelSectionFilter;
  onSectionFilterChange?: (filter: TemelSectionFilter) => void;
  activeSectionKey?: TemelSectionKey | null;
  onActiveSectionKeyChange?: (section: TemelSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
};

const GRADE_OPTIONS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "Ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
] as const;

const KADeme_ROWS = [
  { key: "okulOncesi", label: "Okul Oncesi", baseKey: "okulOncesi" },
  { key: "ilkokulYerel", label: "Ilkokul-YEREL", baseKey: "ilkokul" },
  { key: "ilkokulInt", label: "Ilkokul-INT.", baseKey: "ilkokul" },
  { key: "ortaokulYerel", label: "Ortaokul-YEREL", baseKey: "ortaokul" },
  { key: "ortaokulInt", label: "Ortaokul-INT.", baseKey: "ortaokul" },
  { key: "liseYerel", label: "Lise-YEREL", baseKey: "lise" },
  { key: "liseInt", label: "Lise-INT.", baseKey: "lise" },
] as const;

const SCHOLAR_ROWS = [
  { key: "magisBasariBursu", label: "MAGIS Basari Bursu" },
  { key: "maarifYetenekBursu", label: "Maarif Yetenek Bursu" },
  { key: "ihtiyacBursu", label: "Ihtiyac Bursu" },
  { key: "okulBasariBursu", label: "Okul Basari Bursu" },
  { key: "tamEgitimBursu", label: "Tam Egitim Bursu" },
  { key: "barinmaBursu", label: "Barinma Bursu" },
  { key: "turkceBasariBursu", label: "Turkce Basari Bursu" },
  { key: "uluslararasiYukumlulukIndirimi", label: "Uluslararasi Yukumluluk Indirimi" },
  { key: "vakifCalisaniIndirimi", label: "Vakif Calisani Indirimi" },
  { key: "kardesIndirimi", label: "Kardes Indirimi" },
  { key: "erkenKayitIndirimi", label: "Erken Kayit Indirimi" },
  { key: "pesinOdemeIndirimi", label: "Pesin Odeme Indirimi" },
  { key: "kademeGecisIndirimi", label: "Kademe Gecis Indirimi" },
  { key: "temsilIndirimi", label: "Temsil Indirimi" },
  { key: "kurumIndirimi", label: "Kurum Indirimi" },
  { key: "istisnaiIndirim", label: "Istisnai Indirim" },
  { key: "yerelMevzuatIndirimi", label: "Yerel Mevzuat Indirimi" },
] as const;

const SCHOLAR_BURS_ROWS = SCHOLAR_ROWS.slice(0, 7);
const SCHOLAR_INDIRIM_ROWS = SCHOLAR_ROWS.slice(7);

const COMPETITOR_ROWS = [
  { key: "okulOncesi", label: "Okul Oncesi" },
  { key: "ilkokul", label: "Ilkokul" },
  { key: "ortaokul", label: "Ortaokul" },
  { key: "lise", label: "Lise" },
] as const;

const IK_MEVCUT_ROWS = [
  { key: "turkPersonelYoneticiEgitimci", label: "Turk yonetici/egitimci" },
  { key: "turkPersonelTemsilcilik", label: "Turk temsilcilik" },
  { key: "yerelKadroluEgitimci", label: "Yerel kadrolu egitimci" },
  { key: "yerelUcretliVakaterEgitimci", label: "Yerel ucretli egitimci" },
  { key: "yerelDestek", label: "Yerel destek" },
  { key: "yerelTemsilcilik", label: "Yerel temsilcilik" },
  { key: "international", label: "International personel" },
] as const;

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;
const WEEKDAY_LABELS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

function buildFeeParamRows(baseYear: number) {
  const base = Number.isFinite(baseYear) ? baseYear : new Date().getFullYear();
  return [
    { key: ["inflation", "expenseDeviationPct"], label: "Gider sapma yuzdesi", type: "percent" },
    { key: ["inflation", "y2023"], label: `${base - 3} enflasyon`, type: "percent" },
    { key: ["inflation", "y2024"], label: `${base - 2} enflasyon`, type: "percent" },
    { key: ["inflation", "y2025"], label: `${base - 1} enflasyon`, type: "percent" },
    { key: ["inflation", "y1"], label: `1. yil tahmini enflasyon (${base})`, type: "percent" },
    { key: ["inflation", "y2"], label: `2. yil tahmini enflasyon (${base + 1})`, type: "percent" },
    { key: ["inflation", "y3"], label: `3. yil tahmini enflasyon (${base + 2})`, type: "percent" },
    { key: ["inflation", "currentSeasonAvgFee"], label: "Mevcut sezon ortalama ucret", type: "money" },
  ] as const;
}

function cloneTemel(value: unknown): TemelObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as TemelObject;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fracToPercent(value: unknown) {
  return num(value) * 100;
}

function percentToFrac(value: number | null) {
  return num(value) / 100;
}

function academicBaseYear(scenario: Scenario | null) {
  const match = String(scenario?.academic_year || "").match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function getDraft(draft: TemelObject, path: readonly PathToken[], fallback: unknown = "") {
  const value = getAtPath(draft, path);
  return value == null ? fallback : value;
}

function normalizeProgramType(value: unknown) {
  return String(value || "").toLowerCase() === "international" ? "international" : "local";
}

function isKademeKeyVisible(key: string, programType: string) {
  if (key === "okulOncesi") return true;
  if (key.endsWith("Yerel")) return programType === "local";
  if (key.endsWith("Int")) return programType === "international";
  return true;
}

function normalizeKademeRow(draft: TemelObject, key: string) {
  const def = KADEME_DEFS.find((item) => item.key === key);
  const raw = getDraft(draft, ["kademeler", key], {}) as Record<string, unknown>;
  return {
    enabled: raw?.enabled !== false,
    from: str(raw?.from || def?.defaultFrom || ""),
    to: str(raw?.to || def?.defaultTo || ""),
  };
}

function dirtyPath(path: readonly PathToken[]) {
  return `temelBilgiler.${path.map(String).join(".")}`;
}

export function TemelBilgilerEditor({
  value,
  scenario,
  user,
  currencyCode,
  canEdit,
  disabledReason,
  saving,
  onDirtyPathsChange,
  onSave,
  sectionMode = false,
  onSectionModeBack,
  sectionFilter: controlledSectionFilter,
  onSectionFilterChange,
  activeSectionKey: controlledActiveSectionKey,
  onActiveSectionKeyChange,
  showSectionModeTopControls = true,
  stickySectionActions = false,
  stickyBottomInset = 0,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [draft, setDraft] = React.useState<TemelObject>(() => cloneTemel(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<TemelSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<TemelSectionKey | null>(null);
  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const setSectionFilter = React.useCallback((next: TemelSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);
  const activeSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const setActiveSection = React.useCallback((next: TemelSectionKey | null) => {
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);
  const showSectionBackButton = Boolean(activeSection);
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 76;
  const stickyEditorHeight = Math.max(440, windowHeight - 150);

  React.useEffect(() => {
    setDraft(cloneTemel(value));
    setDirtyPaths([]);
    setActiveSection(null);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, setActiveSection, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  const baseYear = academicBaseYear(scenario);
  const feeParamRows = React.useMemo(() => buildFeeParamRows(baseYear), [baseYear]);
  const programType = normalizeProgramType(getDraft(draft, ["programType"], scenario?.program_type || "local"));
  const visibleFeeRows = KADeme_ROWS.filter((row) => {
    const kademe = normalizeKademeRow(draft, row.baseKey);
    return kademe.enabled && isKademeKeyVisible(row.key, programType);
  });
  const visibleCompetitors = COMPETITOR_ROWS.filter((row) => normalizeKademeRow(draft, row.key).enabled);
  const isDirty = dirtyPaths.length > 0;

  function markDirty(path: readonly PathToken[]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, dirtyPath(path)]));
      return next;
    });
  }

  function update(path: readonly PathToken[], nextValue: unknown) {
    if (!canEdit) return;
    setDraft((prev) => setAtPath(prev, path, nextValue));
    markDirty(path);
    setMessage("");
  }

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ temelBilgiler: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Temel Bilgiler kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Temel Bilgiler kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(cloneTemel(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  const editableHint = canEdit
    ? "Okul ve senaryo bilgilerini kontrol edip kaydedin."
    : disabledReason;

  function hasText(path: readonly PathToken[]) {
    return str(getDraft(draft, path)).trim().length > 0;
  }

  function hasPositiveNumber(path: readonly PathToken[]) {
    return num(getDraft(draft, path, 0)) > 0;
  }

  function anyPositive(paths: readonly (readonly PathToken[])[]) {
    return paths.some((path) => hasPositiveNumber(path));
  }

  function allPositive(paths: readonly (readonly PathToken[])[]) {
    return paths.length > 0 && paths.every((path) => hasPositiveNumber(path));
  }

  const sectionCards: TemelSectionCardModel[] = [
    {
      key: "bolgeKampus",
      title: "Bölge / Ülke / Kampüs",
      subtitle: "Bölge, ülke, senaryo ve yetkili kişi bilgileri",
      helper: "Müdür, ülke temsilcisi ve raporu hazırlayan bilgilerini kontrol edin.",
      icon: "business-outline",
      done:
        Boolean(user?.region || user?.country_name || scenario?.name) &&
        hasText(["yetkililer", "mudur"]) &&
        hasText(["yetkililer", "ulkeTemsilcisi"]) &&
        hasText(["yetkililer", "raporuHazirlayan"]),
    },
    {
      key: "programTuru",
      title: "Program Türü",
      subtitle: "Yerel / International seçimi",
      helper: "Program türünü kontrol edin.",
      icon: "swap-horizontal-outline",
      done: Boolean(programType),
    },
    {
      key: "okulEgitimBilgileri",
      title: "Okul Eğitim Bilgileri",
      subtitle: "Eğitim başlangıcı, ders süresi, haftalık ders saati",
      helper: "Zorunlu dönemler ve program bilgilerini tamamlayın.",
      icon: "school-outline",
      done:
        hasText(["okulEgitimBilgileri", "egitimBaslamaTarihi"]) &&
        hasText(["okulEgitimBilgileri", "zorunluEgitimDonemleri"]) &&
        hasPositiveNumber(["okulEgitimBilgileri", "birDersSuresiDakika"]) &&
        hasPositiveNumber(["okulEgitimBilgileri", "gunlukDersSaati"]) &&
        hasPositiveNumber(["okulEgitimBilgileri", "haftalikDersSaatiToplam"]),
    },
    {
      key: "kademeler",
      title: "Kademeler",
      subtitle: "Okul öncesi, ilkokul, ortaokul, lise aralıkları",
      helper: "Aktif kademeler ve sınıf başlangıç/bitişlerini kontrol edin.",
      icon: "layers-outline",
      done: KADEME_DEFS.some((def) => {
        const row = normalizeKademeRow(draft, def.key);
        return row.enabled && Boolean(row.from) && Boolean(row.to);
      }),
    },
    {
      key: "okulUcretleri",
      title: "Okul Ücretleri",
      subtitle: "Ücret hesaplama ve kademe bazlı artış oranları",
      helper: "Ücret artış oranlarını girin.",
      icon: "wallet-outline",
      done:
        Boolean(getDraft(draft, ["okulUcretleriHesaplama"], false)) &&
        allPositive(visibleFeeRows.map((row) => ["ucretArtisOranlari", row.key])),
    },
    {
      key: "enflasyonParametreler",
      title: "Tahmini Enflasyon ve Parametreler",
      subtitle: "Gider sapma, yıllık enflasyon ve ortalama ücret",
      helper: "Enflasyon ve sezon parametrelerini tamamlayın.",
      icon: "stats-chart-outline",
      done: allPositive(feeParamRows.map((row) => row.key)),
    },
    {
      key: "ikMevcut",
      title: "İK Mevcut",
      subtitle: "Türk, yerel ve international mevcut personel sayıları",
      helper: "Mevcut personel sayılarını kontrol edin.",
      icon: "people-outline",
      done: anyPositive(IK_MEVCUT_ROWS.map((row) => ["ikMevcut", row.key])),
    },
    {
      key: "bursIndirimler",
      title: "Burs ve İndirimler",
      subtitle: "Burs/indirim türlerine göre mevcut öğrenci sayıları",
      helper: "Burs ve indirim öğrenci sayılarını düzenleyin.",
      icon: "pricetags-outline",
      done: anyPositive(SCHOLAR_ROWS.map((row) => ["bursIndirimOgrenciSayilari", row.key])),
    },
    {
      key: "rakipAnalizi",
      title: "Rakip Analizi",
      subtitle: "Kademe bazlı A/B/C rakip ücretleri",
      helper: "Rakip okul ücretlerini kontrol edin.",
      icon: "ribbon-outline",
      done: visibleCompetitors.every((row) =>
        (["a", "b", "c"] as const).some((suffix) => hasPositiveNumber(["rakipAnalizi", row.key, suffix])),
      ),
    },
    {
      key: "performans",
      title: "Performans",
      subtitle: "Önceki dönem kur, öğrenci, gelir ve gider gerçekleşenleri",
      helper: "Geçmiş dönem gerçekleşen değerleri girin.",
      icon: "analytics-outline",
      done:
        hasPositiveNumber(["performans", "prevYearRealizedFxUsdToLocal"]) &&
        hasPositiveNumber(["performans", "gerceklesen", "ogrenciSayisi"]) &&
        hasPositiveNumber(["performans", "gerceklesen", "gelirler"]) &&
        hasPositiveNumber(["performans", "gerceklesen", "giderler"]),
    },
    {
      key: "degerlendirme",
      title: "Değerlendirme",
      subtitle: "Serbest metin açıklama alanı",
      helper: "Ek açıklama veya not girin.",
      icon: "chatbubble-ellipses-outline",
      done: hasText(["degerlendirme"]),
    },
  ];

  const missingSections = sectionCards.filter((section) => !section.done);
  const doneSections = sectionCards.filter((section) => section.done);
  const visibleSections = sectionFilter === "missing" ? missingSections : doneSections;

  function renderBolgeKampusSection() {
    if (sectionMode) {
      return (
        <>
          <View style={[styles.mobileFormCard, styles.mobileFieldStack]}>
            <ReadonlyValueRow label="Bolge" value={str(user?.region || "-")} />
            <ReadonlyValueRow label="Ulke" value={str(user?.country_name || "-")} />
            <ReadonlyValueRow label="Senaryo" value={scenario?.name || "-"} />
          </View>

          <View style={[styles.mobileFormCard, styles.mobileFieldStack]}>
            <TextInputRow
              label="Mudur"
              required
              value={str(getDraft(draft, ["yetkililer", "mudur"]))}
              disabled={!canEdit}
              error={!hasText(["yetkililer", "mudur"]) ? "Bu alan zorunlu." : undefined}
              onChange={(next) => update(["yetkililer", "mudur"], next)}
            />
            <TextInputRow
              label="Ulke temsilcisi"
              required
              value={str(getDraft(draft, ["yetkililer", "ulkeTemsilcisi"]))}
              disabled={!canEdit}
              error={!hasText(["yetkililer", "ulkeTemsilcisi"]) ? "Bu alan zorunlu." : undefined}
              onChange={(next) => update(["yetkililer", "ulkeTemsilcisi"], next)}
            />
            <TextInputRow
              label="Raporu hazirlayan"
              required
              value={str(getDraft(draft, ["yetkililer", "raporuHazirlayan"]))}
              disabled={!canEdit}
              error={!hasText(["yetkililer", "raporuHazirlayan"]) ? "Bu alan zorunlu." : undefined}
              onChange={(next) => update(["yetkililer", "raporuHazirlayan"], next)}
            />
          </View>
        </>
      );
    }

    return (
      <FormSection title="Bolge / Ulke / Kampus" subtitle="Kampus bilgileri salt okunur; yetkililer kaydedilebilir.">
        <ReadonlyValueRow label="Bolge" value={str(user?.region || "-")} />
        <ReadonlyValueRow label="Ulke" value={str(user?.country_name || "-")} />
        <ReadonlyValueRow label="Senaryo" value={scenario?.name || "-"} />
        <TextInputRow
          label="Mudur"
          value={str(getDraft(draft, ["yetkililer", "mudur"]))}
          disabled={!canEdit}
          onChange={(next) => update(["yetkililer", "mudur"], next)}
        />
        <TextInputRow
          label="Ulke temsilcisi"
          value={str(getDraft(draft, ["yetkililer", "ulkeTemsilcisi"]))}
          disabled={!canEdit}
          onChange={(next) => update(["yetkililer", "ulkeTemsilcisi"], next)}
        />
        <TextInputRow
          label="Raporu hazirlayan"
          value={str(getDraft(draft, ["yetkililer", "raporuHazirlayan"]))}
          disabled={!canEdit}
          onChange={(next) => update(["yetkililer", "raporuHazirlayan"], next)}
        />
      </FormSection>
    );
  }

  function renderProgramTuruSection() {
    return (
      <FormSection
        title={sectionMode ? "Program seçimi" : "Program Turu"}
        subtitle={sectionMode ? "Bu seçim kademeleri, ücret satırlarını ve bazı hesaplamaları etkiler." : undefined}
        style={sectionMode ? styles.mobileFormCard : undefined}
      >
        <SegmentedControl
          value={programType}
          disabled={!canEdit}
          onChange={(next) => update(["programType"], next)}
          options={[
            { label: "Yerel", value: "local" },
            { label: "International", value: "international" },
          ]}
          testID="temel-program-type"
        />
      </FormSection>
    );
  }

  function renderOkulEgitimSection() {
    if (sectionMode) {
      return (
        <>
          <FormSection title="Dönem ve ders düzeni" style={styles.mobileFormCard}>
            <DateInputRow
              label="Egitim baslama tarihi"
              required
              value={str(getDraft(draft, ["okulEgitimBilgileri", "egitimBaslamaTarihi"]))}
              disabled={!canEdit}
              error={!hasText(["okulEgitimBilgileri", "egitimBaslamaTarihi"]) ? "Başlama tarihi girilmeli." : undefined}
              onChange={(next) => update(["okulEgitimBilgileri", "egitimBaslamaTarihi"], next)}
            />
            <TextInputRow
              label="Zorunlu egitim donemleri"
              required
              value={str(getDraft(draft, ["okulEgitimBilgileri", "zorunluEgitimDonemleri"]))}
              disabled={!canEdit}
              error={!hasText(["okulEgitimBilgileri", "zorunluEgitimDonemleri"]) ? "Zorunlu eğitim dönemi girilmeli." : undefined}
              onChange={(next) => update(["okulEgitimBilgileri", "zorunluEgitimDonemleri"], next)}
            />
            <View style={styles.mobileTwoCols}>
              <NumberRow
                compact
                label="Bir ders suresi"
                unit="dk"
                required
                value={num(getDraft(draft, ["okulEgitimBilgileri", "birDersSuresiDakika"], 0))}
                disabled={!canEdit}
                error={!hasPositiveNumber(["okulEgitimBilgileri", "birDersSuresiDakika"]) ? "Gerekli." : undefined}
                onChange={(next) => update(["okulEgitimBilgileri", "birDersSuresiDakika"], next)}
              />
              <NumberRow
                compact
                label="Gunluk ders"
                value={num(getDraft(draft, ["okulEgitimBilgileri", "gunlukDersSaati"], 0))}
                disabled={!canEdit}
                onChange={(next) => update(["okulEgitimBilgileri", "gunlukDersSaati"], next)}
              />
            </View>
            <View style={styles.mobileTwoCols}>
              <NumberRow
                compact
                label="Haftalik ders"
                required
                value={num(getDraft(draft, ["okulEgitimBilgileri", "haftalikDersSaatiToplam"], 0))}
                disabled={!canEdit}
                error={!hasPositiveNumber(["okulEgitimBilgileri", "haftalikDersSaatiToplam"]) ? "Gerekli." : undefined}
                onChange={(next) => update(["okulEgitimBilgileri", "haftalikDersSaatiToplam"], next)}
              />
              <NumberRow
                compact
                label="Ogretmen ort."
                value={num(getDraft(draft, ["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], 0))}
                disabled={!canEdit}
                onChange={(next) => update(["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], next)}
              />
            </View>
          </FormSection>

          <FormSection title="Program notları" style={styles.mobileFormCard}>
            <TextInputRow
              label="Sabahci / oglenci"
              value={str(getDraft(draft, ["okulEgitimBilgileri", "sabahciOglenci"]))}
              disabled={!canEdit}
              onChange={(next) => update(["okulEgitimBilgileri", "sabahciOglenci"], next)}
            />
            <TextInputRow
              label="Uygulanan program"
              value={str(getDraft(draft, ["okulEgitimBilgileri", "uygulananProgram"]))}
              disabled={!canEdit}
              onChange={(next) => update(["okulEgitimBilgileri", "uygulananProgram"], next)}
            />
            <TextInputRow
              label="Gecis sinavi bilgisi"
              value={str(getDraft(draft, ["okulEgitimBilgileri", "gecisSinaviBilgisi"]))}
              disabled={!canEdit}
              onChange={(next) => update(["okulEgitimBilgileri", "gecisSinaviBilgisi"], next)}
            />
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="Okul Egitim Bilgileri">
        <DateInputRow
          label="Egitim baslama tarihi"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "egitimBaslamaTarihi"]))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "egitimBaslamaTarihi"], next)}
        />
        <TextInputRow
          label="Zorunlu egitim donemleri"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "zorunluEgitimDonemleri"]))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "zorunluEgitimDonemleri"], next)}
        />
        <NumberRow
          label="Bir ders suresi"
          unit="dk"
          value={num(getDraft(draft, ["okulEgitimBilgileri", "birDersSuresiDakika"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "birDersSuresiDakika"], next)}
        />
        <NumberRow
          label="Gunluk ders saati"
          value={num(getDraft(draft, ["okulEgitimBilgileri", "gunlukDersSaati"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "gunlukDersSaati"], next)}
        />
        <NumberRow
          label="Haftalik ders saati"
          value={num(getDraft(draft, ["okulEgitimBilgileri", "haftalikDersSaatiToplam"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "haftalikDersSaatiToplam"], next)}
        />
        <NumberRow
          label="Ogretmen haftalik ort."
          value={num(getDraft(draft, ["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], next)}
        />
        <TextInputRow
          label="Sabahci / oglenci"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "sabahciOglenci"]))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "sabahciOglenci"], next)}
        />
        <TextInputRow
          label="Uygulanan program"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "uygulananProgram"]))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "uygulananProgram"], next)}
        />
        <TextInputRow
          label="Gecis sinavi bilgisi"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "gecisSinaviBilgisi"]))}
          disabled={!canEdit}
          onChange={(next) => update(["okulEgitimBilgileri", "gecisSinaviBilgisi"], next)}
        />
      </FormSection>
    );
  }

  function renderKademelerSection() {
    if (sectionMode) {
      return (
        <>
          {KADEME_DEFS.map((def) => {
            const row = normalizeKademeRow(draft, def.key);
            return (
              <View
                key={def.key}
                style={[styles.mobileFormCard, styles.kademeMobileCard, !row.enabled && styles.kademeMobileCardInactive]}
              >
                <View style={styles.kademeToggleBox}>
                  <ToggleField
                    label={def.label}
                    hint={row.enabled ? "Aktif" : "Pasif"}
                    value={row.enabled}
                    disabled={!canEdit}
                    onChange={(next) => update(["kademeler", def.key, "enabled"], next)}
                  />
                </View>
                {row.enabled ? (
                  <View style={styles.kademeGradePair}>
                    <GradeInputRow
                      label="Başlangıç"
                      value={row.from}
                      disabled={!canEdit}
                      onChange={(next) => update(["kademeler", def.key, "from"], normalizeGrade(next, def.defaultFrom))}
                    />
                    <GradeInputRow
                      label="Bitiş"
                      value={row.to}
                      disabled={!canEdit}
                      onChange={(next) => update(["kademeler", def.key, "to"], normalizeGrade(next, def.defaultTo))}
                    />
                  </View>
                ) : (
                  <Text style={styles.kademeInactiveText}>
                    Pasif kademelerde sınıf aralığı hesaplamalara dahil edilmez.
                  </Text>
                )}
              </View>
            );
          })}
        </>
      );
    }

    return (
      <FormSection title="Kademeler" subtitle="Araliklar kapasite, gelir ve norm etiketlerini etkiler.">
        {KADEME_DEFS.map((def) => {
          const row = normalizeKademeRow(draft, def.key);
          return (
            <View key={def.key} style={styles.kademeRow}>
              <ToggleField
                label={def.label}
                value={row.enabled}
                disabled={!canEdit}
                onChange={(next) => update(["kademeler", def.key, "enabled"], next)}
              />
              <View style={styles.gradePair}>
                <TextInputRow
                  compact
                  label="Baslangic"
                  value={row.from}
                  disabled={!canEdit || !row.enabled}
                  onChange={(next) => update(["kademeler", def.key, "from"], normalizeGrade(next, def.defaultFrom))}
                />
                <TextInputRow
                  compact
                  label="Bitis"
                  value={row.to}
                  disabled={!canEdit || !row.enabled}
                  onChange={(next) => update(["kademeler", def.key, "to"], normalizeGrade(next, def.defaultTo))}
                />
              </View>
            </View>
          );
        })}
      </FormSection>
    );
  }

  function renderOkulUcretleriSection() {
    if (sectionMode) {
      return (
        <>
          <FormSection title="Ücret hesaplama" style={styles.mobileFormCard}>
            <ToggleField
              label="Ucret hesaplamayi aktif et"
              hint="Gelir hesaplamasında kullanılacak."
              value={Boolean(getDraft(draft, ["okulUcretleriHesaplama"], false))}
              disabled={!canEdit}
              onChange={(next) => update(["okulUcretleriHesaplama"], next)}
            />
          </FormSection>
          <FormSection title="Artış oranları" subtitle="Aktif kademelerin ücret artış oranları." style={styles.mobileFormCard}>
            {visibleFeeRows.map((row) => (
              <PercentRow
                key={row.key}
                label={row.label}
                required
                value={fracToPercent(getDraft(draft, ["ucretArtisOranlari", row.key], 0))}
                disabled={!canEdit}
                error={!hasPositiveNumber(["ucretArtisOranlari", row.key]) ? "Artış oranı girilmeli." : undefined}
                onChange={(next) => update(["ucretArtisOranlari", row.key], percentToFrac(next))}
              />
            ))}
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="Okul Ucretleri" subtitle="Oranlar web ile ayni sekilde kesir olarak saklanir.">
        <ToggleField
          label="Ucret hesaplamayi aktif et"
          value={Boolean(getDraft(draft, ["okulUcretleriHesaplama"], false))}
          disabled={!canEdit}
          onChange={(next) => update(["okulUcretleriHesaplama"], next)}
        />
        {visibleFeeRows.map((row) => (
          <PercentRow
            key={row.key}
            label={row.label}
            value={fracToPercent(getDraft(draft, ["ucretArtisOranlari", row.key], 0))}
            disabled={!canEdit}
            onChange={(next) => update(["ucretArtisOranlari", row.key], percentToFrac(next))}
          />
        ))}
      </FormSection>
    );
  }

  function renderEnflasyonSection() {
    if (sectionMode) {
      return (
        <>
          <FormSection title="Ana parametreler" style={styles.mobileFormCard}>
            <InlineNumberRow
              label="Gider sapma yuzdesi"
              unit="%"
              value={fracToPercent(getDraft(draft, ["inflation", "expenseDeviationPct"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["inflation", "expenseDeviationPct"], percentToFrac(next))}
            />
            <InlineNumberRow
              label="Mevcut sezon ortalama ucret"
              unit={currencyCode}
              wide
              value={num(getDraft(draft, ["inflation", "currentSeasonAvgFee"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["inflation", "currentSeasonAvgFee"], num(next))}
            />
          </FormSection>
          <FormSection title="Enflasyon yılları" subtitle="Geçmiş ve tahmini yıllık enflasyon oranları." style={styles.mobileFormCard}>
            {feeParamRows
              .filter((row) => row.type !== "money" && row.key.join(".") !== "inflation.expenseDeviationPct")
              .map((row) => (
                <InlineNumberRow
                  key={row.label}
                  label={row.label}
                  unit="%"
                  required
                  value={fracToPercent(getDraft(draft, row.key, 0))}
                  disabled={!canEdit}
                  onChange={(next) => update(row.key, percentToFrac(next))}
                />
              ))}
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="Tahmini Enflasyon ve Parametreler">
        {feeParamRows.map((row) =>
          row.type === "money" ? (
            <MoneyRow
              key={row.label}
              label={row.label}
              currency={currencyCode}
              value={num(getDraft(draft, row.key, 0))}
              disabled={!canEdit}
              onChange={(next) => update(row.key, next)}
            />
          ) : (
            <PercentRow
              key={row.label}
              label={row.label}
              value={fracToPercent(getDraft(draft, row.key, 0))}
              disabled={!canEdit}
              onChange={(next) => update(row.key, percentToFrac(next))}
            />
          ),
        )}
      </FormSection>
    );
  }

  function renderIkMevcutSection() {
    if (sectionMode) {
      const renderIkNumber = (
        row: { key: string; label: string },
        compact = false,
      ) => (
        <NumberRow
          key={row.key}
          compact={compact}
          label={row.label}
          value={num(getDraft(draft, ["ikMevcut", row.key], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["ikMevcut", row.key], next)}
        />
      );

      return (
        <>
          <FormSection title="Türk personel" style={styles.mobileFormCard}>
            <View style={styles.mobileTwoCols}>
              {renderIkNumber({ key: "turkPersonelYoneticiEgitimci", label: "Yönetici/eğitimci" }, true)}
              {renderIkNumber({ key: "turkPersonelTemsilcilik", label: "Temsilcilik" }, true)}
            </View>
          </FormSection>

          <FormSection title="Yerel personel" style={styles.mobileFormCard}>
            {renderIkNumber({ key: "yerelKadroluEgitimci", label: "Yerel kadrolu eğitimci" })}
            {renderIkNumber({ key: "yerelUcretliVakaterEgitimci", label: "Yerel ücretli/vakater eğitimci" })}
            <View style={styles.mobileTwoCols}>
              {renderIkNumber({ key: "yerelDestek", label: "Destek" }, true)}
              {renderIkNumber({ key: "yerelTemsilcilik", label: "Temsilcilik" }, true)}
            </View>
          </FormSection>

          <FormSection title="International" style={styles.mobileFormCard}>
            {renderIkNumber({ key: "international", label: "International personel" })}
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="IK Mevcut">
        {IK_MEVCUT_ROWS.map((row) => (
          <NumberRow
            key={row.key}
            label={row.label}
            value={num(getDraft(draft, ["ikMevcut", row.key], 0))}
            disabled={!canEdit}
            onChange={(next) => update(["ikMevcut", row.key], next)}
          />
        ))}
      </FormSection>
    );
  }

  function renderBursIndirimlerSection() {
    if (sectionMode) {
      const mainDiscountKeys = new Set([
        "kardesIndirimi",
        "erkenKayitIndirimi",
        "pesinOdemeIndirimi",
        "vakifCalisaniIndirimi",
        "kademeGecisIndirimi",
        "temsilIndirimi",
      ]);
      const scholarGroups = [
        {
          title: "Burslar",
          rows: SCHOLAR_BURS_ROWS,
        },
        {
          title: "İndirimler",
          rows: SCHOLAR_INDIRIM_ROWS.filter((row) => mainDiscountKeys.has(row.key)),
        },
        {
          title: "Diğer indirimler",
          rows: SCHOLAR_INDIRIM_ROWS.filter((row) => !mainDiscountKeys.has(row.key)),
        },
      ];

      return (
        <>
          {scholarGroups.map((group) => (
            <FormSection key={group.title} title={group.title} style={styles.mobileFormCard}>
              <View style={styles.scholarCompactList}>
                {group.rows.map((row) => (
                  <ScholarCompactRow
                    key={row.key}
                    label={row.label}
                    value={num(getDraft(draft, ["bursIndirimOgrenciSayilari", row.key], 0))}
                    disabled={!canEdit}
                    onChange={(next) => update(["bursIndirimOgrenciSayilari", row.key], next)}
                  />
                ))}
              </View>
            </FormSection>
          ))}
        </>
      );
    }

    return (
      <FormSection title="Burs ve Indirimler" subtitle="Mevcut ogrenci sayisi alanlari.">
        {SCHOLAR_ROWS.map((row) => (
          <NumberRow
            key={row.key}
            label={row.label}
            value={num(getDraft(draft, ["bursIndirimOgrenciSayilari", row.key], 0))}
            disabled={!canEdit}
            onChange={(next) => update(["bursIndirimOgrenciSayilari", row.key], next)}
          />
        ))}
      </FormSection>
    );
  }

  function renderRakipAnaliziSection() {
    const renderCompetitorInputs = (row: (typeof COMPETITOR_ROWS)[number]) => (
      <>
        <View style={styles.competitorPairRow}>
          <MoneyRow
            compact
            label="Rakip A"
            currency={currencyCode}
            value={num(getDraft(draft, ["rakipAnalizi", row.key, "a"], 0))}
            disabled={!canEdit}
            onChange={(next) => update(["rakipAnalizi", row.key, "a"], next)}
          />
          <MoneyRow
            compact
            label="Rakip B"
            currency={currencyCode}
            value={num(getDraft(draft, ["rakipAnalizi", row.key, "b"], 0))}
            disabled={!canEdit}
            onChange={(next) => update(["rakipAnalizi", row.key, "b"], next)}
          />
        </View>
        <MoneyRow
          label="Rakip C"
          currency={currencyCode}
          value={num(getDraft(draft, ["rakipAnalizi", row.key, "c"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["rakipAnalizi", row.key, "c"], next)}
        />
      </>
    );

    if (sectionMode) {
      return (
        <>
          <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
            <Text style={styles.mobileInfoTitle}>Kademe bazlı rakipler</Text>
            <Text style={styles.mobileInfoText}>
              Her aktif kademe ayrı kartta gösterilir. Rakip A, B ve C ücretlerini aynı formatta kontrol edin.
            </Text>
          </View>
          {visibleCompetitors.map((row) => (
            <FormSection
              key={row.key}
              title={row.label}
              subtitle="Rakip okul ücretleri"
              right={
                <View style={styles.currencyPill}>
                  <Text style={styles.currencyPillText}>{currencyCode}</Text>
                </View>
              }
              style={styles.mobileFormCard}
            >
              <View style={styles.competitorFields}>
                {renderCompetitorInputs(row)}
              </View>
            </FormSection>
          ))}
        </>
      );
    }

    return (
      <FormSection title="Rakip Analizi">
        {visibleCompetitors.map((row) => (
          <View key={row.key} style={styles.competitorBlock}>
            <Text style={styles.subhead}>{row.label}</Text>
            <View style={styles.competitorFields}>
              {renderCompetitorInputs(row)}
            </View>
          </View>
        ))}
      </FormSection>
    );
  }

  function renderPerformansSection() {
    if (sectionMode) {
      return (
        <>
          <FormSection title="Kur ve öğrenci" style={styles.mobileFormCard}>
            <MoneyRow
              label="Onceki donem ortalama kur"
              currency={currencyCode}
              value={num(getDraft(draft, ["performans", "prevYearRealizedFxUsdToLocal"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["performans", "prevYearRealizedFxUsdToLocal"], next)}
            />
            <NumberRow
              label="Gercek ogrenci sayisi"
              value={num(getDraft(draft, ["performans", "gerceklesen", "ogrenciSayisi"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["performans", "gerceklesen", "ogrenciSayisi"], next)}
            />
          </FormSection>
          <FormSection title="Gerçekleşen finansal değerler" style={styles.mobileFormCard}>
            <MoneyRow
              label="Gercek gelirler"
              currency={currencyCode}
              value={num(getDraft(draft, ["performans", "gerceklesen", "gelirler"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["performans", "gerceklesen", "gelirler"], next)}
            />
            <MoneyRow
              label="Gercek giderler"
              currency={currencyCode}
              value={num(getDraft(draft, ["performans", "gerceklesen", "giderler"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["performans", "gerceklesen", "giderler"], next)}
            />
            <MoneyRow
              label="Gercek burs ve indirimler"
              currency={currencyCode}
              value={num(getDraft(draft, ["performans", "gerceklesen", "bursVeIndirimler"], 0))}
              disabled={!canEdit}
              onChange={(next) => update(["performans", "gerceklesen", "bursVeIndirimler"], next)}
            />
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="Performans" subtitle="Onceki donem gerceklesen degerleri.">
        <MoneyRow
          label="Onceki donem ortalama kur"
          currency={currencyCode}
          value={num(getDraft(draft, ["performans", "prevYearRealizedFxUsdToLocal"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["performans", "prevYearRealizedFxUsdToLocal"], next)}
        />
        <NumberRow
          label="Gercek ogrenci sayisi"
          value={num(getDraft(draft, ["performans", "gerceklesen", "ogrenciSayisi"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["performans", "gerceklesen", "ogrenciSayisi"], next)}
        />
        <MoneyRow
          label="Gercek gelirler"
          currency={currencyCode}
          value={num(getDraft(draft, ["performans", "gerceklesen", "gelirler"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["performans", "gerceklesen", "gelirler"], next)}
        />
        <MoneyRow
          label="Gercek giderler"
          currency={currencyCode}
          value={num(getDraft(draft, ["performans", "gerceklesen", "giderler"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["performans", "gerceklesen", "giderler"], next)}
        />
        <MoneyRow
          label="Gercek burs ve indirimler"
          currency={currencyCode}
          value={num(getDraft(draft, ["performans", "gerceklesen", "bursVeIndirimler"], 0))}
          disabled={!canEdit}
          onChange={(next) => update(["performans", "gerceklesen", "bursVeIndirimler"], next)}
        />
      </FormSection>
    );
  }

  function renderDegerlendirmeSection() {
    if (sectionMode) {
      return (
        <>
          <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
            <Text style={styles.mobileInfoTitle}>Kısa açıklama alanı</Text>
            <Text style={styles.mobileInfoText}>
              Okul müdürü burada senaryoya ilişkin genel açıklama veya istisnai not bırakabilir.
            </Text>
          </View>

          <FormSection title="Açıklama" style={styles.mobileFormCard}>
            <Input
              value={str(getDraft(draft, ["degerlendirme"]))}
              editable={canEdit}
              multiline
              numberOfLines={7}
              placeholder="Değerlendirme notu yazınız..."
              style={styles.degerlendirmeInput}
              onChangeText={(next) => update(["degerlendirme"], next)}
              testID="temel-degerlendirme-input"
            />
          </FormSection>
        </>
      );
    }

    return (
      <FormSection title="Degerlendirme">
        <Input
          value={str(getDraft(draft, ["degerlendirme"]))}
          editable={canEdit}
          multiline
          numberOfLines={4}
          style={styles.multiline}
          onChangeText={(next) => update(["degerlendirme"], next)}
          testID="temel-degerlendirme-input"
        />
      </FormSection>
    );
  }

  function renderSectionForm(sectionKey: TemelSectionKey) {
    switch (sectionKey) {
      case "bolgeKampus":
        return renderBolgeKampusSection();
      case "programTuru":
        return renderProgramTuruSection();
      case "okulEgitimBilgileri":
        return renderOkulEgitimSection();
      case "kademeler":
        return renderKademelerSection();
      case "okulUcretleri":
        return renderOkulUcretleriSection();
      case "enflasyonParametreler":
        return renderEnflasyonSection();
      case "ikMevcut":
        return renderIkMevcutSection();
      case "bursIndirimler":
        return renderBursIndirimlerSection();
      case "rakipAnalizi":
        return renderRakipAnaliziSection();
      case "performans":
        return renderPerformansSection();
      case "degerlendirme":
      default:
        return renderDegerlendirmeSection();
    }
  }

  function renderAllSections() {
    return (
      <>
        {renderBolgeKampusSection()}
        {renderProgramTuruSection()}
        {renderOkulEgitimSection()}
        {renderKademelerSection()}
        {renderOkulUcretleriSection()}
        {renderEnflasyonSection()}
        {renderIkMevcutSection()}
        {renderBursIndirimlerSection()}
        {renderRakipAnaliziSection()}
        {renderPerformansSection()}
        {renderDegerlendirmeSection()}
      </>
    );
  }

  function renderActionButtons(containerStyle?: any) {
    return (
      <View style={[styles.actions, sectionMode ? styles.mobileActions : null, containerStyle]}>
        <Button
          label="Vazgec"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="temel-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="temel-save-button"
        />
      </View>
    );
  }

  function renderActions() {
    return (
      <>
        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {renderActionButtons()}
      </>
    );
  }

  function renderStickyActions() {
    return (
      <View style={[styles.stickySectionActions, { bottom: stickyActionBottom }]}>
        {message ? <Text style={styles.stickySuccessText}>{message}</Text> : null}
        {renderActionButtons(styles.stickyActionButtons)}
      </View>
    );
  }

  function renderSectionModeTop(showTabs: boolean) {
    if (!showSectionModeTopControls) return null;
    return (
      <View style={styles.sectionModeTopRow}>
        {showSectionBackButton ? (
          <Pressable
            onPress={() => {
              if (activeSection) {
                setActiveSection(null);
                return;
              }
              onSectionModeBack?.();
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
            testID="scenario-back-button"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        ) : null}

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="temel-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="temel-filter-done"
            >
              <Text style={[styles.topTabText, sectionFilter === "done" ? styles.topTabTextActive : null]}>
                Tamam {doneSections.length}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  if (sectionMode) {
    if (activeSection) {
      if (stickySectionActions) {
        return (
          <View
            testID="temel-bilgiler-editor"
            style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}
          >
            {renderSectionModeTop(false)}
            <ScrollView
              style={styles.sectionEditorScroll}
              contentContainerStyle={[styles.sectionEditorContent, { paddingBottom: stickyActionScrollPadding }]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {renderSectionForm(activeSection)}
            </ScrollView>
            {renderStickyActions()}
          </View>
        );
      }
      return (
        <View testID="temel-bilgiler-editor" style={styles.sectionModeRoot}>
          {renderSectionModeTop(false)}
          {renderSectionForm(activeSection)}
          {renderActions()}
        </View>
      );
    }

    return (
      <View testID="temel-bilgiler-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}

        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <TemelSectionCard
                key={section.key}
                section={section}
                done={section.done}
                onPress={() => setActiveSection(section.key)}
              />
            ))
          ) : (
            <Card style={styles.emptySectionCard}>
              <Ionicons
                name={sectionFilter === "missing" ? "checkmark-circle-outline" : "ellipse-outline"}
                size={30}
                color={sectionFilter === "missing" ? colors.success : colors.textMuted}
              />
              <Text style={styles.emptySectionTitle}>
                {sectionFilter === "missing" ? "Eksik bölüm kalmadı" : "Tamamlanan bölüm yok"}
              </Text>
              <Text style={styles.emptySectionText}>
                {sectionFilter === "missing"
                  ? "Tüm Temel Bilgiler kartları tamamlanmış görünüyor."
                  : "Bölümleri doldurdukça burada listelenecek."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card testID="temel-bilgiler-editor" style={styles.editorCard}>
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Temel Bilgiler</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>{canEdit ? "Düzenleniyor" : "Kilitli"}</Text>
        </View>
      </View>

      {renderAllSections()}
      {renderActions()}
    </Card>
  );
}

type TemelSectionCardModel = {
  key: TemelSectionKey;
  title: string;
  subtitle: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  done: boolean;
};

function TemelSectionCard({
  section,
  done,
  onPress,
}: {
  section: TemelSectionCardModel;
  done: boolean;
  onPress: () => void;
}) {
  const iconColor = done ? colors.success : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sectionCard, pressed ? styles.pressed : null]}
      testID={`temel-section-${section.key}`}
    >
      <View style={styles.sectionMainRow}>
        <View style={[styles.sectionIcon, { backgroundColor: done ? "#EAF8EF" : colors.chipBg }]}>
          <Ionicons name={section.icon} size={23} color={iconColor} />
        </View>
        <View style={styles.sectionTextBlock}>
          <Text style={styles.sectionCardTitle} numberOfLines={2}>{section.title}</Text>
          <Text style={styles.sectionCardSubtitle} numberOfLines={3}>{section.subtitle}</Text>
        </View>
        <View style={[styles.sectionStatusPill, done ? styles.sectionStatusDone : styles.sectionStatusMissing]}>
          <Text style={[styles.sectionStatusText, done ? styles.sectionStatusTextDone : styles.sectionStatusTextMissing]}>
            {done ? "Tamam" : "Eksik"}
          </Text>
        </View>
      </View>
      <View style={styles.sectionDivider} />
      <View style={styles.sectionCardBottom}>
        <View style={styles.helperWrap}>
          <View style={styles.helperDots} />
          <Text style={styles.sectionHelper} numberOfLines={2}>{section.helper}</Text>
        </View>
        <View style={[styles.sectionActionButton, done ? styles.sectionActionButtonDone : null]}>
          <Text style={[styles.sectionActionText, done ? styles.sectionActionTextDone : null]}>{done ? "Aç" : "Doldur"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function normalizeGrade(value: string, fallback: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (GRADE_OPTIONS.includes(raw)) return raw;
  return fallback;
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sameCalendarDay(a: Date | null, b: Date | null) {
  return Boolean(
    a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate(),
  );
}

function getCalendarDays(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function DateInputRow({
  label,
  value,
  onChange,
  disabled,
  required,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  const selectedDate = parseDateValue(value);
  const today = React.useMemo(() => new Date(), []);
  const [open, setOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const base = selectedDate || today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const calendarDays = React.useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  React.useEffect(() => {
    if (!selectedDate) return;
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth()]);

  function moveMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function chooseDate(date: Date) {
    onChange(formatDateValue(date));
    setOpen(false);
  }

  return (
    <>
      <FormRow label={label} required={required} hint={hint} error={error}>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.dateInput,
            disabled ? styles.dateInputDisabled : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.dateInputText, !value ? styles.dateInputPlaceholder : null]}>
            {value || "Tarih seçin"}
          </Text>
          <View style={styles.dateInputIcon}>
            <Ionicons name="calendar-outline" size={18} color={disabled ? colors.textMuted : colors.primary} />
          </View>
        </Pressable>
      </FormRow>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label} testID="temel-date-picker-sheet">
        <View style={styles.datePickerBody}>
          <View style={styles.datePickerMonthRow}>
            <Pressable onPress={() => moveMonth(-1)} hitSlop={10} style={styles.datePickerNavButton}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={styles.datePickerMonthTitle}>
              {MONTH_NAMES_TR[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </Text>
            <Pressable onPress={() => moveMonth(1)} hitSlop={10} style={styles.datePickerNavButton}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS_TR.map((day) => (
              <Text key={day} style={styles.weekdayLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((date) => {
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const selected = sameCalendarDay(date, selectedDate);
              const isToday = sameCalendarDay(date, today);
              return (
                <Pressable
                  key={formatDateValue(date)}
                  onPress={() => chooseDate(date)}
                  style={({ pressed }) => [
                    styles.calendarDay,
                    selected ? styles.calendarDaySelected : null,
                    isToday && !selected ? styles.calendarDayToday : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      !inMonth ? styles.calendarDayMuted : null,
                      selected ? styles.calendarDayTextSelected : null,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.datePickerActions}>
            <Button
              label="Bugün"
              variant="secondary"
              onPress={() => {
                setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                chooseDate(today);
              }}
              style={styles.datePickerAction}
            />
            <Button
              label="Kapat"
              variant="primary"
              onPress={() => setOpen(false)}
              style={styles.datePickerAction}
            />
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

function ScholarCompactRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.scholarCompactRow}>
      <Text style={styles.scholarCompactLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.scholarCompactInput}>
        <FinancialNumberInput
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(num(next))}
          inputProps={{ keyboardType: "number-pad" }}
        />
      </View>
    </View>
  );
}

function GradeInputRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.gradeInputField}>
      <Text style={styles.gradeInputLabel}>{label}</Text>
      <TextInput
        value={value}
        editable={!disabled}
        autoCapitalize="characters"
        selectTextOnFocus
        onChangeText={onChange}
        placeholder="-"
        placeholderTextColor={colors.textMuted}
        style={[styles.gradeInput, disabled && styles.disabledInput]}
      />
    </View>
  );
}

function TextInputRow({
  label,
  value,
  onChange,
  disabled,
  compact,
  placeholder,
  required,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <FormRow label={label} required={required} hint={hint} error={error}>
      <Input
        value={value}
        editable={!disabled}
        placeholder={placeholder}
        autoCapitalize="none"
        onChangeText={onChange}
        style={[compact && styles.compactInput, disabled && styles.disabledInput]}
      />
    </FormRow>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  disabled,
  unit,
  compact,
  required,
  hint,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  unit?: string;
  compact?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <View style={compact ? styles.compactMoney : undefined}>
      <FormRow label={label} required={required} hint={hint} error={error}>
        <FinancialNumberInput
          value={value}
          unit={unit}
          disabled={disabled}
          onChange={(next) => onChange(num(next))}
        />
      </FormRow>
    </View>
  );
}

function InlineNumberRow({
  label,
  value,
  unit,
  onChange,
  disabled,
  required,
  error,
  wide,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  wide?: boolean;
}) {
  return (
    <View style={styles.inlineNumberField}>
      <View style={styles.inlineNumberRow}>
        <Text style={styles.inlineNumberLabel} numberOfLines={2}>
          {label}
          {required ? <Text style={styles.inlineNumberRequired}> *</Text> : null}
        </Text>
        <View style={[styles.inlineNumberInput, wide && styles.inlineNumberInputWide]}>
          <FinancialNumberInput value={value} unit={unit} disabled={disabled} onChange={onChange} />
        </View>
      </View>
      {error ? <Text style={styles.inlineNumberError}>{error}</Text> : null}
    </View>
  );
}

function PercentRow({
  label,
  value,
  onChange,
  disabled,
  required,
  hint,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <FormRow label={label} required={required} hint={hint} error={error}>
      <PercentInput value={value} disabled={disabled} onChange={onChange} />
    </FormRow>
  );
}

function MoneyRow({
  label,
  value,
  currency,
  onChange,
  disabled,
  compact,
  required,
  hint,
  error,
}: {
  label: string;
  value: number;
  currency: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <View style={compact ? styles.compactMoney : undefined}>
      <FormRow label={label} required={required} hint={hint} error={error}>
        <MoneyInput
          value={value}
          currency={currency}
          disabled={disabled}
          onChange={(next) => onChange(num(next))}
        />
      </FormRow>
    </View>
  );
}

const styles = StyleSheet.create({
  editorCard: {
    borderRadius: 24,
    gap: spacing.sm,
  },
  editorHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    ...font.h3,
  },
  subtitle: {
    color: colors.textDim,
    ...font.small,
    marginTop: 4,
  },
  editBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  editBadgeOn: {
    backgroundColor: colors.primary,
  },
  editBadgeOff: {
    backgroundColor: "#F9731622",
    borderWidth: 1,
    borderColor: "#F9731655",
  },
  editBadgeText: {
    ...font.tiny,
    fontWeight: "900",
  },
  kademeRow: {
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  gradePair: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  kademeMobileCard: {
    gap: spacing.sm,
    padding: 12,
    borderRadius: 20,
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  kademeMobileCardInactive: {
    backgroundColor: "#FBFDFF",
  },
  kademeToggleBox: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kademeGradePair: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  kademeInactiveText: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  gradeInputField: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  gradeInputLabel: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
  },
  gradeInput: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  compactInput: {
    textAlign: "center",
  },
  disabledInput: {
    color: colors.textMuted,
  },
  inlineNumberField: {
    gap: 5,
  },
  inlineNumberRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inlineNumberLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    fontWeight: "800",
    lineHeight: 18,
  },
  inlineNumberRequired: {
    color: colors.warn,
  },
  inlineNumberInput: {
    width: 112,
    flexShrink: 0,
  },
  inlineNumberInputWide: {
    width: 138,
  },
  inlineNumberError: {
    color: colors.danger,
    ...font.tiny,
    textAlign: "right",
  },
  dateInput: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  dateInputDisabled: {
    opacity: 0.55,
  },
  dateInputText: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  dateInputPlaceholder: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  dateInputIcon: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  datePickerBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  datePickerMonthRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  datePickerNavButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  datePickerMonthTitle: {
    flex: 1,
    color: colors.text,
    ...font.h3,
    textAlign: "center",
  },
  weekdayRow: {
    flexDirection: "row",
    gap: 4,
  },
  weekdayLabel: {
    flex: 1,
    color: colors.textMuted,
    ...font.tiny,
    textAlign: "center",
    fontWeight: "900",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: `${100 / 7}%`,
    maxWidth: 46,
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  calendarDayToday: {
    borderColor: colors.primary,
    backgroundColor: colors.chipBg,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  calendarDayMuted: {
    color: colors.textMuted,
    opacity: 0.45,
  },
  calendarDayTextSelected: {
    color: colors.primaryText,
  },
  datePickerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  datePickerAction: {
    flex: 1,
  },
  competitorBlock: {
    gap: spacing.sm,
  },
  competitorFields: {
    gap: spacing.sm,
  },
  competitorPairRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  compactMoney: {
    flex: 1,
    minWidth: 0,
  },
  subhead: {
    color: colors.text,
    ...font.bodyMd,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  degerlendirmeInput: {
    minHeight: 180,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  successText: {
    color: colors.success,
    ...font.small,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mobileActions: {
    marginTop: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.bgElev,
  },
  actionButton: {
    flex: 1,
  },

  sectionEditorShell: {
    flex: 1,
    minHeight: 620,
    position: "relative",
    overflow: "hidden",
  },
  sectionEditorScroll: {
    flex: 1,
  },
  sectionEditorContent: {
    gap: spacing.md,
  },
  stickySectionActions: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.bgElev,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  stickyActionButtons: {
    marginTop: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  stickySuccessText: {
    color: colors.success,
    ...font.small,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  sectionModeRoot: {
    gap: spacing.md,
  },
  mobileFormCard: {
    borderTopWidth: 0,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.bgElev,
    padding: spacing.md,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  mobileFieldStack: {
    gap: spacing.md,
  },
  mobileInfoCard: {
    gap: 5,
    backgroundColor: "#F8FBFF",
  },
  mobileInfoTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  mobileTwoCols: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  mobileInfoText: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
  },
  scholarGroupCard: {
    gap: spacing.md,
  },
  scholarGroupHead: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  scholarGroupTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  scholarGroupSub: {
    color: colors.textMuted,
    ...font.tiny,
    marginTop: 3,
    fontWeight: "800",
  },
  scholarTotalPill: {
    minWidth: 52,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  scholarTotalText: {
    ...font.bodyMd,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  scholarCompactList: {
    gap: spacing.sm,
  },
  scholarCompactRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingLeft: 12,
  },
  scholarCompactLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    lineHeight: 18,
  },
  scholarCompactInput: {
    width: 92,
  },
  currencyPill: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currencyPillText: {
    color: colors.primary,
    ...font.tiny,
    fontWeight: "900",
  },
  sectionModeTopRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTopBackButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  topTabs: {
    flex: 1,
    flexDirection: "row",
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: colors.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    padding: 4,
    gap: 4,
  },
  topTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 10,
  },
  topTabActive: {
    backgroundColor: colors.bgElev,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  topTabText: {
    color: colors.textDim,
    ...font.bodyMd,
    fontWeight: "800",
  },
  topTabTextActive: {
    color: colors.primary,
    fontWeight: "900",
  },
  topTabLine: {
    position: "absolute",
    left: 26,
    right: 26,
    bottom: 0,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  sectionCardList: {
    gap: spacing.md,
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    overflow: "hidden",
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ translateY: 1 }],
  },
  sectionMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sectionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  sectionCardTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sectionCardSubtitle: {
    color: colors.textDim,
    ...font.body,
    lineHeight: 22,
    marginTop: 5,
  },
  sectionStatusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  sectionStatusMissing: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECACA",
  },
  sectionStatusDone: {
    backgroundColor: "#EAF8EF",
    borderColor: "#BBF7D0",
  },
  sectionStatusText: {
    ...font.tiny,
    fontWeight: "900",
  },
  sectionStatusTextMissing: {
    color: colors.danger,
  },
  sectionStatusTextDone: {
    color: colors.success,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
  },
  helperWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  helperDots: {
    width: 3,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    opacity: 0.45,
  },
  sectionHelper: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
  },
  sectionActionButton: {
    minWidth: 104,
    minHeight: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  sectionActionButtonDone: {
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  sectionActionText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "900",
  },
  sectionActionTextDone: {
    color: colors.primary,
  },
  emptySectionCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptySectionTitle: {
    color: colors.text,
    ...font.h3,
    textAlign: "center",
  },
  emptySectionText: {
    color: colors.textDim,
    ...font.small,
    textAlign: "center",
    lineHeight: 19,
  },
});
