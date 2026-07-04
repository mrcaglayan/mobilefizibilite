import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ApiError, Id, Scenario, api } from "@/src/api/client";
import { colors, font, formatInt, formatMoney, radius, spacing } from "@/src/theme";
import { BottomSheet } from "@/src/ui/BottomSheet";
import { Button, Card, Chip, Input, Row } from "@/src/ui/components";

type AnyRecord = Record<string, any>;
type Basis = "students" | "revenue";
type YearKey = "y1" | "y2" | "y3";
type YearBasis = "academic" | "start" | "end";

const EXPENSE_SECTIONS = [
  {
    id: "isletme",
    label: "Isletme",
    keys: [
      ["ulkeTemsilciligi", "Ulke temsilciligi"],
      ["genelYonetim", "Genel yonetim"],
      ["kira", "Kira"],
      ["emsalKira", "Emsal kira"],
      ["enerjiKantin", "Enerji / kantin"],
      ["turkPersonelMaas", "Turk personel maas"],
      ["turkDestekPersonelMaas", "Turk destek maas"],
      ["yerelPersonelMaas", "Yerel personel maas"],
      ["yerelDestekPersonelMaas", "Yerel destek maas"],
      ["internationalPersonelMaas", "International maas"],
      ["disaridanHizmet", "Disaridan hizmet"],
      ["egitimAracGerec", "Egitim arac gerec"],
      ["finansalGiderler", "Finansal gider"],
      ["egitimAmacliHizmet", "Egitim amacli hizmet"],
      ["temsilAgirlama", "Temsil agirlamalar"],
      ["ulkeIciUlasim", "Ulke ici ulasim"],
      ["ulkeDisiUlasim", "Ulke disi ulasim"],
      ["vergilerResmiIslemler", "Vergiler resmi islemler"],
      ["vergiler", "Vergiler"],
      ["demirbasYatirim", "Demirbas yatirim"],
      ["rutinBakim", "Rutin bakim"],
      ["pazarlamaOrganizasyon", "Pazarlama organizasyon"],
      ["reklamTanitim", "Reklam tanitim"],
      ["tahsilEdilemeyenGelirler", "Tahsil edilemeyen gelirler"],
    ],
  },
  {
    id: "hizmet",
    label: "Ogrenim disi",
    keys: [
      ["yemek", "Yemek"],
      ["uniforma", "Uniforma"],
      ["kitapKirtasiye", "Kitap kirtasiye"],
      ["ulasimServis", "Ulasim servis"],
    ],
  },
  {
    id: "yurt",
    label: "Yurt",
    keys: [
      ["yurtGiderleri", "Yurt giderleri"],
      ["digerYurt", "Diger yurt"],
    ],
  },
  { id: "indirim", label: "Burs/indirim", keys: [["discountsTotal", "Burs ve indirim toplam"]] },
] as const;

const EXPENSE_LABELS: Map<string, string> = new Map(
  EXPENSE_SECTIONS.flatMap((section) => section.keys.map(([key, label]) => [String(key), label] as const)),
);

function uniqIds(ids: Id[] = []) {
  return Array.from(new Set(ids.map((value) => String(value)).filter(Boolean)));
}

function parseAcademicYearParts(value?: string | null) {
  const raw = String(value || "").trim();
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) return { start: range[1], end: range[2] };
  const single = raw.match(/^(\d{4})$/);
  if (single) return { start: single[1], end: single[1] };
  return { start: "", end: "" };
}

function resolveTargetYear(academicYear?: string | null, yearBasis: YearBasis = "academic") {
  if (yearBasis === "academic") return String(academicYear || "").trim();
  const parts = parseAcademicYearParts(academicYear);
  return yearBasis === "start" ? parts.start : parts.end;
}

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.map((item) => (item && typeof item === "object" ? item as AnyRecord : {})) : [];
}

