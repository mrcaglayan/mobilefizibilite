import React from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { Id, Report, Scenario, api } from "@/src/api/client";
import { colors, font, formatInt, formatMoney, formatPct, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, Row } from "@/src/ui/components";

export type ReportMode = "original" | "distributed";
export type ReportCurrency = "usd" | "local";
type ExportFormat = "xlsx" | "pdf";

type ReportPanelProps = {
  report: Report | null;
  loading: boolean;
  onReload: () => void;
  onCalculate: () => void;
  calculating: boolean;
  requiresCalculation: boolean;
  currency: string;
  scenario: Scenario | null;
  schoolId?: Id | null;
  scenarioId?: Id | null;
  mode: ReportMode;
  onModeChange: (mode: ReportMode) => void;
  reportCurrency: ReportCurrency;
  onReportCurrencyChange: (currency: ReportCurrency) => void;
};

type DetailedReportPanelProps = {
  report: Report | null;
  loading: boolean;
  onReload: () => void;
  onCalculate: () => void;
  calculating: boolean;
  requiresCalculation: boolean;
  currency: string;
  scenario: Scenario | null;
  mode: ReportMode;
  onModeChange: (mode: ReportMode) => void;
  reportCurrency: ReportCurrency;
  onReportCurrencyChange: (currency: ReportCurrency) => void;
};

type YearKey = "y1" | "y2" | "y3";
type YearRow = {
  key: string;
  label: string;
  values: [unknown, unknown, unknown];
  strong?: boolean;
  final?: boolean;
  percent?: boolean;
};

const YEAR_KEYS: YearKey[] = ["y1", "y2", "y3"];

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function reportResults(report: Report | null) {
  if (!report) return null;
  const raw = asObject(report.raw);
  const results = parseMaybeJson(raw.results ?? report.raw);
  return results && typeof results === "object" ? asObject(results) : null;
}

function reportYears(report: Report | null) {
  const results = reportResults(report);
  if (!results) return {};
  const years = asObject(results.years);
  return Object.keys(years).length ? years : { y1: results };
}

function availableYears(report: Report | null): YearKey[] {
  const years = reportYears(report);
  const keys = YEAR_KEYS.filter((key) => years[key]);
  return keys.length ? keys : ["y1"];
}

function yearObj(report: Report | null, yearKey: YearKey) {
  return asObject(reportYears(report)[yearKey]);
}

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR");
}

function canShowLocalCurrency(scenario: Scenario | null) {
  return (
    scenario?.input_currency === "LOCAL" &&
    num(scenario?.fx_usd_to_local) > 0 &&
    Boolean(scenario?.local_currency_code)
  );
}

function displayCurrencyCode(scenario: Scenario | null, fallback: string, reportCurrency: ReportCurrency) {
  if (reportCurrency === "local" && canShowLocalCurrency(scenario)) {
    return scenario?.local_currency_code || fallback;
  }
  return "USD";
}

function moneyValue(value: unknown, scenario: Scenario | null, reportCurrency: ReportCurrency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (reportCurrency === "local" && canShowLocalCurrency(scenario)) {
    return n * num(scenario?.fx_usd_to_local);
  }
  return n;
}

function formatReportMoney(value: unknown, scenario: Scenario | null, fallback: string, reportCurrency: ReportCurrency) {
  return formatMoney(moneyValue(value, scenario, reportCurrency), displayCurrencyCode(scenario, fallback, reportCurrency));
}

function formatReportPct(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return formatPct(Math.abs(n) <= 1 ? n * 100 : n);
}

function labelForYear(scenario: Scenario | null, yearKey: YearKey) {
  const match = String(scenario?.academic_year || "").match(/\d{4}/);
  const offset = yearKey === "y1" ? 0 : yearKey === "y2" ? 1 : 2;
  if (!match) return yearKey.toUpperCase();
  const start = Number(match[0]) + offset;
  return `${offset + 1}. Yil (${start}-${start + 1})`;
}

