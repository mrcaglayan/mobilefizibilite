import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Scenario, User } from "@/src/api/client";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { TemelBilgilerDraft } from "@/src/scenario/temelBilgilerAdapter";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Input } from "@/src/ui/components";
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

type Props = {
  value: unknown;
  scenario: Scenario | null;
  user: User | null | undefined;
  currencyCode: string;
  canEdit: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: TemelBilgilerDraft) => Promise<void>;
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
}: Props) {
  const [draft, setDraft] = React.useState<TemelObject>(() => cloneTemel(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setDraft(cloneTemel(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, value]);

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
    ? "Degisiklikler yalniz Temel Bilgiler alanlarina field-level patch olarak kaydedilir."
    : disabledReason;

  return (
    <Card testID="temel-bilgiler-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Temel Bilgiler Editoru</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
            {canEdit ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

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

      <FormSection title="Program Turu">
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

      <FormSection title="Okul Egitim Bilgileri">
        <TextInputRow
          label="Egitim baslama tarihi"
          value={str(getDraft(draft, ["okulEgitimBilgileri", "egitimBaslamaTarihi"]))}
          disabled={!canEdit}
          placeholder="YYYY-MM-DD"
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

      <FormSection title="Rakip Analizi">
        {visibleCompetitors.map((row) => (
          <View key={row.key} style={styles.competitorBlock}>
            <Text style={styles.subhead}>{row.label}</Text>
            <View style={styles.competitorGrid}>
              {(["a", "b", "c"] as const).map((suffix) => (
                <MoneyRow
                  key={suffix}
                  compact
                  label={suffix.toUpperCase()}
                  currency={currencyCode}
                  value={num(getDraft(draft, ["rakipAnalizi", row.key, suffix], 0))}
                  disabled={!canEdit}
                  onChange={(next) => update(["rakipAnalizi", row.key, suffix], next)}
                />
              ))}
            </View>
          </View>
        ))}
      </FormSection>

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

      {message ? <Text style={styles.successText}>{message}</Text> : null}
      <View style={styles.actions}>
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
    </Card>
  );
}

function normalizeGrade(value: string, fallback: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (GRADE_OPTIONS.includes(raw)) return raw;
  return fallback;
}

function TextInputRow({
  label,
  value,
  onChange,
  disabled,
  compact,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  return (
    <FormRow label={label}>
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
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  unit?: string;
}) {
  return (
    <FormRow label={label}>
      <FinancialNumberInput
        value={value}
        unit={unit}
        disabled={disabled}
        onChange={(next) => onChange(num(next))}
      />
    </FormRow>
  );
}

function PercentRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <FormRow label={label}>
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
}: {
  label: string;
  value: number;
  currency: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.compactMoney : undefined}>
      <FormRow label={label}>
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
  compactInput: {
    textAlign: "center",
  },
  disabledInput: {
    color: colors.textMuted,
  },
  competitorBlock: {
    gap: spacing.sm,
  },
  competitorGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  compactMoney: {
    flex: 1,
  },
  subhead: {
    color: colors.text,
    ...font.bodyMd,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  successText: {
    color: colors.success,
    ...font.small,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