function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function errorData(error: unknown): AnyRecord {
  return error instanceof ApiError && error.data && typeof error.data === "object" ? error.data as AnyRecord : {};
}

function formatPct(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "-";
}

function splitLabel(value: unknown) {
  const key = String(value || "none");
  if (key === "ok") return "Dagitim OK";
  if (key === "stale") return "Dagitim eski";
  return "Dagitim yok";
}

function statusLabel(value: unknown) {
  const key = String(value || "");
  if (key === "approved") return "Kontrol edildi";
  if (key === "sent_for_approval") return "Merkeze iletildi";
  if (key === "revision_requested") return "Revizyon";
  if (key === "in_review") return "Incelemede";
  if (key === "draft") return "Taslak";
  return key || "-";
}

function CheckRow({
  checked,
  disabled,
  title,
  subtitle,
  onPress,
  testID,
}: {
  checked: boolean;
  disabled?: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.checkRow,
        checked && styles.checkRowActive,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? colors.primary : colors.textDim}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.checkTitle}>{title}</Text>
        {subtitle ? <Text style={styles.checkSub}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function WarningCard({ title, rows }: { title: string; rows?: AnyRecord[] }) {
  return (
    <Card style={styles.warnCard}>
      <View style={styles.inlineHead}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.warn} />
        <Text style={styles.warnTitle}>{title}</Text>
      </View>
      {rows?.length ? (
        <View style={{ marginTop: spacing.sm }}>
          {rows.slice(0, 6).map((row, index) => (
            <Text key={`${row.scenarioId || row.schoolId || index}`} style={styles.warnText}>
              {row.schoolName || "-"} / {row.scenarioName || row.name || "-"} {row.yearText ? `(${row.yearText})` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ConfirmCard({
  title,
  text,
  confirmLabel,
  busy,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card style={styles.confirmCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>{text}</Text>
      <View style={styles.actions}>
        <Button label="Vazgec" variant="secondary" small onPress={onCancel} disabled={busy} style={styles.flexBtn} />
        <Button
          label={confirmLabel}
          icon="checkmark-circle-outline"
          small
          onPress={onConfirm}
          loading={busy}
          disabled={disabled}
          style={styles.flexBtn}
        />
      </View>
    </Card>
  );
}

export function ExpenseDistributionSheet({
  visible,
  onClose,
  sourceScenario,
  sourceSchoolId,
  sourceSchoolName,
  onApplied,
  onReverted,
}: {
  visible: boolean;
  onClose: () => void;
  sourceScenario: Scenario | null;
  sourceSchoolId: Id | null;
  sourceSchoolName?: string | null;
  onApplied?: () => void;
  onReverted?: () => void;
}) {
  const [targets, setTargets] = React.useState<AnyRecord[]>([]);
  const [selectedTargets, setSelectedTargets] = React.useState<Set<string>>(new Set());
  const [selectedExpenseKeys, setSelectedExpenseKeys] = React.useState<Set<string>>(new Set());
  const [basis, setBasis] = React.useState<Basis>("students");
  const [basisYearKey, setBasisYearKey] = React.useState<YearKey>("y1");
  const [yearBasis, setYearBasis] = React.useState<YearBasis>("academic");
  const [targetSearch, setTargetSearch] = React.useState("");
  const [preview, setPreview] = React.useState<AnyRecord | null>(null);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"apply" | "revert" | null>(null);

  const sourceId = sourceScenario?.id;

  const payload = React.useMemo(
    () => ({
      targetScenarioIds: Array.from(selectedTargets).map((value) => Number(value)),
      basis,
      basisYearKey,
      expenseKeys: Array.from(selectedExpenseKeys),
    }),
    [basis, basisYearKey, selectedExpenseKeys, selectedTargets],
  );

  const load = React.useCallback(async () => {
    if (!visible || !sourceScenario || !sourceSchoolId) return;
    setLoading(true);
    setMessage("");
    setPreview(null);
    setConfirmAction(null);
    try {
      const targetYear = resolveTargetYear(sourceScenario.academic_year, yearBasis);
      const [targetsRaw, scopeRaw] = await Promise.allSettled([
        api.expenseSplitTargets(targetYear, yearBasis),
        api.getExpenseSplitLastScope(sourceSchoolId, sourceScenario.id),
      ]);
      const rows = targetsRaw.status === "fulfilled" ? asArray(targetsRaw.value) : [];
      const filtered = rows.filter((row) => String(row.scenarioId) !== String(sourceScenario.id));
      setTargets(filtered);

      if (scopeRaw.status === "fulfilled") {
        const scope = (scopeRaw.value as AnyRecord)?.scope || {};
        if (scope.basis === "students" || scope.basis === "revenue") setBasis(scope.basis);
        if (scope.basisYearKey === "y1" || scope.basisYearKey === "y2" || scope.basisYearKey === "y3") {
          setBasisYearKey(scope.basisYearKey);
        }
        const targetIds = new Set(filtered.map((row) => String(row.scenarioId)));
        const nextTargets = new Set<string>(
          Array.isArray(scope.targetScenarioIds)
            ? scope.targetScenarioIds.map(String).filter((value: string) => targetIds.has(value))
            : [],
        );
        const validExpenseKeys = new Set<string>(
          EXPENSE_SECTIONS.flatMap((section) => section.keys.map(([key]) => String(key))),
        );
        const nextExpenseKeys = new Set<string>(
          Array.isArray(scope.expenseKeys)
            ? scope.expenseKeys.map(String).filter((value: string) => validExpenseKeys.has(value))
            : [],
        );
        setSelectedTargets(nextTargets);
        setSelectedExpenseKeys(nextExpenseKeys);
      } else {
        setSelectedTargets(new Set());
        setSelectedExpenseKeys(new Set());
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, "Dagitim bilgileri yuklenemedi."));
    } finally {
      setLoading(false);
    }
  }, [sourceScenario, sourceSchoolId, visible, yearBasis]);

  React.useEffect(() => {
    if (!visible) return;
    setSelectedTargets(new Set());
    setSelectedExpenseKeys(new Set());
    setBasis("students");
    setBasisYearKey("y1");
    setTargetSearch("");
    load();
  }, [load, sourceId, visible]);

  React.useEffect(() => {
    if (!visible) return;
    setPreview(null);
    setConfirmAction(null);
  }, [basis, basisYearKey, selectedExpenseKeys, selectedTargets, visible]);

  const filteredTargets = React.useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((row) =>
      `${row.schoolName || ""} ${row.scenarioName || ""} ${row.academicYear || ""}`.toLowerCase().includes(q),
    );
  }, [targetSearch, targets]);

  const previewTargets = asArray(preview?.targets);
  const previewPools = asArray(preview?.pools);
  const previewWarnings = Array.isArray(preview?.warnings) ? preview.warnings.map(String) : [];
  const hasStaleExisting = Boolean(sourceScenario?.expense_split_stale);

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, idValue: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(idValue)) next.delete(idValue);
      else next.add(idValue);
      return next;
    });
  }

  async function handlePreview() {
    if (!sourceSchoolId || !sourceScenario) return;
    if (!payload.targetScenarioIds.length || !payload.expenseKeys.length) {
      setMessage("Once hedef senaryo ve gider kalemi secin.");
      return;
    }
    setPreviewing(true);
    setMessage("");
    setConfirmAction(null);
    try {
      const data = await api.previewExpenseSplit(sourceSchoolId, sourceScenario.id, payload);
      setPreview(data as AnyRecord);
    } catch (error) {
      setMessage(apiErrorMessage(error, "Onizleme alinamadi."));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!sourceSchoolId || !sourceScenario) return;
    if (!preview) {
      setMessage("Uygulamadan once onizleme alin.");
      return;
    }
    if (confirmAction !== "apply") {
      setConfirmAction("apply");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.applyExpenseSplit(sourceSchoolId, sourceScenario.id, payload);
      setMessage("Gider dagitimi uygulandi.");
      onApplied?.();
      onClose();
    } catch (error) {
      setMessage(apiErrorMessage(error, "Dagitim uygulanamadi."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert() {
    if (!sourceSchoolId || !sourceScenario) return;
    if (!selectedTargets.size) {
      setMessage("Geri almak icin hedef senaryo secin.");
      return;
    }
    if (confirmAction !== "revert") {
      setConfirmAction("revert");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.revertExpenseSplit(sourceSchoolId, sourceScenario.id, {
        targetScenarioIds: Array.from(selectedTargets).map((value) => Number(value)),
      });
      setMessage("Gider dagitimi geri alindi.");
      onReverted?.();
      await load();
    } catch (error) {
      setMessage(apiErrorMessage(error, "Geri alma basarisiz."));
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={busy ? () => undefined : onClose} title="Gider Paylastir" testID="expense-distribution-sheet">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.cardTitle}>{sourceScenario?.name || "Senaryo"}</Text>
          <Text style={styles.cardSub}>
            {sourceSchoolName || "-"} / {sourceScenario?.academic_year || "-"}
          </Text>
        </Card>

        {hasStaleExisting ? (
          <WarningCard title="Bu senaryodaki mevcut gider dagitimi eski. Yeni onizleme almadan uygulama yapilamaz." />
        ) : null}

        <Card>
          <Text style={styles.cardTitle}>Dagitim Ayarlari</Text>
          <Text style={styles.groupLabel}>Baz</Text>
          <View style={styles.chipRow}>
            <Chip label="Ogrenci" active={basis === "students"} onPress={() => setBasis("students")} />
            <Chip label="Gelir" active={basis === "revenue"} onPress={() => setBasis("revenue")} />
          </View>
          <Text style={styles.groupLabel}>Yil</Text>
          <View style={styles.chipRow}>
            {(["y1", "y2", "y3"] as YearKey[]).map((key) => (
              <Chip key={key} label={key.toUpperCase()} active={basisYearKey === key} onPress={() => setBasisYearKey(key)} />
            ))}
          </View>
          <Text style={styles.groupLabel}>Akademik yil esleme</Text>
          <View style={styles.chipRow}>
            <Chip label="Ayrik" active={yearBasis === "academic"} onPress={() => setYearBasis("academic")} />
            <Chip label="Baslangic" active={yearBasis === "start"} onPress={() => setYearBasis("start")} />
            <Chip label="Bitis" active={yearBasis === "end"} onPress={() => setYearBasis("end")} />
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Hedefler</Text>
          <Input label="Ara" value={targetSearch} onChangeText={setTargetSearch} placeholder="Okul veya senaryo" />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {filteredTargets.slice(0, 30).map((row) => {
            const key = String(row.scenarioId);
            return (
              <CheckRow
                key={key}
                checked={selectedTargets.has(key)}
                title={String(row.schoolName || "-")}
                subtitle={`${row.scenarioName || "-"} / ${row.academicYear || row.academic_year || "-"}`}
                onPress={() => toggleSet(setSelectedTargets, key)}
              />
            );
          })}
          {filteredTargets.length > 30 ? <Text style={styles.cardSub}>Ilk 30 hedef gosteriliyor. Arama ile daraltin.</Text> : null}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Gider Kalemleri</Text>
          {EXPENSE_SECTIONS.map((section) => {
            const sectionKeys = section.keys.map(([key]) => key);
            const selected = sectionKeys.filter((key) => selectedExpenseKeys.has(key)).length;
            const allSelected = selected === sectionKeys.length;
            return (
              <View key={section.id} style={styles.sectionBlock}>
                <View style={styles.inlineHead}>
                  <Text style={styles.groupTitle}>{section.label}</Text>
                  <Button
                    label={allSelected ? "Temizle" : "Sec"}
                    variant="secondary"
                    small
                    onPress={() => {
                      setSelectedExpenseKeys((prev) => {
                        const next = new Set(prev);
                        sectionKeys.forEach((key) => {
                          if (allSelected) next.delete(key);
                          else next.add(key);
                        });
                        return next;
                      });
                    }}
                  />
                </View>
                {section.keys.map(([key, label]) => (
                  <CheckRow
                    key={key}
                    checked={selectedExpenseKeys.has(key)}
                    title={label}
                    onPress={() => toggleSet(setSelectedExpenseKeys, key)}
                  />
                ))}
              </View>
            );
          })}
        </Card>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Button
          label="Onizleme Al"
          icon="eye-outline"
          onPress={handlePreview}
          loading={previewing}
          disabled={!selectedTargets.size || !selectedExpenseKeys.size || busy}
        />

        {preview ? (
          <Card>
            <Text style={styles.cardTitle}>Onizleme</Text>
            <Row label="Hedef" value={formatInt(previewTargets.length)} />
            <Row label="Gider havuzu" value={formatInt(previewPools.length)} />
            {previewWarnings.map((warning, index) => (
              <Text key={`${warning}-${index}`} style={styles.warnText}>{warning}</Text>
            ))}
            {previewPools.slice(0, 8).map((pool, index) => (
              <Row
                key={`${pool.expenseKey || index}`}
                label={EXPENSE_LABELS.get(String(pool.expenseKey)) || String(pool.expenseKey || "-")}
                value={formatMoney(Number(pool.poolAmount || 0), sourceScenario?.input_currency === "LOCAL" ? sourceScenario.local_currency_code || "LOCAL" : "USD")}
              />
            ))}
            {previewTargets.slice(0, 8).map((target, index) => (
              <Row
                key={`${target.targetScenarioId || index}`}
                label={`${target.schoolName || "-"} / ${target.scenarioName || "-"}`}
                value={`${formatInt(Number(target.basisValue || 0))} / ${Number(target.weight || 0).toFixed(3)}`}
              />
            ))}
          </Card>
        ) : null}

        {confirmAction === "apply" ? (
          <ConfirmCard
            title="Dagitimi uygula?"
            text="Bu islem secili hedefler icin yeni gider dagitim kaydi olusturur. Onizleme sonucu disinda sessiz uygulama yapilmaz."
            confirmLabel="Evet, Uygula"
            busy={busy}
            onCancel={() => setConfirmAction(null)}
            onConfirm={handleApply}
          />
        ) : null}
        {confirmAction === "revert" ? (
          <ConfirmCard
            title="Dagitimi geri al?"
            text="Secili hedefler en son dagitim setinden kaldirilacak. Bu islem geri alinmadan once onay ister."
            confirmLabel="Evet, Geri Al"
            busy={busy}
            onCancel={() => setConfirmAction(null)}
            onConfirm={handleRevert}
          />
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Uygula"
            icon="git-branch-outline"
            onPress={handleApply}
            disabled={!preview || busy || previewing}
            loading={busy && confirmAction === "apply"}
            style={styles.flexBtn}
          />
          <Button
            label="Geri Al"
            icon="return-down-back-outline"
            variant="secondary"
            onPress={handleRevert}
            disabled={!selectedTargets.size || busy || previewing}
            loading={busy && confirmAction === "revert"}
            style={styles.flexBtn}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function BulkSendSheet({
  visible,
  onClose,
  schoolIds,
  onApplied,
}: {
  visible: boolean;
  onClose: () => void;
  schoolIds: Id[];
  onApplied?: () => void;
}) {
  const [preview, setPreview] = React.useState<AnyRecord | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const idsKey = uniqIds(schoolIds).sort().join(",");

  const loadPreview = React.useCallback(async () => {
    if (!visible || !idsKey) return;
    setLoading(true);
    setMessage("");
    setConfirming(false);
    try {
      const data = await api.bulkSendPreview(uniqIds(schoolIds));
      setPreview(data as AnyRecord);
      setSelected(new Set());
    } catch (error) {
      setMessage(apiErrorMessage(error, "Toplu gonderim onizlemesi alinamadi."));
    } finally {
      setLoading(false);
    }
  }, [idsKey, schoolIds, visible]);

  React.useEffect(() => {
    if (!visible) return;
    loadPreview();
  }, [loadPreview, visible]);

  const rows = asArray(preview?.rows);
  const staleSources = asArray(preview?.staleSources);
  const staleBlocked = Boolean(preview?.bulkDisabledDueToStaleSource);
  const selectedCount = selected.size;

  function selectEligible() {
    if (staleBlocked) return;
    setSelected(new Set(rows.filter((row) => row.eligible).map((row) => String(row.scenarioId))));
    setConfirming(false);
  }

  async function apply() {
    if (staleBlocked) {
      setMessage("Gider dagitimi eski olan kaynaklar varken toplu gonderim yapilamaz.");
      return;
    }
    if (!selected.size) {
      setMessage("Once en az bir uygun senaryo secin.");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data = await api.bulkSendApply(Array.from(selected));
      const results = asArray((data as AnyRecord)?.results);
      const failedRows = results.filter((row) => !row.ok);
      const failedReasons = failedRows
        .map((row) => {
          const targetName = [row.schoolName, row.scenarioName].filter(Boolean).join(" / ");
          const reason = row.reason || row.message || row.error || row.status || "";
          return reason ? `${targetName ? `${targetName}: ` : ""}${String(reason)}` : "";
        })
        .filter(Boolean)
        .slice(0, 3);
      const nextMessage = failedRows.length
        ? `${failedRows.length} satir gonderilemedi.${failedReasons.length ? ` Ilk hatalar: ${failedReasons.join(" | ")}` : ""}`
        : "Secili senaryolar merkeze iletildi.";
      setSelected(new Set());
      setConfirming(false);
      await loadPreview();
      setMessage(nextMessage);
      onApplied?.();
    } catch (error) {
      const data = errorData(error);
      if (data.bulkDisabledDueToStaleSource) {
        setPreview((prev) => ({
          ...(prev || {}),
          bulkDisabledDueToStaleSource: true,
          staleSources: asArray(data.staleSources),
        }));
      }
      setMessage(apiErrorMessage(error, "Toplu gonderim basarisiz."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={busy ? () => undefined : onClose} title="Toplu Merkeze Ilet" testID="bulk-send-sheet">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        {staleBlocked ? (
          <WarningCard title="Gider paylastirma guncel degil. Kaynak senaryolar guncellenmeden toplu gonderim yapilamaz." rows={staleSources} />
        ) : null}
        <View style={styles.actions}>
          <Button label="Onizleme" icon="eye-outline" variant="secondary" onPress={loadPreview} loading={loading} style={styles.flexBtn} />
          <Button label="Uygunlari Sec" icon="checkbox-outline" variant="secondary" onPress={selectEligible} disabled={loading || staleBlocked} style={styles.flexBtn} />
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {rows.map((row) => {
          const key = String(row.scenarioId);
          const reasons = Array.isArray(row.reasons) && row.reasons.length ? row.reasons.join(", ") : "Uygun";
          return (
            <CheckRow
              key={`${row.schoolId}-${key}`}
              checked={selected.has(key)}
              disabled={!row.eligible || staleBlocked}
              title={`${row.schoolName || "-"} / ${row.scenarioName || "-"}`}
              subtitle={`${row.yearText || row.academicYear || "-"} / ${statusLabel(row.status)} / ${formatPct(row.progress)} / ${splitLabel(row.splitStatus)} / ${reasons}`}
              onPress={() => {
                setConfirming(false);
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
            />
          );
        })}
        {confirming ? (
          <ConfirmCard
            title="Toplu gonderimi onayla?"
            text={`${selectedCount} senaryo merkeze iletilecek. Stale uyarilari varsa islem engellenir.`}
            confirmLabel="Evet, Gonder"
            busy={busy}
            disabled={staleBlocked}
            onCancel={() => setConfirming(false)}
            onConfirm={apply}
          />
        ) : null}
        <Button
          label={confirming ? "Onayi Tamamla" : "Secili Senaryolari Gonder"}
          icon="paper-plane-outline"
          onPress={apply}
          loading={busy}
          disabled={!selectedCount || staleBlocked || loading}
        />
      </ScrollView>
    </BottomSheet>
  );
}

export function CountryBatchSendSheet({
  visible,
  onClose,
  countryId,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  countryId: Id | null | undefined;
  onSent?: () => void;
}) {
  const [yearBasis, setYearBasis] = React.useState<YearBasis>("academic");
  const [years, setYears] = React.useState<string[]>([]);
  const [academicYear, setAcademicYear] = React.useState("");
  const [preview, setPreview] = React.useState<AnyRecord | null>(null);
  const [loadingYears, setLoadingYears] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const loadYears = React.useCallback(async () => {
    if (!visible || !countryId) return;
    setLoadingYears(true);
    setMessage("");
    setPreview(null);
    setConfirming(false);
    try {
      const data = await api.countryApprovalBatchYears(countryId, yearBasis);
      const list = Array.isArray((data as AnyRecord)?.years) ? (data as AnyRecord).years.map(String) : [];
      setYears(list);
      setAcademicYear((prev) => (prev && list.includes(prev) ? prev : list[0] || ""));
    } catch (error) {
      setYears([]);
      setAcademicYear("");
      setMessage(apiErrorMessage(error, "Yillar alinamadi."));
    } finally {
      setLoadingYears(false);
    }
  }, [countryId, visible, yearBasis]);

  React.useEffect(() => {
    if (!visible) return;
    loadYears();
  }, [loadYears, visible]);

  async function loadPreview() {
    if (!countryId || !academicYear.trim()) {
      setMessage("Once akademik yil secin.");
      return;
    }
    setPreviewing(true);
    setMessage("");
    setConfirming(false);
    try {
      const data = await api.countryApprovalBatchPreview(countryId, academicYear.trim(), yearBasis);
      setPreview(data as AnyRecord);
    } catch (error) {
      setMessage(apiErrorMessage(error, "Ulke onay paketi onizlemesi alinamadi."));
    } finally {
      setPreviewing(false);
    }
  }

  async function send() {
    if (!preview) {
      setMessage("Gondermeden once onizleme alin.");
      return;
    }
    if (preview.bulkDisabledDueToStaleSource) {
      setMessage("Gider dagitimi eski olan kaynaklar varken paket gonderilemez.");
      return;
    }
    if (!preview.canSubmit) {
      setMessage("Tum okullar uygun olmadan paket gonderilemez.");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.countryApprovalBatchSend(countryId!, academicYear.trim(), yearBasis);
      await loadPreview();
      setMessage("Ulke onay paketi gonderildi.");
      setConfirming(false);
      onSent?.();
    } catch (error) {
      const data = errorData(error);
      if (data.bulkDisabledDueToStaleSource) {
        setPreview((prev) => ({
          ...(prev || {}),
          bulkDisabledDueToStaleSource: true,
          staleSources: asArray(data.staleSources),
        }));
      }
      setMessage(apiErrorMessage(error, "Ulke onay paketi gonderilemedi."));
    } finally {
      setBusy(false);
    }
  }

  const rows = asArray(preview?.rows);
  const staleSources = asArray(preview?.staleSources);
  const staleBlocked = Boolean(preview?.bulkDisabledDueToStaleSource);

  return (
    <BottomSheet visible={visible} onClose={busy ? () => undefined : onClose} title="Ulke Onay Paketi" testID="country-batch-send-sheet">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.cardTitle}>Yil Secimi</Text>
          <View style={styles.chipRow}>
            <Chip label="Ayrik" active={yearBasis === "academic"} onPress={() => setYearBasis("academic")} />
            <Chip label="Baslangic" active={yearBasis === "start"} onPress={() => setYearBasis("start")} />
            <Chip label="Bitis" active={yearBasis === "end"} onPress={() => setYearBasis("end")} />
          </View>
          {loadingYears ? <ActivityIndicator color={colors.primary} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {years.map((year) => (
              <Chip key={year} label={year} active={academicYear === year} onPress={() => {
                setAcademicYear(year);
                setPreview(null);
                setConfirming(false);
              }} />
            ))}
          </ScrollView>
        </Card>

        <Button
          label="Onizleme Al"
          icon="eye-outline"
          onPress={loadPreview}
          loading={previewing}
          disabled={!academicYear || busy}
        />

        {staleBlocked ? (
          <WarningCard title="Gider paylastirma guncel degil. Kaynak senaryolar guncellenmeden paket gonderilemez." rows={staleSources} />
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {preview ? (
          <Card>
            <Text style={styles.cardTitle}>Onizleme</Text>
            <Row label="Uygun" value={preview.canSubmit ? "Evet" : "Hayir"} color={preview.canSubmit ? colors.success : colors.warn} />
            <Row label="Satir" value={formatInt(rows.length)} />
            {rows.map((row) => {
              const reasons = Array.isArray(row.reasons) && row.reasons.length ? row.reasons.join(", ") : "Uygun";
              return (
                <View key={`${row.schoolId}-${row.scenarioId || "none"}`} style={styles.previewRow}>
                  <Text style={styles.previewTitle}>{row.schoolName || "-"}</Text>
                  <Text style={styles.previewSub}>
                    {row.scenarioName || "-"} / {row.academicYear || row.yearText || "-"} / {statusLabel(row.status)}
                  </Text>
                  <Text style={[styles.previewSub, { color: row.eligible ? colors.success : colors.warn }]}>
                    {row.eligible ? "Uygun" : reasons}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {confirming ? (
          <ConfirmCard
            title="Ulke paketini gonder?"
            text={`${academicYear} icin tum uygun okullar merkeze toplu paket olarak iletilecek.`}
            confirmLabel="Evet, Gonder"
            busy={busy}
            disabled={staleBlocked || !preview?.canSubmit}
            onCancel={() => setConfirming(false)}
            onConfirm={send}
          />
        ) : null}
        <Button
          label={confirming ? "Onayi Tamamla" : "Paketi Gonder"}
          icon="paper-plane-outline"
          onPress={send}
          loading={busy}
          disabled={!preview || staleBlocked || !preview?.canSubmit || previewing}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  cardTitle: { color: colors.text, ...font.h3 },
  cardSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  groupLabel: { color: colors.textMuted, ...font.tiny, textTransform: "uppercase", marginTop: spacing.md },
  groupTitle: { color: colors.text, ...font.bodyMd, fontWeight: "800" },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    marginTop: spacing.sm,
  },
  checkRowActive: {
    borderColor: colors.primary,
    backgroundColor: "#F5B30118",
  },
  checkTitle: { color: colors.text, ...font.bodyMd },
  checkSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  inlineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  warnCard: {
    backgroundColor: "#F9731620",
    borderColor: "#F9731655",
  },
  warnTitle: { color: colors.warn, ...font.bodyMd, fontWeight: "800", flex: 1 },
  warnText: { color: colors.warn, ...font.small, marginTop: 3 },
  message: { color: colors.textDim, ...font.small },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  flexBtn: { flex: 1 },
  confirmCard: {
    borderColor: colors.primary,
    backgroundColor: "#F5B30118",
  },
  previewRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewTitle: { color: colors.text, ...font.bodyMd, fontWeight: "800" },
  previewSub: { color: colors.textDim, ...font.small, marginTop: 2 },
});