function getPnl(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).pnl);
}

function getIncome(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).income);
}

function getExpenses(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).expenses);
}

function getStudents(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).students);
}

function getKpis(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).kpis);
}

function getResult(report: Report | null, yearKey: YearKey) {
  return asObject(yearObj(report, yearKey).result);
}

function reportModeAvailable(report: Report | null, scenario: Scenario | null) {
  return Boolean(report?.distributionMeta || (scenario as Record<string, unknown> | null)?.expense_split_applied);
}

function buildSummaryRows(report: Report | null): YearRow[] {
  return [
    {
      key: "netIncome",
      label: "Net Toplam Gelir",
      values: YEAR_KEYS.map((key) => getIncome(report, key).netIncome) as [unknown, unknown, unknown],
    },
    {
      key: "netCiro",
      label: "Net Ciro",
      values: YEAR_KEYS.map((key) => getIncome(report, key).netActivityIncome) as [unknown, unknown, unknown],
    },
    {
      key: "expenses",
      label: "Toplam Gider",
      values: YEAR_KEYS.map((key) => getExpenses(report, key).totalExpenses) as [unknown, unknown, unknown],
    },
    {
      key: "netResult",
      label: "Net Sonuc",
      values: YEAR_KEYS.map((key) => getResult(report, key).netResult) as [unknown, unknown, unknown],
      final: true,
    },
    {
      key: "margin",
      label: "Kar Marji",
      values: YEAR_KEYS.map((key) => getKpis(report, key).profitMargin) as [unknown, unknown, unknown],
      percent: true,
    },
  ];
}

function buildPnlRows(report: Report | null): YearRow[] {
  const values = (field: string) => YEAR_KEYS.map((key) => getPnl(report, key)[field]) as [unknown, unknown, unknown];
  const incomeValues = (field: string) => YEAR_KEYS.map((key) => getIncome(report, key)[field]) as [unknown, unknown, unknown];
  return [
    { key: "grossSales", label: "A. Brut Satislar", values: values("grossSales"), strong: true },
    { key: "grossTuition", label: "Egitim Geliri", values: incomeValues("grossTuition") },
    { key: "nonEducationFeesTotal", label: "Ogrenim Disi Gelir", values: incomeValues("nonEducationFeesTotal") },
    { key: "dormitoryRevenuesTotal", label: "Yurt Geliri", values: incomeValues("dormitoryRevenuesTotal") },
    { key: "otherInstitutionIncomeTotal", label: "Diger Kurum Gelirleri", values: incomeValues("otherInstitutionIncomeTotal") },
    { key: "salesDiscounts", label: "B. Satis Indirimleri (-)", values: values("salesDiscounts"), strong: true },
    { key: "netSales", label: "C. Net Satislar", values: values("netSales"), strong: true },
    { key: "costOfSalesTotal", label: "D. Satislarin Maliyeti (-)", values: values("costOfSalesTotal"), strong: true },
    { key: "grossProfit", label: "Brut Satis Kari/Zarari", values: values("grossProfit"), strong: true },
    { key: "operatingTotal", label: "E. Faaliyet Giderleri (-)", values: values("operatingTotal"), strong: true },
    { key: "periodNetProfit", label: "Donem Net Kari/Zarari", values: values("periodNetProfit"), final: true },
  ];
}

function flaggedLines(report: Report | null, type: "errors" | "warnings") {
  return YEAR_KEYS.flatMap((key) => {
    const flags = asObject(yearObj(report, key).flags);
    const lines = Array.isArray(flags[type]) ? flags[type] : [];
    return lines.map((line) => `${key.toUpperCase()}: ${String(line)}`);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === "function") return btoa(binary);
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (maybeBuffer) return maybeBuffer.from(binary, "binary").toString("base64");
  throw new Error("Bu cihazda dosya kodlama destegi bulunamadi.");
}

function safeFileName(filename: string, fallback: string) {
  const raw = String(filename || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function saveBinaryToDevice(format: ExportFormat, binary: { data: ArrayBuffer; filename: string; contentType: string }) {
  const fallback = format === "pdf" ? "scenario-report.pdf" : "scenario-report.xlsx";
  const filename = safeFileName(binary.filename, fallback);

  if (Platform.OS === "web" && typeof document !== "undefined" && typeof URL !== "undefined") {
    const blob = new Blob([binary.data], { type: binary.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return `Indirme baslatildi: ${filename}`;
  }

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error("Dosya sistemi hazir degil.");
  const uri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(binary.data), {
    encoding: FileSystem.EncodingType.Base64,
  });
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) return `Dosya hazirlandi: ${filename}. Paylasim bu cihazda desteklenmiyor.`;
  await Sharing.shareAsync(uri, {
    mimeType: binary.contentType,
    dialogTitle: filename,
  });
  return `Dosya hazirlandi: ${filename}`;
}

function ReportControls({
  report,
  scenario,
  currency,
  mode,
  onModeChange,
  reportCurrency,
  onReportCurrencyChange,
  onReload,
  onCalculate,
  loading,
  calculating,
  onExport,
  exportBusy,
}: {
  report: Report | null;
  scenario: Scenario | null;
  currency: string;
  mode?: ReportMode;
  onModeChange?: (mode: ReportMode) => void;
  reportCurrency: ReportCurrency;
  onReportCurrencyChange: (currency: ReportCurrency) => void;
  onReload: () => void;
  onCalculate: () => void;
  loading: boolean;
  calculating: boolean;
  onExport?: (format: ExportFormat) => void;
  exportBusy?: ExportFormat | null;
}) {
  const showLocal = canShowLocalCurrency(scenario);
  const distributedAvailable = reportModeAvailable(report, scenario);
  return (
    <Card>
      <View style={styles.controlHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rapor Kontrolleri</Text>
          <Text style={styles.subtitle}>
            {report?.cached ? "Cache sonucu" : "Guncel sonuc"} / {dateLabel(report?.calculatedAt)}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label="Hesapla"
          icon="calculator-outline"
          small
          onPress={onCalculate}
          loading={calculating}
          disabled={calculating || loading}
          style={styles.actionButton}
        />
        <Button
          label="Yenile"
          icon="refresh-outline"
          small
          variant="secondary"
          onPress={onReload}
          loading={loading}
          disabled={calculating}
          style={styles.actionButton}
        />
      </View>

      {mode && onModeChange ? (
        <View style={styles.chipRow}>
          <Chip label="Original" active={mode === "original"} onPress={() => onModeChange("original")} />
          {distributedAvailable ? (
            <Chip label="Distributed" active={mode === "distributed"} onPress={() => onModeChange("distributed")} />
          ) : (
            <View style={styles.disabledChip}>
              <Text style={styles.disabledChipText}>Distributed yok</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.chipRow}>
        <Chip label="USD" active={reportCurrency === "usd"} onPress={() => onReportCurrencyChange("usd")} />
        {showLocal ? (
          <Chip
            label={scenario?.local_currency_code || currency}
            active={reportCurrency === "local"}
            onPress={() => onReportCurrencyChange("local")}
          />
        ) : null}
      </View>

      {onExport ? (
        <View style={styles.actions}>
          <Button
            label="XLSX"
            icon="download-outline"
            small
            variant="secondary"
            disabled={!report || exportBusy != null}
            loading={exportBusy === "xlsx"}
            onPress={() => onExport("xlsx")}
            style={styles.actionButton}
          />
          <Button
            label="PDF"
            icon="document-outline"
            small
            variant="secondary"
            disabled={!report || exportBusy != null}
            loading={exportBusy === "pdf"}
            onPress={() => onExport("pdf")}
            style={styles.actionButton}
          />
        </View>
      ) : null}
    </Card>
  );
}

function YearComparisonTable({
  title,
  rows,
  scenario,
  currency,
  reportCurrency,
}: {
  title: string;
  rows: YearRow[];
  scenario: Scenario | null;
  currency: string;
  reportCurrency: ReportCurrency;
}) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.tableLabel]}>Kalem</Text>
          {YEAR_KEYS.map((key) => (
            <Text key={key} style={styles.tableHeaderText}>{key.toUpperCase()}</Text>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.key} style={[styles.tableRow, row.final && styles.finalRow]}>
            <Text style={[styles.tableLabel, row.strong || row.final ? styles.strongText : null]} numberOfLines={2}>
              {row.label}
            </Text>
            {row.values.map((value, index) => (
              <Text key={`${row.key}-${index}`} style={[styles.tableValue, row.strong || row.final ? styles.strongText : null]}>
                {row.percent
                  ? formatReportPct(value)
                  : formatReportMoney(value, scenario, currency, reportCurrency)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
  scenario,
  currency,
  reportCurrency,
}: {
  title: string;
  rows: { label: string; value: number }[];
  scenario: Scenario | null;
  currency: string;
  reportCurrency: ReportCurrency;
}) {
  const total = rows.reduce((sum, row) => sum + num(row.value), 0);
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <View style={{ marginTop: spacing.sm }}>
        {rows.length ? rows.map((row) => (
          <Row
            key={`${title}-${row.label}`}
            label={row.label}
            value={formatReportMoney(row.value, scenario, currency, reportCurrency)}
          />
        )) : <Text style={styles.emptyText}>Dagilim verisi yok.</Text>}
        <Row label="Toplam" value={formatReportMoney(total, scenario, currency, reportCurrency)} strong />
      </View>
    </Card>
  );
}

function KpiGrid({
  report,
  scenario,
  currency,
  reportCurrency,
}: {
  report: Report;
  scenario: Scenario | null;
  currency: string;
  reportCurrency: ReportCurrency;
}) {
  const kpis = report.kpis || {};
  const cards = [
    { label: "Toplam Gelir", value: formatReportMoney(kpis.toplamGelir, scenario, currency, reportCurrency), icon: "trending-up-outline" as const },
    { label: "Toplam Gider", value: formatReportMoney(kpis.toplamGider, scenario, currency, reportCurrency), icon: "trending-down-outline" as const },
    { label: "Faaliyet Kari", value: formatReportMoney(kpis.faaliyetKari, scenario, currency, reportCurrency), icon: "analytics-outline" as const },
    { label: "Kar Marji", value: formatPct(num(kpis.karMarji)), icon: "pie-chart-outline" as const },
    { label: "Ogrenci", value: formatInt(num(kpis.aktifOgrenci)), icon: "people-outline" as const },
    { label: "Doluluk", value: formatPct(num(kpis.doluluk)), icon: "speedometer-outline" as const },
  ];
  return (
    <Card>
      <Text style={styles.title}>KPI Ozeti</Text>
      <View style={styles.kpiGrid}>
        {cards.map((item) => (
          <View key={item.label} style={styles.kpiCard}>
            <Ionicons name={item.icon} size={18} color={colors.primary} />
            <Text style={styles.kpiLabel}>{item.label}</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>{item.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function FlagsCard({ report }: { report: Report | null }) {
  const errors = flaggedLines(report, "errors");
  const warnings = flaggedLines(report, "warnings");
  if (!errors.length && !warnings.length) return null;
  return (
    <Card>
      <Text style={styles.title}>Rapor Uyarilari</Text>
      {[...errors, ...warnings].slice(0, 8).map((line) => (
        <View key={line} style={styles.warningLine}>
          <Ionicons name={errors.includes(line) ? "alert-circle-outline" : "warning-outline"} size={15} color={errors.includes(line) ? colors.danger : colors.warn} />
          <Text style={styles.warningText}>{line}</Text>
        </View>
      ))}
    </Card>
  );
}

function ActiveYearDetails({
  report,
  scenario,
  currency,
  reportCurrency,
}: {
  report: Report | null;
  scenario: Scenario | null;
  currency: string;
  reportCurrency: ReportCurrency;
}) {
  const [activeYear, setActiveYear] = React.useState<YearKey>("y1");
  const available = availableYears(report);
  React.useEffect(() => {
    if (!available.includes(activeYear)) setActiveYear(available[0] || "y1");
  }, [activeYear, available]);

  const students = getStudents(report, activeYear);
  const income = getIncome(report, activeYear);
  const expenses = getExpenses(report, activeYear);
  const result = getResult(report, activeYear);
  const services = Array.isArray(expenses.nonTuitionServicesBreakdown) ? expenses.nonTuitionServicesBreakdown.map(asObject) : [];
  return (
    <Card>
      <View style={styles.controlHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Yil Detayi</Text>
          <Text style={styles.subtitle}>{labelForYear(scenario, activeYear)}</Text>
        </View>
      </View>
      <View style={styles.chipRow}>
        {available.map((key) => (
          <Chip key={key} label={key.toUpperCase()} active={activeYear === key} onPress={() => setActiveYear(key)} />
        ))}
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <Row label="Kapasite" value={formatInt(num(students.schoolCapacity))} />
        <Row label="Toplam ogrenci" value={formatInt(num(students.totalStudents))} />
        <Row label="Doluluk" value={formatReportPct(students.utilizationRate)} />
        <Row label="Net gelir" value={formatReportMoney(income.netIncome, scenario, currency, reportCurrency)} />
        <Row label="Toplam gider" value={formatReportMoney(expenses.totalExpenses, scenario, currency, reportCurrency)} />
        <Row label="Net sonuc" value={formatReportMoney(result.netResult, scenario, currency, reportCurrency)} strong />
      </View>

      {services.length ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.subtitle}>Ogrenim disi maliyet detaylari</Text>
          {services.slice(0, 8).map((row, index) => {
            const total = Number.isFinite(Number(row.total)) ? row.total : num(row.studentCount) * num(row.unitCost);
            return (
              <Row
                key={`${row.key || index}`}
                label={String(row.label || row.key || `Kalem ${index + 1}`)}
                value={`${formatInt(num(row.studentCount))} / ${formatReportMoney(total, scenario, currency, reportCurrency)}`}
              />
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

export function ScenarioReportPanel({
  report,
  loading,
  onReload,
  onCalculate,
  calculating,
  requiresCalculation,
  currency,
  scenario,
  schoolId,
  scenarioId,
  mode,
  onModeChange,
  reportCurrency,
  onReportCurrencyChange,
}: ReportPanelProps) {
  const [exportBusy, setExportBusy] = React.useState<ExportFormat | null>(null);
  const [exportMessage, setExportMessage] = React.useState("");

  React.useEffect(() => {
    if (reportCurrency === "local" && !canShowLocalCurrency(scenario)) {
      onReportCurrencyChange("usd");
    }
  }, [onReportCurrencyChange, reportCurrency, scenario]);

  async function handleExport(format: ExportFormat) {
    if (!schoolId || !scenarioId || exportBusy) return;
    setExportBusy(format);
    setExportMessage("");
    try {
      const binary = format === "pdf"
        ? await api.downloadPdf(schoolId, scenarioId, reportCurrency, mode)
        : await api.downloadXlsx(schoolId, scenarioId, reportCurrency, mode);
      const message = await saveBinaryToDevice(format, binary);
      setExportMessage(message);
    } catch (e: any) {
      setExportMessage(e?.message || "Export basarisiz.");
    } finally {
      setExportBusy(null);
    }
  }

  if (loading) {
    return <LoadingCard text="Rapor yukleniyor..." />;
  }

  if (!report) {
    return (
      <EmptyReportCard
        onReload={onReload}
        onCalculate={onCalculate}
        calculating={calculating}
        requiresCalculation={requiresCalculation}
      />
    );
  }

  if (report.disabledMessage) {
    return (
      <DisabledReportCard
        message={report.disabledMessage}
        onReload={onReload}
        onCalculate={onCalculate}
        calculating={calculating}
      />
    );
  }

  return (
    <>
      <ReportControls
        report={report}
        scenario={scenario}
        currency={currency}
        mode={mode}
        onModeChange={onModeChange}
        reportCurrency={reportCurrency}
        onReportCurrencyChange={onReportCurrencyChange}
        onReload={onReload}
        onCalculate={onCalculate}
        loading={loading}
        calculating={calculating}
        onExport={handleExport}
        exportBusy={exportBusy}
      />
      {mode === "distributed" && report.distributionMeta ? (
        <Card>
          <Text style={styles.title}>Dagitilmis Rapor</Text>
          <Text style={styles.emptyText}>
            Bu sonuc mevcut gider dagitim metadatasindan salt okunur olarak yuklendi. Dagitim olusturma/geri alma PR 08 kapsaminda.
          </Text>
        </Card>
      ) : null}
      {exportMessage ? (
        <Card>
          <Text style={exportMessage.includes("basarisiz") ? styles.errorText : styles.successText}>{exportMessage}</Text>
        </Card>
      ) : null}
      <KpiGrid report={report} scenario={scenario} currency={currency} reportCurrency={reportCurrency} />
      <YearComparisonTable
        title="Uc Yillik Ozet"
        rows={buildSummaryRows(report)}
        scenario={scenario}
        currency={currency}
        reportCurrency={reportCurrency}
      />
      <BreakdownCard
        title="Gelir Dagilimi"
        rows={report.gelirDagilim || []}
        scenario={scenario}
        currency={currency}
        reportCurrency={reportCurrency}
      />
      <BreakdownCard
        title="Gider Dagilimi"
        rows={report.giderDagilim || []}
        scenario={scenario}
        currency={currency}
        reportCurrency={reportCurrency}
      />
      <FlagsCard report={report} />
    </>
  );
}

export function ScenarioDetailedReportPanel({
  report,
  loading,
  onReload,
  onCalculate,
  calculating,
  requiresCalculation,
  currency,
  scenario,
  mode: reportMode,
  onModeChange,
  reportCurrency,
  onReportCurrencyChange,
}: DetailedReportPanelProps) {
  const [mode, setMode] = React.useState<"onepager" | "detailed">("detailed");

  React.useEffect(() => {
    if (reportCurrency === "local" && !canShowLocalCurrency(scenario)) {
      onReportCurrencyChange("usd");
    }
  }, [onReportCurrencyChange, reportCurrency, scenario]);

  if (loading) {
    return <LoadingCard text="Detayli rapor yukleniyor..." />;
  }

  if (!report) {
    return (
      <EmptyReportCard
        onReload={onReload}
        onCalculate={onCalculate}
        calculating={calculating}
        requiresCalculation={requiresCalculation}
        title="Detayli Rapor"
      />
    );
  }

  if (report.disabledMessage) {
    return (
      <DisabledReportCard
        message={report.disabledMessage}
        onReload={onReload}
        onCalculate={onCalculate}
        calculating={calculating}
      />
    );
  }

  return (
    <>
      <ReportControls
        report={report}
        scenario={scenario}
        currency={currency}
        mode={reportMode}
        onModeChange={onModeChange}
        reportCurrency={reportCurrency}
        onReportCurrencyChange={onReportCurrencyChange}
        onReload={onReload}
        onCalculate={onCalculate}
        loading={loading}
        calculating={calculating}
      />

      <Card>
        <Text style={styles.title}>Detayli Rapor</Text>
        <Text style={styles.subtitle}>Salt okunur mobil inceleme</Text>
        <View style={styles.chipRow}>
          <Chip label="Tek Sayfa" active={mode === "onepager"} onPress={() => setMode("onepager")} />
          <Chip label="Detayli" active={mode === "detailed"} onPress={() => setMode("detailed")} />
        </View>
      </Card>

      {mode === "onepager" ? (
        <>
          <KpiGrid report={report} scenario={scenario} currency={currency} reportCurrency={reportCurrency} />
          <YearComparisonTable
            title="Uc Yillik Ozet"
            rows={buildSummaryRows(report)}
            scenario={scenario}
            currency={currency}
            reportCurrency={reportCurrency}
          />
        </>
      ) : (
        <>
          <YearComparisonTable
            title="Gelir Tablosu"
            rows={buildPnlRows(report)}
            scenario={scenario}
            currency={currency}
            reportCurrency={reportCurrency}
          />
          <ActiveYearDetails
            report={report}
            scenario={scenario}
            currency={currency}
            reportCurrency={reportCurrency}
          />
          <FlagsCard report={report} />
        </>
      )}
    </>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <Card>
      <View style={styles.centerPad}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    </Card>
  );
}

function EmptyReportCard({
  onReload,
  onCalculate,
  calculating,
  requiresCalculation,
  title = "Rapor Durumu",
}: {
  onReload: () => void;
  onCalculate: () => void;
  calculating: boolean;
  requiresCalculation: boolean;
  title?: string;
}) {
  return (
    <Card>
      <View style={styles.centerPad}>
        <Ionicons name="pie-chart-outline" size={30} color={colors.textDim} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.emptyText}>
          {requiresCalculation
            ? "Kaydedilen degisikliklerden sonra rapor yeniden hesaplanmalidir."
            : "Rapor verisi henuz yuklenmedi."}
        </Text>
        <View style={styles.actions}>
          <Button
            label="Hesapla"
            icon="calculator-outline"
            onPress={onCalculate}
            loading={calculating}
            style={styles.actionButton}
          />
          <Button
            label="Raporu Yukle"
            icon="refresh-outline"
            variant="secondary"
            onPress={onReload}
            disabled={calculating || requiresCalculation}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Card>
  );
}

function DisabledReportCard({
  message,
  onReload,
  onCalculate,
  calculating,
}: {
  message: string;
  onReload: () => void;
  onCalculate: () => void;
  calculating: boolean;
}) {
  return (
    <Card>
      <View style={styles.centerPad}>
        <Ionicons name="alert-circle-outline" size={30} color={colors.warn} />
        <Text style={styles.title}>Rapor Kullanilamiyor</Text>
        <Text style={styles.emptyText}>{message}</Text>
        <View style={styles.actions}>
          <Button
            label="Hesapla"
            icon="calculator-outline"
            onPress={onCalculate}
            loading={calculating}
            style={styles.actionButton}
          />
          <Button
            label="Tekrar Dene"
            icon="refresh-outline"
            variant="secondary"
            onPress={onReload}
            disabled={calculating}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  centerPad: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  title: { color: colors.text, ...font.h3 },
  subtitle: { color: colors.textDim, ...font.small, marginTop: 4 },
  emptyText: { color: colors.textDim, ...font.body, textAlign: "center" },
  errorText: { color: colors.danger, ...font.small },
  successText: { color: colors.success, ...font.small },
  controlHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  disabledChip: {
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.55,
  },
  disabledChipText: { color: colors.textMuted, ...font.small, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: { flex: 1 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  kpiCard: {
    width: "48%",
    minHeight: 94,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  kpiLabel: { color: colors.textDim, ...font.small },
  kpiValue: { color: colors.text, ...font.mono },
  table: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.bgElev2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    flex: 1,
    color: colors.textDim,
    ...font.tiny,
    textAlign: "right",
    padding: spacing.sm,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableLabel: {
    flex: 1.35,
    textAlign: "left",
    color: colors.textDim,
    ...font.small,
    padding: spacing.sm,
  },
  tableValue: {
    flex: 1,
    color: colors.text,
    ...font.tiny,
    letterSpacing: 0,
    textAlign: "right",
    padding: spacing.sm,
  },
  strongText: { color: colors.text, fontWeight: "900" },
  finalRow: { backgroundColor: "#F5B30116" },
  warningLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  warningText: { color: colors.textDim, ...font.small, flex: 1 },
});
