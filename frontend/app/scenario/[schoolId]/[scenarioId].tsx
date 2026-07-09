// PR 03B scenario shell: production-safe workflow overview and gated actions.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  Id,
  Inputs,
  Report,
  Scenario,
  ScenarioContext,
  ScenarioProgressResponse,
  User,
  WorkItem,
  api,
} from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can, PermissionScope } from "@/src/auth/permissions";
import {
  areRequiredWorkItemsApproved,
  canForwardScenario,
  canReadWorkItem,
  canReviewWorkItems,
  canSubmitWorkItemState,
  canWriteWorkItem,
  buildModifiedResourcesFromPaths,
  getRequiredWorkIds,
  getSubmitResource,
  isHeadquarterScenario,
  type WorkId,
} from "@/src/scenario/workflow";
import { toDirtyInputPath } from "@/src/scenario/patch";
import { saveScenarioModule } from "@/src/scenario/saveHarness";
import {
  NormEditor,
  type NormSectionFilter,
  type NormSectionKey,
} from "@/src/scenario/NormEditor";
import {
  NORM_GRADE_KEYS,
  NORM_YEAR_KEYS,
  normGradesSaveAdapter,
  NormDraft,
  normalizeNormCurrentGrades,
  normalizeNormPlanningGrades,
} from "@/src/scenario/normGradesAdapter";
import {
  IkEditor,
  type IkSectionFilter,
  type IkSectionKey,
} from "@/src/scenario/IkEditor";
import {
  IK_ALL_ROLES,
  IK_LEVEL_DEFS,
  IK_YEAR_KEYS,
  ikSaveAdapter,
  IkDraft,
} from "@/src/scenario/ikAdapter";
import {
  GelirlerEditor,
  type GelirlerMobileSectionKey,
  type GelirlerSectionFilter,
} from "@/src/scenario/GelirlerEditor";
import {
  gelirlerSaveAdapter,
  GelirlerDraft,
} from "@/src/scenario/gelirlerAdapter";
import {
  discountsSaveAdapter,
  DiscountsDraft,
} from "@/src/scenario/discountsAdapter";
import {
  GiderlerEditor,
  GIDERLER_SECTION_LABELS_ROUTE,
  type GiderlerMobileSectionKey,
  type GiderlerSectionFilter,
} from "@/src/scenario/GiderlerEditor";
import {
  giderlerSaveAdapter,
  GiderlerDraft,
} from "@/src/scenario/giderlerAdapter";
import {
  KapasiteEditor,
  type KapasiteSectionFilter,
  type KapasiteSectionKey,
} from "@/src/scenario/KapasiteEditor";
import {
  kapasiteSaveAdapter,
  KapasiteDraft,
} from "@/src/scenario/kapasiteAdapter";
import {
  TemelBilgilerEditor,
  type TemelSectionFilter,
  type TemelSectionKey,
} from "@/src/scenario/TemelBilgilerEditor";
import {
  temelBilgilerSaveAdapter,
  TemelBilgilerDraft,
} from "@/src/scenario/temelBilgilerAdapter";
import {
  ScenarioDetailedReportPanel,
  ScenarioReportPanel,
  type ReportCurrency,
  type ReportMode,
} from "@/src/scenario/ReportPanels";
import { AppThemeColors, alpha, colors, font, formatInt, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import {
  Button,
  Card,
  GradientHeroCard,
  ProgressBar,
  Row,
  SectionHeader,
  StatusPill,
  type StatusTone,
} from "@/src/ui/components";
import { StickyBackHeader } from "@/src/ui/StickyBackHeader";

type ModuleKey = WorkId | "rapor" | "detayli_rapor";

type ProgressTab = {
  key: string;
  label?: string;
  pct?: number | null;
  done?: boolean;
  missingPreview?: string;
  missingLines?: string[];
};

type ProgressModel = {
  pct: number;
  completedCount?: number;
  totalCount?: number;
  tabs: ProgressTab[];
  missingDetailsLines: string[];
};

type ModuleDef = {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  workId?: WorkId;
  progressKeys: string[];
  readResource?: string;
};

type ActionBusy = "save" | "submit" | "approve" | "revise" | "send" | "calculate" | null;

const TEMEL_SECTION_LABELS: Record<TemelSectionKey, string> = {
  bolgeKampus: "Bölge / Ülke / Kampüs",
  programTuru: "Program Türü",
  okulEgitimBilgileri: "Okul Eğitim Bilgileri",
  kademeler: "Kademeler",
  okulUcretleri: "Okul Ücretleri",
  enflasyonParametreler: "Enflasyon ve Parametreler",
  ikMevcut: "İK Mevcut",
  bursIndirimler: "Burs ve İndirimler",
  rakipAnalizi: "Rakip Analizi",
  performans: "Performans",
  degerlendirme: "Değerlendirme",
};

const TEMEL_TOTAL_SECTIONS = 11;
const TEMEL_KADEME_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"] as const;
const TEMEL_FEE_ROWS = [
  { key: "okulOncesi", baseKey: "okulOncesi" },
  { key: "ilkokulYerel", baseKey: "ilkokul" },
  { key: "ilkokulInt", baseKey: "ilkokul" },
  { key: "ortaokulYerel", baseKey: "ortaokul" },
  { key: "ortaokulInt", baseKey: "ortaokul" },
  { key: "liseYerel", baseKey: "lise" },
  { key: "liseInt", baseKey: "lise" },
] as const;
const TEMEL_INFLATION_KEYS = ["expenseDeviationPct", "y2023", "y2024", "y2025", "y1", "y2", "y3", "currentSeasonAvgFee"] as const;
const TEMEL_IK_KEYS = [
  "turkPersonelYoneticiEgitimci",
  "turkPersonelTemsilcilik",
  "yerelKadroluEgitimci",
  "yerelUcretliVakaterEgitimci",
  "yerelDestek",
  "yerelTemsilcilik",
  "international",
] as const;
const TEMEL_SCHOLAR_KEYS = [
  "magisBasariBursu",
  "maarifYetenekBursu",
  "ihtiyacBursu",
  "okulBasariBursu",
  "tamEgitimBursu",
  "barinmaBursu",
  "turkceBasariBursu",
  "uluslararasiYukumlulukIndirimi",
  "vakifCalisaniIndirimi",
  "kardesIndirimi",
  "erkenKayitIndirimi",
  "pesinOdemeIndirimi",
  "kademeGecisIndirimi",
  "temsilIndirimi",
  "kurumIndirimi",
  "istisnaiIndirim",
  "yerelMevzuatIndirimi",
] as const;
const TEMEL_COMPETITOR_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"] as const;
const KAPASITE_SECTION_LABELS: Record<KapasiteSectionKey, string> = {
  kampusOzeti: "Kampüs Özeti",
  toplamlar: "Toplamlar",
  kademeKapasiteleri: "Kademe Kapasiteleri",
  gradePlanlama: "Grade Planlama",
};
const KAPASITE_TOTAL_SECTIONS = 4;
const NORM_SECTION_LABELS: Record<NormSectionKey, string> = {
  normOzeti: "Norm Ozeti",
  planlananDonem: "Planlanan Donem",
  mevcutDonem: "Mevcut Donem",
  dersDagilimi: "Ders Dagilimi",
};
const NORM_TOTAL_SECTIONS = 4;
const IK_SECTION_LABELS: Record<IkSectionKey, string> = {
  parametreler: "Parametreler",
  birimMaliyet: "Birim Isveren Maliyeti",
  personelSayilari: "Personel Sayilari",
  giderEslestirme: "Gider Eslestirme",
};
const IK_TOTAL_SECTIONS = 4;
const GELIRLER_SECTION_LABELS_ROUTE: Record<GelirlerMobileSectionKey, string> = {
  tuition: "Egitim Faaliyet Gelirleri",
  nonEducationFees: "Ogrenim Disi Ucretler",
  dormitory: "Yurt / Konaklama",
  otherInstitutionIncome: "Diger Kurum Gelirleri",
  brutGelirOzeti: "Brut Gelir Ozeti",
};
const GELIRLER_TOTAL_SECTIONS = 5;
const GIDERLER_TOTAL_SECTIONS = 5;

const MODULES: ModuleDef[] = [
  {
    key: "temel_bilgiler",
    label: "Temel Bilgiler",
    shortLabel: "Temel",
    icon: "document-text-outline",
    workId: "temel_bilgiler",
    progressKeys: ["temelBilgiler"],
  },
  {
    key: "kapasite",
    label: "Kapasite",
    shortLabel: "Kapasite",
    icon: "layers-outline",
    workId: "kapasite",
    progressKeys: ["kapasite"],
  },
  {
    key: "norm.ders_dagilimi",
    label: "Norm",
    shortLabel: "Norm",
    icon: "grid-outline",
    workId: "norm.ders_dagilimi",
    progressKeys: ["gradesPlan", "norm"],
  },
  {
    key: "ik.local_staff",
    label: "IK",
    shortLabel: "IK",
    icon: "people-outline",
    workId: "ik.local_staff",
    progressKeys: ["ik"],
  },
  {
    key: "gelirler.unit_fee",
    label: "Gelirler",
    shortLabel: "Gelir",
    icon: "trending-up-outline",
    workId: "gelirler.unit_fee",
    progressKeys: ["gelirler"],
  },
  {
    key: "giderler.isletme",
    label: "Giderler",
    shortLabel: "Gider",
    icon: "trending-down-outline",
    workId: "giderler.isletme",
    progressKeys: ["giderler", "discounts"],
  },
  {
    key: "rapor",
    label: "Rapor",
    shortLabel: "Rapor",
    icon: "pie-chart-outline",
    progressKeys: [],
    readResource: "page.rapor",
  },
  {
    key: "detayli_rapor",
    label: "Detayli Rapor",
    shortLabel: "Detay",
    icon: "document-outline",
    progressKeys: [],
    readResource: "page.detayli_rapor",
  },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function getNested(source: unknown, path: readonly string[], fallback: unknown = "") {
  let current: unknown = source;
  for (const key of path) {
    current = asObject(current)[key];
    if (current == null) return fallback;
  }
  return current == null ? fallback : current;
}

function hasTemelText(temel: Record<string, unknown>, path: readonly string[]) {
  return str(getNested(temel, path)).trim().length > 0;
}

function hasTemelPositive(temel: Record<string, unknown>, path: readonly string[]) {
  return num(getNested(temel, path, 0)) > 0;
}

function temelProgramType(temel: Record<string, unknown>, scenario?: Scenario | null) {
  return String(getNested(temel, ["programType"], scenario?.program_type || "local")).toLowerCase() === "international"
    ? "international"
    : "local";
}

function temelKademeEnabled(temel: Record<string, unknown>, key: string) {
  return asObject(getNested(temel, ["kademeler", key], {})).enabled !== false;
}

function temelKademeVisible(key: string, programType: string) {
  if (key === "okulOncesi") return true;
  if (key.endsWith("Yerel")) return programType === "local";
  if (key.endsWith("Int")) return programType === "international";
  return true;
}

function countTemelSections(inputs: Inputs | null | undefined, scenario: Scenario | null | undefined, user: User | null | undefined) {
  const temel = asObject(inputs?.temelBilgiler);
  const programType = temelProgramType(temel, scenario);
  const visibleFeeRows = TEMEL_FEE_ROWS.filter((row) => temelKademeEnabled(temel, row.baseKey) && temelKademeVisible(row.key, programType));
  const visibleCompetitors = TEMEL_COMPETITOR_KEYS.filter((key) => temelKademeEnabled(temel, key));
  const sectionDone = [
    Boolean(user?.region || user?.country_name || scenario?.name) &&
      hasTemelText(temel, ["yetkililer", "mudur"]) &&
      hasTemelText(temel, ["yetkililer", "ulkeTemsilcisi"]) &&
      hasTemelText(temel, ["yetkililer", "raporuHazirlayan"]),
    Boolean(programType),
    hasTemelText(temel, ["okulEgitimBilgileri", "egitimBaslamaTarihi"]) &&
      hasTemelText(temel, ["okulEgitimBilgileri", "zorunluEgitimDonemleri"]) &&
      hasTemelPositive(temel, ["okulEgitimBilgileri", "birDersSuresiDakika"]) &&
      hasTemelPositive(temel, ["okulEgitimBilgileri", "gunlukDersSaati"]) &&
      hasTemelPositive(temel, ["okulEgitimBilgileri", "haftalikDersSaatiToplam"]),
    TEMEL_KADEME_KEYS.some((key) => temelKademeEnabled(temel, key) && hasTemelText(temel, ["kademeler", key, "from"]) && hasTemelText(temel, ["kademeler", key, "to"])),
    Boolean(getNested(temel, ["okulUcretleriHesaplama"], false)) &&
      visibleFeeRows.every((row) => hasTemelPositive(temel, ["ucretArtisOranlari", row.key])),
    TEMEL_INFLATION_KEYS.every((key) => hasTemelPositive(temel, ["inflation", key])),
    TEMEL_IK_KEYS.some((key) => hasTemelPositive(temel, ["ikMevcut", key])),
    TEMEL_SCHOLAR_KEYS.some((key) => hasTemelPositive(temel, ["bursIndirimOgrenciSayilari", key])),
    visibleCompetitors.every((key) =>
      (["a", "b", "c"] as const).some((suffix) => hasTemelPositive(temel, ["rakipAnalizi", key, suffix])),
    ),
    hasTemelPositive(temel, ["performans", "prevYearRealizedFxUsdToLocal"]) &&
      hasTemelPositive(temel, ["performans", "gerceklesen", "ogrenciSayisi"]) &&
      hasTemelPositive(temel, ["performans", "gerceklesen", "gelirler"]) &&
      hasTemelPositive(temel, ["performans", "gerceklesen", "giderler"]),
    hasTemelText(temel, ["degerlendirme"]),
  ];
  const done = sectionDone.filter(Boolean).length;
  return { missing: Math.max(0, TEMEL_TOTAL_SECTIONS - done), done };
}

function getKapasiteCell(kapasite: Record<string, unknown>, kademeKey: string, periodKey: string) {
  const modern = getNested(kapasite, ["byKademe", kademeKey, "caps", periodKey], null);
  if (modern != null) return modern;
  return getNested(kapasite, ["byKademe", kademeKey, periodKey], 0);
}

function countKapasiteSections(inputs: Inputs | null | undefined, scenario: Scenario | null | undefined) {
  const kapasite = asObject(inputs?.kapasite);
  const temel = asObject(inputs?.temelBilgiler);
  const programType = temelProgramType(temel, scenario);
  const activeKademeler = TEMEL_KADEME_KEYS.filter((key) => temelKademeEnabled(temel, key) && temelKademeVisible(key, programType));
  const expectedKademeler = activeKademeler.length ? activeKademeler : TEMEL_KADEME_KEYS;
  const capacityDone = expectedKademeler.every((key) =>
    (["cur", "y1", "y2", "y3"] as const).every((period) => num(getKapasiteCell(kapasite, key, period)) > 0),
  );
  const done = 3 + (capacityDone ? 1 : 0);
  return { missing: Math.max(0, KAPASITE_TOTAL_SECTIONS - done), done };
}

function normGradeIndex(grade: string) {
  return NORM_GRADE_KEYS.indexOf(grade as (typeof NORM_GRADE_KEYS)[number]);
}

function normVisibleGrades(inputs: Inputs | null | undefined) {
  const temel = asObject(inputs?.temelBilgiler);
  const kademeler = asObject(temel.kademeler);
  const included = new Set<string>();
  TEMEL_KADEME_KEYS.forEach((key) => {
    const defaults =
      key === "okulOncesi" ? { from: "KG", to: "KG" } :
      key === "ilkokul" ? { from: "1", to: "5" } :
      key === "ortaokul" ? { from: "6", to: "9" } :
      { from: "10", to: "12" };
    const row = asObject(kademeler[key]);
    if (row.enabled === false) return;
    const from = normGradeIndex(str(row.from || defaults.from));
    const to = normGradeIndex(str(row.to || defaults.to));
    if (from < 0 || to < 0) return;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let index = start; index <= end; index += 1) {
      included.add(NORM_GRADE_KEYS[index]);
    }
  });
  const visible = NORM_GRADE_KEYS.filter((grade) => included.has(grade));
  return visible.length ? visible : [...NORM_GRADE_KEYS];
}

function countNormSections(inputs: Inputs | null | undefined, normValue: unknown) {
  const visibleGrades = normVisibleGrades(inputs);
  const gradesYears = normalizeNormPlanningGrades(inputs?.gradesYears, inputs?.grades);
  const gradesCurrent = normalizeNormCurrentGrades(inputs?.gradesCurrent);
  const planningDone = NORM_YEAR_KEYS.every((year) =>
    visibleGrades.every((grade) => {
      const row = gradesYears[year]?.find((item) => item.grade === grade);
      return num(row?.branchCount) > 0 && num(row?.studentsPerBranch) > 0;
    }),
  );
  const currentDone = visibleGrades.every((grade) => {
    const row = gradesCurrent.find((item) => item.grade === grade);
    return num(row?.branchCount) > 0 && num(row?.studentsPerBranch) > 0;
  });
  const norm = asObject(normValue);
  const years = asObject(norm.years);
  const summaryDone = NORM_YEAR_KEYS.every((year) => {
    const yearConfig = asObject(years[year]);
    const fallback = num(norm.teacherWeeklyMaxHours);
    return num(yearConfig.teacherWeeklyMaxHours || fallback || 24) > 0;
  });
  const y1 = asObject(years.y1 || norm);
  const curriculum = asObject(y1.curriculumWeeklyHours || norm.curriculumWeeklyHours);
  const lessonKeys = new Set<string>();
  visibleGrades.forEach((grade) => {
    Object.keys(asObject(curriculum[grade])).forEach((key) => lessonKeys.add(key));
  });
  const lessonsDone = lessonKeys.size > 0 && Array.from(lessonKeys).every((key) =>
    visibleGrades.every((grade) => num(asObject(curriculum[grade])[key]) > 0),
  );
  const done = [summaryDone, planningDone, currentDone, lessonsDone].filter(Boolean).length;
  return { missing: Math.max(0, NORM_TOTAL_SECTIONS - done), done };
}

function ikVisibleLevelKeys(inputs: Inputs | null | undefined, scenario: Scenario | null | undefined) {
  const temel = asObject(inputs?.temelBilgiler);
  const programType = temelProgramType(temel, scenario);
  const noKademeMode = TEMEL_KADEME_KEYS.every((key) => !temelKademeEnabled(temel, key));
  if (noKademeMode) return ["merkez"];
  return IK_LEVEL_DEFS.filter((level) => {
    if (level.key === "merkez") return false;
    if (level.kademeKey && !temelKademeEnabled(temel, level.kademeKey)) return false;
    return temelKademeVisible(level.key, programType);
  }).map((level) => level.key);
}

function getIkYearObject(ik: Record<string, unknown>, year: string) {
  const years = asObject(ik.years);
  const yearValue = asObject(years[year]);
  if (Object.keys(yearValue).length) return yearValue;
  return year === "y1" ? ik : {};
}

function getIkUnitCost(ik: Record<string, unknown>, roleKey: string) {
  const y1 = getIkYearObject(ik, "y1");
  return getNested(y1, ["unitCosts", roleKey], getNested(ik, ["unitCosts", roleKey], 0));
}

function countIkHeadcountForYear(ik: Record<string, unknown>, year: string, levelKeys: string[]) {
  const yearValue = getIkYearObject(ik, year);
  return levelKeys.reduce((sum, levelKey) => {
    return sum + IK_ALL_ROLES.reduce((roleSum, role) => {
      return roleSum + num(getNested(yearValue, ["headcountsByLevel", levelKey, role.key], 0));
    }, 0);
  }, 0);
}

function countIkSections(inputs: Inputs | null | undefined, scenario: Scenario | null | undefined) {
  const ik = asObject(inputs?.ik);
  const levelKeys = ikVisibleLevelKeys(inputs, scenario);
  const ratioDone = num(getNested(ik, ["unitCostRatio"], 1)) > 0;
  const unitCostsDone = IK_ALL_ROLES.every((role) => num(getIkUnitCost(ik, role.key)) > 0);
  const personnelDone = levelKeys.length > 0 && IK_YEAR_KEYS.every((year) => countIkHeadcountForYear(ik, year, levelKeys) > 0);
  const done = [ratioDone, unitCostsDone, personnelDone, true].filter(Boolean).length;
  return { missing: Math.max(0, IK_TOTAL_SECTIONS - done), done };
}

function gelirlerRows(inputs: Inputs | null | undefined, section: string) {
  return asArray(asObject(asObject(inputs?.gelirler)[section]).rows);
}

function gelirRowNumber(row: unknown, key: string) {
  return num(asObject(row)[key]);
}

function gelirManualStudentCount(row: unknown, yearKey: "y1" | "y2" | "y3") {
  const source = asObject(row);
  if (yearKey === "y1") return num(source.studentCount);
  const value = source[yearKey === "y2" ? "studentCountY2" : "studentCountY3"];
  return value == null ? num(source.studentCount) : num(value);
}

function countGelirlerSections(inputs: Inputs | null | undefined) {
  const gelirler = asObject(inputs?.gelirler);
  const tuitionRows = gelirlerRows(inputs, "tuition");
  const tuitionDone = tuitionRows.length > 0 && tuitionRows.every((row) => gelirRowNumber(row, "unitFee") > 0);
  const studentFeeSectionDone = (section: string) => {
    const rows = gelirlerRows(inputs, section);
    return rows.length > 0 && rows.every((row) =>
      gelirRowNumber(row, "unitFee") > 0 &&
      gelirManualStudentCount(row, "y1") > 0 &&
      gelirManualStudentCount(row, "y2") > 0 &&
      gelirManualStudentCount(row, "y3") > 0,
    );
  };
  const nonEducationDone = studentFeeSectionDone("nonEducationFees");
  const dormitoryDone = studentFeeSectionDone("dormitory");
  const otherRows = gelirlerRows(inputs, "otherInstitutionIncome");
  const otherDone = otherRows.length > 0 && otherRows.every((row) => gelirRowNumber(row, "amount") > 0) && num(gelirler.governmentIncentives) > 0;
  const done = [tuitionDone, nonEducationDone, dormitoryDone, otherDone, true].filter(Boolean).length;
  return { missing: Math.max(0, GELIRLER_TOTAL_SECTIONS - done), done };
}


function countGiderlerSections(inputs: Inputs | null | undefined) {
  const giderler = asObject(inputs?.giderler);
  const isletmeItems = asObject(asObject(giderler.isletme).items);
  const ogrenimDisiItems = asObject(asObject(giderler.ogrenimDisi).items);
  const yurtItems = asObject(asObject(giderler.yurt).items);
  const discounts = asArray(inputs?.discounts);

  const hasPositiveLeaf = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(hasPositiveLeaf);
    if (value && typeof value === "object") return Object.values(asObject(value)).some(hasPositiveLeaf);
    return num(value) > 0;
  };

  const serviceDone = (items: Record<string, unknown>) =>
    Object.values(items).some((row) => num(asObject(row).unitCost) > 0);

  const discountsDone = discounts.some((row) => {
    const source = asObject(row);
    return (
      num(source.studentCount ?? source.studentCountY2 ?? source.studentCountY3) > 0 &&
      num(source.value ?? source.valueY2 ?? source.valueY3) > 0
    );
  });

  const operatingDone = Object.values(isletmeItems).some(hasPositiveLeaf);
  const nonEducationDone = serviceDone(ogrenimDisiItems);
  const dormDone = serviceDone(yurtItems);
  const done = [operatingDone, nonEducationDone, dormDone, discountsDone, true].filter(Boolean).length;
  return { missing: Math.max(0, GIDERLER_TOTAL_SECTIONS - done), done };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
}

function scenarioLocked(scenario?: Scenario | null) {
  const status = String(scenario?.status || "draft");
  const submittedAt = scenario?.submitted_at != null;
  const sentAt = scenario?.sent_at != null;
  return (
    status === "sent_for_approval" ||
    status === "submitted" ||
    (status === "approved" && sentAt) ||
    (status === "in_review" && submittedAt)
  );
}

function scenarioStatusMeta(themeColors: AppThemeColors, scenario?: Scenario | null) {
  const status = String(scenario?.status || "draft");
  switch (status) {
    case "revision_requested":
      return { label: "Revizyon istendi", color: themeColors.warn, bg: alpha(themeColors.warn, 0.14), border: alpha(themeColors.warn, 0.34) };
    case "in_review":
      return { label: "İncelemede", color: themeColors.accent, bg: alpha(themeColors.accent, 0.14), border: alpha(themeColors.accent, 0.34) };
    case "sent_for_approval":
    case "submitted":
      return { label: "Merkeze iletildi", color: themeColors.primaryDark, bg: alpha(themeColors.primary, 0.16), border: alpha(themeColors.primary, 0.38) };
    case "approved":
      return {
        label: scenario?.sent_at ? "Onaylandı" : "Kontrol edildi",
        color: themeColors.success,
        bg: alpha(themeColors.success, 0.14),
        border: alpha(themeColors.success, 0.34),
      };
    case "draft":
    default:
      return { label: status === "draft" ? "Taslak" : status, color: themeColors.textDim, bg: themeColors.bgElev2, border: themeColors.border };
  }
}

function workStateMeta(themeColors: AppThemeColors, state?: string | null) {
  switch (String(state || "not_started")) {
    case "submitted":
      return { label: "İncelemede", color: themeColors.primary, icon: "time-outline" as const, locked: true };
    case "approved":
      return { label: "Onaylandı", color: themeColors.success, icon: "checkmark-circle-outline" as const, locked: true };
    case "needs_revision":
      return { label: "Revizyon", color: themeColors.warn, icon: "return-up-back-outline" as const, locked: false };
    case "in_progress":
      return { label: "Çalışılıyor", color: themeColors.accent, icon: "create-outline" as const, locked: false };
    case "not_started":
    default:
      return { label: "Başlanmadı", color: themeColors.textDim, icon: "ellipse-outline" as const, locked: false };
  }
}

function scenarioStatusTone(status?: string | null): StatusTone {
  switch (String(status || "draft")) {
    case "revision_requested":
      return "warning";
    case "in_review":
      return "accent";
    case "sent_for_approval":
    case "submitted":
      return "primary";
    case "approved":
      return "success";
    case "draft":
    default:
      return "muted";
  }
}

function workStateTone(state?: string | null): StatusTone {
  switch (String(state || "not_started")) {
    case "submitted":
      return "primary";
    case "approved":
      return "success";
    case "needs_revision":
      return "warning";
    case "in_progress":
      return "accent";
    case "not_started":
    default:
      return "muted";
  }
}

function normalizeProgress(payload?: ScenarioProgressResponse | null): ProgressModel | null {
  const progress = payload?.progress && typeof payload.progress === "object"
    ? (payload.progress as Record<string, unknown>)
    : null;
  if (!progress) return null;
  return {
    pct: num(progress.pct),
    completedCount: progress.completedCount == null ? undefined : num(progress.completedCount),
    totalCount: progress.totalCount == null ? undefined : num(progress.totalCount),
    tabs: asArray(progress.tabs).map((tab) => asObject(tab)) as ProgressTab[],
    missingDetailsLines: asArray(progress.missingDetailsLines).map((line) => String(line)).filter(Boolean),
  };
}

function progressForModule(module: ModuleDef, progress: ProgressModel | null) {
  if (!progress || !module.progressKeys.length) {
    return { pct: null as number | null, done: false, missingLines: [] as string[] };
  }
  const tabs = progress.tabs.filter((tab) => module.progressKeys.includes(String(tab.key)));
  if (!tabs.length) return { pct: null, done: false, missingLines: [] };
  const pct = Math.round(tabs.reduce((sum, tab) => sum + num(tab.pct), 0) / tabs.length);
  const done = tabs.every((tab) => tab.done === true);
  const missingLines = tabs.flatMap((tab) => {
    const lines = asArray(tab.missingLines).map((line) => String(line)).filter(Boolean);
    if (lines.length) return lines;
    return tab.missingPreview ? [String(tab.missingPreview)] : [];
  });
  return { pct, done, missingLines: Array.from(new Set(missingLines)).slice(0, 8) };
}

function resolveCurrency(scenario?: Scenario | null) {
  if (scenario?.input_currency === "LOCAL") return scenario.local_currency_code || "LOCAL";
  return "USD";
}

function countObjectKeys(value: unknown) {
  return Object.keys(asObject(value)).length;
}

function countEnabledKademeler(inputs?: Inputs | null) {
  const raw = asObject(inputs?.temelBilgiler).kademeler;
  if (Array.isArray(raw)) return raw.length;
  const obj = asObject(raw);
  return Object.values(obj).filter((value) => {
    if (value && typeof value === "object" && "enabled" in value) return Boolean((value as { enabled?: unknown }).enabled);
    return Boolean(value);
  }).length;
}

function countTuitionRows(inputs?: Inputs | null) {
  return asArray(asObject(asObject(inputs?.gelirler).tuition).rows).length;
}

function countIncomeRows(inputs?: Inputs | null, key = "") {
  const rows = asArray(asObject(asObject(inputs?.gelirler)[key]).rows);
  return rows.length;
}

function countExpenseItems(inputs?: Inputs | null, key = "") {
  return countObjectKeys(asObject(asObject(asObject(inputs?.giderler)[key]).items));
}

function countCurriculumEntries(norm: unknown): number {
  const years = asObject(asObject(norm).years);
  return Object.values(years).reduce<number>((sum, year) => {
    const curriculum = asObject(asObject(year).curriculumWeeklyHours);
    return sum + Object.values(curriculum).reduce<number>((inner, grade) => inner + countObjectKeys(grade), 0);
  }, 0);
}

export default function ScenarioScreen() {
  const { schoolId, scenarioId, tab } = useLocalSearchParams<{ schoolId: string; scenarioId: string; tab?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: themeColors } = useAppTheme();
  const { user } = useAuth();
  const appliedTabParamRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<ModuleKey>("temel_bilgiler");
  const [principalEditorOpen, setPrincipalEditorOpen] = useState(false);
  const [temelSectionFilter, setTemelSectionFilter] = useState<TemelSectionFilter>("missing");
  const [temelActiveSection, setTemelActiveSection] = useState<TemelSectionKey | null>(null);
  const [kapasiteSectionFilter, setKapasiteSectionFilter] = useState<KapasiteSectionFilter>("missing");
  const [kapasiteActiveSection, setKapasiteActiveSection] = useState<KapasiteSectionKey | null>(null);
  const [normSectionFilter, setNormSectionFilter] = useState<NormSectionFilter>("missing");
  const [normActiveSection, setNormActiveSection] = useState<NormSectionKey | null>(null);
  const [ikSectionFilter, setIkSectionFilter] = useState<IkSectionFilter>("missing");
  const [ikActiveSection, setIkActiveSection] = useState<IkSectionKey | null>(null);
  const [gelirlerSectionFilter, setGelirlerSectionFilter] = useState<GelirlerSectionFilter>("missing");
  const [gelirlerActiveSection, setGelirlerActiveSection] = useState<GelirlerMobileSectionKey | null>(null);
  const [giderlerSectionFilter, setGiderlerSectionFilter] = useState<GiderlerSectionFilter>("missing");
  const [giderlerActiveSection, setGiderlerActiveSection] = useState<GiderlerMobileSectionKey | null>(null);
  const [context, setContext] = useState<ScenarioContext | null>(null);
  const [progressRaw, setProgressRaw] = useState<ScenarioProgressResponse | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [requiredWorkIds, setRequiredWorkIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [metaWarning, setMetaWarning] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRequiresCalculation, setReportRequiresCalculation] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>("original");
  const [reportCurrency, setReportCurrency] = useState<ReportCurrency>("usd");
  const [actionBusy, setActionBusy] = useState<ActionBusy>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [revisionComment, setRevisionComment] = useState("");
  const [dirtyPathBuckets, setDirtyPathBuckets] = useState<Record<string, string[]>>({});

  const progress = useMemo(() => normalizeProgress(progressRaw), [progressRaw]);
  const dirtyResources = useMemo(() => {
    const dirtyInputPaths = Object.values(dirtyPathBuckets).flat().map((path) => toDirtyInputPath(path));
    return buildModifiedResourcesFromPaths(dirtyInputPaths);
  }, [dirtyPathBuckets]);
  const scenario = context?.scenario || null;
  const inputs = context?.inputs || null;
  const locked = scenarioLocked(scenario);
  const statusMeta = scenarioStatusMeta(themeColors, scenario);
  const effectiveRequiredWorkIds = useMemo(() => getRequiredWorkIds(inputs, requiredWorkIds), [inputs, requiredWorkIds]);
  const requiredSet = useMemo(() => new Set(effectiveRequiredWorkIds), [effectiveRequiredWorkIds]);
  const isHeadquarter = isHeadquarterScenario(inputs);
  const permissionScope = useMemo<PermissionScope>(
    () => ({
      countryId: user?.country_id ?? null,
      schoolId: schoolId ?? null,
    }),
    [schoolId, user?.country_id],
  );
  const visibleModules = useMemo(
    () =>
      MODULES.filter((module) => {
        if (module.key === "giderler.isletme") {
          return (
            canReadWorkItem(user, "giderler.isletme", permissionScope) ||
            can(user, "page.discounts", "read", permissionScope) ||
            can(user, "section.discounts.discounts", "read", permissionScope)
          );
        }
        if (module.workId) return canReadWorkItem(user, module.workId, permissionScope);
        if (module.readResource) return can(user, module.readResource, "read", permissionScope);
        return true;
      }),
    [permissionScope, user],
  );
  const dirty = dirtyResources.length > 0;
  const hasDirtyBucket = useCallback(
    (key: string) => (dirtyPathBuckets[key] || []).length > 0,
    [dirtyPathBuckets],
  );
  const warnUnsavedNavigation = useCallback((message = "Once degisiklikleri kaydedin veya vazgecin.") => {
    setActionMessage(message);
  }, []);

  useEffect(() => {
    appliedTabParamRef.current = null;
    setPrincipalEditorOpen(Boolean(typeof tab === "string" && tab));
  }, [schoolId, scenarioId, tab]);

  const load = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    setErr("");
    setMetaWarning("");
    setActionMessage("");
    try {
      const contextResult = await api.getScenarioContext(schoolId, scenarioId);
      setContext(contextResult);

      const [progressResult, workResult] = await Promise.allSettled([
        api.getScenarioProgress(schoolId, scenarioId),
        api.listWorkItems(schoolId, scenarioId),
      ]);

      if (progressResult.status === "fulfilled") {
        setProgressRaw(progressResult.value);
      } else {
        setProgressRaw(null);
        setMetaWarning("Ilerleme bilgisi alinamadi.");
      }

      if (workResult.status === "fulfilled") {
        setWorkItems(workResult.value.workItems);
        setRequiredWorkIds(getRequiredWorkIds(contextResult.inputs, workResult.value.requiredWorkIds));
      } else {
        setWorkItems([]);
        setRequiredWorkIds(getRequiredWorkIds(contextResult.inputs));
        setMetaWarning((prev) => prev || "Is akisi bilgisi alinamadi.");
      }
    } catch (e: any) {
      setErr(e?.message || "Senaryo yuklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId, scenarioId]);

  const loadReport = useCallback(async (nextMode: ReportMode = reportMode) => {
    if (!schoolId || !scenarioId) return;
    setReportLoading(true);
    try {
      const data = await api.getScenarioReport(schoolId, scenarioId, nextMode);
      setReport(data);
    } catch (e: any) {
      setReport({
        currency: resolveCurrency(scenario),
        kpis: {},
        gelirDagilim: [],
        giderDagilim: [],
        disabledMessage: e?.message || "Rapor yuklenemedi.",
      });
    } finally {
      setReportLoading(false);
    }
  }, [reportMode, schoolId, scenarioId, scenario]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (
      (activeTab === "rapor" || activeTab === "detayli_rapor") &&
      !report &&
      !reportLoading &&
      !reportRequiresCalculation
    ) {
      loadReport();
    }
  }, [activeTab, loadReport, report, reportLoading, reportRequiresCalculation]);

  const handleReportModeChange = useCallback((nextMode: ReportMode) => {
    setReportMode(nextMode);
    setReport(null);
  }, []);

  const handleCalculateReport = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    if (dirty) {
      setActionMessage("Hesaplamadan once degisiklikleri kaydedin veya vazgecin.");
      return;
    }
    setActionBusy("calculate");
    setActionMessage("");
    try {
      const result = await api.calculateScenario(schoolId, scenarioId);
      setReportMode("original");
      setReport(result.report);
      setReportRequiresCalculation(false);
      await load();
      setActionMessage("Rapor hesaplandi.");
    } catch (e: any) {
      setActionMessage(e?.message || "Rapor hesaplanamadi.");
    } finally {
      setActionBusy(null);
    }
  }, [dirty, load, scenarioId, schoolId]);

  useEffect(() => {
    if (visibleModules.length && !visibleModules.some((module) => module.key === activeTab)) {
      if (dirty) {
        warnUnsavedNavigation();
        return;
      }
      setActiveTab(visibleModules[0].key);
    }
  }, [activeTab, dirty, visibleModules, warnUnsavedNavigation]);

  useEffect(() => {
    const requestedTab = typeof tab === "string" ? tab : "";
    if (!requestedTab || appliedTabParamRef.current === requestedTab) return;
    const target = visibleModules.find((module) => module.key === requestedTab);
    if (!target) return;
    if (dirty) {
      warnUnsavedNavigation();
      return;
    }
    appliedTabParamRef.current = requestedTab;
    setPrincipalEditorOpen(true);
    if (activeTab !== target.key) setActiveTab(target.key);
  }, [activeTab, dirty, tab, visibleModules, warnUnsavedNavigation]);

  useEffect(() => {
    if (!dirty) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      warnUnsavedNavigation();
      return true;
    });
    return () => subscription.remove();
  }, [dirty, warnUnsavedNavigation]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function" ||
      typeof window.removeEventListener !== "function"
    ) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const activeModule = visibleModules.find((module) => module.key === activeTab) || visibleModules[0] || MODULES[0];
  const activeWorkItem = activeModule.workId
    ? workItems.find((item) => String(item.work_id) === activeModule.workId)
    : undefined;
  const activeModuleProgress = progressForModule(activeModule, progress);
  const role = String(user?.role || "");
  const isPrincipal = role === "principal";
  const scenarioStatus = String(scenario?.status || "draft");
  const activeRequired = activeModule.workId ? requiredSet.has(activeModule.workId) : false;
  const activeCanWrite = activeModule.workId ? canWriteWorkItem(user, activeModule.workId, permissionScope) : false;
  const allRequiredApproved = areRequiredWorkItemsApproved(workItems, effectiveRequiredWorkIds);
  const canShowSubmit =
    visibleModules.length > 0 &&
    Boolean(activeModule.workId) &&
    ["admin", "principal", "hr", "manager", "accountant"].includes(role);
  const submitBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!activeModule.workId) {
      blockers.push("Gonderilecek modul yok.");
      return blockers;
    }
    if (!["draft", "in_review", "revision_requested"].includes(scenarioStatus)) {
      blockers.push("Senaryo bu durumda modul gonderimine kapali.");
    }
    if (!activeRequired) blockers.push("HQ senaryoda bu modul zorunlu degil.");
    if (!activeCanWrite) blockers.push("Bu modulu gonderme yetkiniz yok.");
    if (!canSubmitWorkItemState(activeWorkItem)) blockers.push("Modul zaten incelemede veya onayli.");
    if (!activeModuleProgress.done) blockers.push("Modul ilerlemesi tamamlanmali.");
    if (dirty) blockers.push("Once degisiklikleri kaydedin.");
    if (locked) blockers.push("Senaryo kilitli.");
    return blockers;
  }, [
    activeCanWrite,
    activeModule.workId,
    activeModuleProgress.done,
    activeRequired,
    activeWorkItem,
    dirty,
    locked,
    scenarioStatus,
  ]);
  const canSubmitActive = canShowSubmit && submitBlockers.length === 0;
  const canReviewActive =
    Boolean(activeModule.workId) &&
    String(activeWorkItem?.state || "") === "submitted" &&
    canReviewWorkItems(user, permissionScope) &&
    !locked;
  const showSendForApproval = canForwardScenario(user);
  const sendBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!showSendForApproval) return blockers;
    if (scenarioStatus !== "approved") blockers.push("Once tum zorunlu moduller onaylanmali.");
    if (scenario?.sent_at) blockers.push("Senaryo zaten merkeze iletilmis.");
    if (!scenario?.checked_at) blockers.push("Yonetici kontrol tarihi bekleniyor.");
    if (!allRequiredApproved) blockers.push("Zorunlu is kalemleri onayli degil.");
    if (num(progress?.pct) < 100) blockers.push("Ilerleme %100 olmali.");
    if (dirty) blockers.push("Once degisiklikleri kaydedin.");
    if (locked) blockers.push("Senaryo kilitli.");
    return blockers;
  }, [allRequiredApproved, dirty, locked, progress?.pct, scenario?.checked_at, scenario?.sent_at, scenarioStatus, showSendForApproval]);
  const canSendForApproval = showSendForApproval && sendBlockers.length === 0;
  const showAdminApprovalLink = role === "admin" && scenarioStatus === "sent_for_approval";
  const footerBlocker =
    actionMessage ||
    submitBlockers[0] ||
    sendBlockers[0] ||
    "Bu modulde islem yapilamiyor veya once engeller giderilmeli.";

  const changeTab = useCallback(
    (nextTab: ModuleKey) => {
      if (activeTab === nextTab) return;
      if (dirty) {
        setActionMessage("Once degisiklikleri kaydedin veya vazgecin.");
        return;
      }
      setActionMessage("");
      if (nextTab !== "temel_bilgiler") setTemelActiveSection(null);
      if (nextTab !== "kapasite") setKapasiteActiveSection(null);
      if (nextTab !== "norm.ders_dagilimi") setNormActiveSection(null);
      if (nextTab !== "ik.local_staff") setIkActiveSection(null);
      if (nextTab !== "gelirler.unit_fee") setGelirlerActiveSection(null);
      if (nextTab !== "giderler.isletme") setGiderlerActiveSection(null);
      setActiveTab(nextTab);
    },
    [activeTab, dirty],
  );

  const refreshScenario = useCallback(() => {
    if (dirty) {
      setActionMessage("Yenilemeden once degisiklikleri kaydedin veya vazgecin.");
      return;
    }
    load();
  }, [dirty, load]);

  const refreshScenarioFromPull = useCallback(() => {
    if (dirty) {
      setActionMessage("Yenilemeden once degisiklikleri kaydedin veya vazgecin.");
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    load();
  }, [dirty, load]);

  const goBack = useCallback(() => {
    if (dirty) {
      setActionMessage("Once degisiklikleri kaydedin veya vazgecin.");
      return;
    }
    if (isPrincipal && principalEditorOpen) {
      if (activeTab === "temel_bilgiler" && temelActiveSection) {
        setTemelActiveSection(null);
        return;
      }
      if (activeTab === "kapasite" && kapasiteActiveSection) {
        setKapasiteActiveSection(null);
        return;
      }
      if (activeTab === "norm.ders_dagilimi" && normActiveSection) {
        setNormActiveSection(null);
        return;
      }
      if (activeTab === "ik.local_staff" && ikActiveSection) {
        setIkActiveSection(null);
        return;
      }
      if (activeTab === "gelirler.unit_fee" && gelirlerActiveSection) {
        setGelirlerActiveSection(null);
        return;
      }
      if (activeTab === "giderler.isletme" && giderlerActiveSection) {
        setGiderlerActiveSection(null);
        return;
      }
      setPrincipalEditorOpen(false);
      return;
    }
    router.back();
  }, [activeTab, dirty, gelirlerActiveSection, giderlerActiveSection, ikActiveSection, isPrincipal, kapasiteActiveSection, normActiveSection, principalEditorOpen, router, temelActiveSection]);

  const handleSubmitActive = useCallback(async () => {
    if (!schoolId || !scenarioId || !activeModule.workId || !canSubmitActive) return;
    setActionBusy("submit");
    setActionMessage("");
    try {
      await api.submitWorkItem(schoolId, scenarioId, activeModule.workId, {
        resource: getSubmitResource(activeModule.workId),
      });
      await load();
      setActionMessage("Modul incelemeye gonderildi.");
    } catch (e: any) {
      setActionMessage(e?.message || "Modul gonderilemedi.");
    } finally {
      setActionBusy(null);
    }
  }, [activeModule.workId, canSubmitActive, load, scenarioId, schoolId]);

  const handleModuleDirtyPathsChange = useCallback((paths: string[], source = "active-module") => {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    setDirtyPathBuckets((prev) => {
      const next = { ...prev };
      if (uniquePaths.length) next[source] = uniquePaths;
      else delete next[source];
      return next;
    });
  }, []);

  const handleSaveTemelBilgiler = useCallback(
    async (draft: TemelBilgilerDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: temelBilgilerSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Temel Bilgiler kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Temel Bilgiler kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleSaveKapasite = useCallback(
    async (draft: KapasiteDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: kapasiteSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Kapasite kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Kapasite kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleSaveNorm = useCallback(
    async (draft: NormDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        if (draft.inputDirtyPaths.length) {
          await saveScenarioModule({
            schoolId,
            scenarioId,
            adapter: normGradesSaveAdapter,
            draft,
            currentInputs: inputs,
          });
        }
        if (draft.normDirtyPaths.length) {
          await api.saveNormConfig(schoolId, scenarioId, draft.norm);
        }
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Norm kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Norm kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleSaveIk = useCallback(
    async (draft: IkDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: ikSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("IK kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "IK kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleSaveGelirler = useCallback(
    async (draft: GelirlerDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: gelirlerSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Gelirler kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Gelirler kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleSaveGiderler = useCallback(
    async (draft: GiderlerDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      if (hasDirtyBucket("discounts")) {
        const message = "Once indirim degisikliklerini kaydedin veya vazgecin.";
        setActionMessage(message);
        throw new Error(message);
      }
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: giderlerSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Giderler kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Giderler kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [hasDirtyBucket, inputs, load, scenarioId, schoolId],
  );

  const handleSaveDiscounts = useCallback(
    async (draft: DiscountsDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      if (hasDirtyBucket("giderler")) {
        const message = "Once gider degisikliklerini kaydedin veya vazgecin.";
        setActionMessage(message);
        throw new Error(message);
      }
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: discountsSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setReport(null);
        setReportRequiresCalculation(true);
        await load();
        setActionMessage("Indirimler kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Indirimler kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [hasDirtyBucket, inputs, load, scenarioId, schoolId],
  );

  const handleReviewActive = useCallback(
    async (action: "approve" | "revise") => {
      if (!schoolId || !scenarioId || !activeModule.workId || !canReviewActive) return;
      setActionBusy(action === "approve" ? "approve" : "revise");
      setActionMessage("");
      try {
        await api.reviewWorkItem(schoolId, scenarioId, activeModule.workId, {
          action,
          comment: action === "revise" ? revisionComment.trim() || undefined : undefined,
        });
        await load();
        if (action === "revise") setRevisionComment("");
        setActionMessage(action === "approve" ? "Modul onaylandi." : "Revizyon istendi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Islem basarisiz.");
      } finally {
        setActionBusy(null);
      }
    },
    [activeModule.workId, canReviewActive, load, revisionComment, scenarioId, schoolId],
  );

  const handleSendForApproval = useCallback(async () => {
    if (!schoolId || !scenarioId || !canSendForApproval) return;
    setActionBusy("send");
    setActionMessage("");
    try {
      const response = await api.sendForApproval(schoolId, scenarioId);
      if (response.scenario) {
        setContext((prev) => (prev ? { ...prev, scenario: { ...prev.scenario, ...response.scenario } } : prev));
      }
      await load();
      setActionMessage("Senaryo merkeze iletildi.");
    } catch (e: any) {
      const reasons = Array.isArray(e?.data?.reasons) ? e.data.reasons.filter(Boolean) : [];
      setActionMessage(reasons.length ? `Merkeze iletilemez: ${reasons.join(", ")}` : e?.message || "Iletme basarisiz.");
    } finally {
      setActionBusy(null);
    }
  }, [canSendForApproval, load, scenarioId, schoolId]);

  const temelSectionCounts = useMemo(
    () => countTemelSections(context?.inputs, context?.scenario || scenario || null, user),
    [context?.inputs, context?.scenario, scenario, user],
  );
  const kapasiteSectionCounts = useMemo(
    () => countKapasiteSections(context?.inputs, context?.scenario || scenario || null),
    [context?.inputs, context?.scenario, scenario],
  );
  const normSectionCounts = useMemo(
    () => countNormSections(context?.inputs, context?.norm),
    [context?.inputs, context?.norm],
  );
  const ikSectionCounts = useMemo(
    () => countIkSections(context?.inputs, context?.scenario || scenario || null),
    [context?.inputs, context?.scenario, scenario],
  );
  const gelirlerSectionCounts = useMemo(
    () => countGelirlerSections(context?.inputs),
    [context?.inputs],
  );
  const giderlerSectionCounts = useMemo(
    () => countGiderlerSections(context?.inputs),
    [context?.inputs],
  );

  const principalTopRight = isPrincipal && principalEditorOpen && activeTab === "temel_bilgiler" && !temelActiveSection ? (
    <PrincipalFilterTabs
      value={temelSectionFilter}
      onChange={setTemelSectionFilter}
      themeColors={themeColors}
      missingCount={temelSectionCounts.missing}
      doneCount={temelSectionCounts.done}
    />
  ) : isPrincipal && principalEditorOpen && activeTab === "kapasite" && !kapasiteActiveSection ? (
    <PrincipalFilterTabs
      value={kapasiteSectionFilter}
      onChange={setKapasiteSectionFilter}
      themeColors={themeColors}
      missingCount={kapasiteSectionCounts.missing}
      doneCount={kapasiteSectionCounts.done}
    />
  ) : isPrincipal && principalEditorOpen && activeTab === "norm.ders_dagilimi" && !normActiveSection ? (
    <PrincipalFilterTabs
      value={normSectionFilter}
      onChange={setNormSectionFilter}
      themeColors={themeColors}
      missingCount={normSectionCounts.missing}
      doneCount={normSectionCounts.done}
    />
  ) : isPrincipal && principalEditorOpen && activeTab === "ik.local_staff" && !ikActiveSection ? (
    <PrincipalFilterTabs
      value={ikSectionFilter}
      onChange={setIkSectionFilter}
      themeColors={themeColors}
      missingCount={ikSectionCounts.missing}
      doneCount={ikSectionCounts.done}
    />
  ) : isPrincipal && principalEditorOpen && activeTab === "gelirler.unit_fee" && !gelirlerActiveSection ? (
    <PrincipalFilterTabs
      value={gelirlerSectionFilter}
      onChange={setGelirlerSectionFilter}
      themeColors={themeColors}
      missingCount={gelirlerSectionCounts.missing}
      doneCount={gelirlerSectionCounts.done}
    />
  ) : isPrincipal && principalEditorOpen && activeTab === "giderler.isletme" && !giderlerActiveSection ? (
    <PrincipalFilterTabs
      value={giderlerSectionFilter}
      onChange={setGiderlerSectionFilter}
      themeColors={themeColors}
      missingCount={giderlerSectionCounts.missing}
      doneCount={giderlerSectionCounts.done}
    />
  ) : undefined;
  const principalHeaderTitle = isPrincipal
    ? principalEditorOpen
      ? activeTab === "temel_bilgiler" && temelActiveSection
        ? TEMEL_SECTION_LABELS[temelActiveSection]
        : activeTab === "kapasite" && kapasiteActiveSection
          ? KAPASITE_SECTION_LABELS[kapasiteActiveSection]
        : activeTab === "norm.ders_dagilimi" && normActiveSection
          ? NORM_SECTION_LABELS[normActiveSection]
        : activeTab === "ik.local_staff" && ikActiveSection
          ? IK_SECTION_LABELS[ikActiveSection]
        : activeTab === "gelirler.unit_fee" && gelirlerActiveSection
          ? GELIRLER_SECTION_LABELS_ROUTE[gelirlerActiveSection]
        : activeTab === "giderler.isletme" && giderlerActiveSection
          ? GIDERLER_SECTION_LABELS_ROUTE[giderlerActiveSection]
        : activeModule.label
      : scenario?.name || "Senaryo"
    : undefined;
  const principalHeaderSubtitle = isPrincipal
    ? principalEditorOpen
      ? activeTab === "temel_bilgiler" && temelActiveSection
        ? "Temel Bilgiler"
        : activeTab === "kapasite" && kapasiteActiveSection
          ? "Kapasite"
        : activeTab === "norm.ders_dagilimi" && normActiveSection
          ? "Norm"
        : activeTab === "ik.local_staff" && ikActiveSection
          ? "IK"
        : activeTab === "gelirler.unit_fee" && gelirlerActiveSection
          ? "Gelirler"
        : activeTab === "giderler.isletme" && giderlerActiveSection
          ? "Giderler"
          : scenario?.name || "Modul"
      : "Moduller"
    : undefined;
  const scenarioHeaderTitle = isPrincipal ? principalHeaderTitle : scenario?.name || "Senaryo";
  const scenarioHeaderSubtitle = isPrincipal
    ? principalHeaderSubtitle
    : `${scenario?.academic_year || "-"} / ${resolveCurrency(scenario)}`;
  const scenarioHeaderRight = isPrincipal ? (
    principalTopRight
  ) : (
    <StatusPill
      label={statusMeta.label}
      tone={scenarioStatusTone(scenario?.status)}
      icon={locked ? "lock-closed-outline" : undefined}
      showDot={!locked}
      style={styles.headerStatusPill}
    />
  );
  const temelSectionEditorOpen = Boolean(activeTab === "temel_bilgiler" && temelActiveSection);
  const kapasiteSectionEditorOpen = Boolean(activeTab === "kapasite" && kapasiteActiveSection);
  const normSectionEditorOpen = Boolean(activeTab === "norm.ders_dagilimi" && normActiveSection);
  const ikSectionEditorOpen = Boolean(activeTab === "ik.local_staff" && ikActiveSection);
  const gelirlerSectionEditorOpen = Boolean(activeTab === "gelirler.unit_fee" && gelirlerActiveSection);
  const giderlerSectionEditorOpen = Boolean(activeTab === "giderler.isletme" && giderlerActiveSection);
  const sectionEditorOpen = temelSectionEditorOpen || kapasiteSectionEditorOpen || normSectionEditorOpen || ikSectionEditorOpen || gelirlerSectionEditorOpen || giderlerSectionEditorOpen;
  const showScenarioStickyFooter = !sectionEditorOpen && (!isPrincipal || principalEditorOpen);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={["top"]} testID="scenario-screen">
      <StickyBackHeader
        testID="scenario-back-button"
        onPress={goBack}
        title={scenarioHeaderTitle}
        subtitle={scenarioHeaderSubtitle}
        right={scenarioHeaderRight}
        backgroundColor={themeColors.bg}
        borderColor={themeColors.border}
        iconColor={themeColors.text}
        buttonBackgroundColor={themeColors.bgElev}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={themeColors.primary} />
        </View>
      ) : err ? (
        <View style={styles.errorWrap}>
          <Card>
            <Text style={styles.errorText}>{err}</Text>
            <Button
              label="Tekrar Dene"
              icon="refresh-outline"
              variant="secondary"
              onPress={() => {
                setLoading(true);
                load();
              }}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      ) : (
        <>
          <ScrollView
            scrollEnabled={!sectionEditorOpen}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshScenarioFromPull}
                tintColor={themeColors.primary}
              />
            }
            contentContainerStyle={[
              {
                paddingBottom: sectionEditorOpen
                  ? 0
                  : insets.bottom + (isPrincipal && !principalEditorOpen ? spacing.lg : 230),
              },
              sectionEditorOpen ? styles.sectionEditorScrollContent : null,
            ]}
          >
            {isPrincipal && !principalEditorOpen ? (
              <View style={styles.principalFlow}>
                {visibleModules.length ? (
                  visibleModules.map((module) => {
                    const required = module.workId ? requiredSet.has(module.workId) : false;
                    const moduleProgress = progressForModule(module, progress);
                    const moduleWorkItem = module.workId
                      ? workItems.find((item) => String(item.work_id) === module.workId)
                      : undefined;
                    const moduleWorkMeta = workStateMeta(themeColors, moduleWorkItem?.state);
                    return (
                      <PrincipalModuleListCard
                        key={module.key}
                        module={module}
                        required={required}
                        progress={moduleProgress}
                        workLabel={moduleWorkMeta.label}
                        onPress={() => {
                          setActionMessage("");
                          setActiveTab(module.key);
                          setPrincipalEditorOpen(true);
                          if (module.key === "temel_bilgiler") {
                            setTemelSectionFilter("missing");
                            setTemelActiveSection(null);
                          }
                          if (module.key === "kapasite") {
                            setKapasiteSectionFilter("missing");
                            setKapasiteActiveSection(null);
                          }
                          if (module.key === "norm.ders_dagilimi") {
                            setNormSectionFilter("missing");
                            setNormActiveSection(null);
                          }
                          if (module.key === "ik.local_staff") {
                            setIkSectionFilter("missing");
                            setIkActiveSection(null);
                          }
                          if (module.key === "gelirler.unit_fee") {
                            setGelirlerSectionFilter("missing");
                            setGelirlerActiveSection(null);
                          }
                        }}
                      />
                    );
                  })
                ) : (
                  <NoAccessPanel />
                )}

                {showSendForApproval ? (
                  <PrincipalSendCard
                    canSend={canSendForApproval}
                    loading={actionBusy === "send"}
                    blocker={sendBlockers[0]}
                    onPress={handleSendForApproval}
                  />
                ) : null}
              </View>
            ) : (
              <>
                {!isPrincipal && !sectionEditorOpen ? (
                  <View style={styles.summaryWrap}>
                    <ScenarioSummary
                      scenarioName={scenario?.name || "Senaryo"}
                      academicYear={scenario?.academic_year || "-"}
                      currency={resolveCurrency(scenario)}
                      statusLabel={statusMeta.label}
                      progress={progress}
                      requiredCount={requiredSet.size}
                      isHeadquarter={isHeadquarter}
                      locked={locked}
                      metaWarning={metaWarning}
                    />
                  </View>
                ) : null}

                {!isPrincipal && !sectionEditorOpen ? (
                  <View style={styles.tabRow}>
                    <SectionHeader
                      title="Moduller"
                      subtitle="Zorunlu is kalemlerini ve raporlari yonetin"
                      style={styles.tabHeader}
                    />
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tabContent}
                    >
                      {visibleModules.map((module) => {
                        const required = module.workId ? requiredSet.has(module.workId) : false;
                        const selected = activeTab === module.key;
                        const moduleProgress = progressForModule(module, progress);
                        const moduleWorkItem = module.workId
                          ? workItems.find((item) => String(item.work_id) === module.workId)
                          : undefined;
                        const moduleWorkMeta = workStateMeta(themeColors, moduleWorkItem?.state);
                        const progressLabel =
                          moduleProgress.pct == null
                            ? required || !module.workId
                              ? "Zorunlu"
                              : "Opsiyonel"
                            : `${Math.round(moduleProgress.pct)}%`;
                        return (
                          <Pressable
                            key={module.key}
                            onPress={() => changeTab(module.key)}
                            testID={`tab-${module.key}`}
                            style={({ pressed }) => [
                              styles.moduleTabCard,
                              {
                                backgroundColor: selected ? alpha(themeColors.primary, 0.1) : themeColors.bgElev,
                                borderColor: selected ? alpha(themeColors.primary, 0.38) : themeColors.border,
                                opacity: pressed ? 0.82 : 1,
                              },
                              selected ? styles.moduleTabCardActive : null,
                              shadow.soft,
                            ]}
                          >
                            <View style={styles.moduleTabTop}>
                              <View
                                style={[
                                  styles.moduleTabIcon,
                                  {
                                    backgroundColor: selected
                                      ? themeColors.primary
                                      : alpha(moduleWorkMeta.color, 0.12),
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={module.icon}
                                  size={18}
                                  color={selected ? themeColors.primaryText : moduleWorkMeta.color}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.moduleTabPercent,
                                  { color: selected ? themeColors.primary : themeColors.textDim },
                                ]}
                              >
                                {progressLabel}
                              </Text>
                            </View>
                            <Text
                              style={[styles.moduleTabTitle, { color: themeColors.text }]}
                              numberOfLines={1}
                            >
                              {required || !module.workId ? module.shortLabel : `${module.shortLabel} Ops.`}
                            </Text>
                            <Text
                              style={[styles.moduleTabSub, { color: themeColors.textDim }]}
                              numberOfLines={1}
                            >
                              {moduleWorkMeta.label}
                            </Text>
                            {selected ? <View style={[styles.moduleTabAccent, { backgroundColor: themeColors.accent }]} /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <View style={[styles.body, { backgroundColor: themeColors.bg }, isPrincipal ? styles.principalBody : null, sectionEditorOpen ? styles.sectionEditorBody : null]}>
                  {!visibleModules.length ? (
                    <NoAccessPanel />
                  ) : activeTab === "rapor" ? (
                    <ScenarioReportPanel
                      report={report}
                      loading={reportLoading}
                      onReload={loadReport}
                      onCalculate={handleCalculateReport}
                      calculating={actionBusy === "calculate"}
                      requiresCalculation={reportRequiresCalculation}
                      currency={resolveCurrency(scenario)}
                      scenario={scenario}
                      schoolId={schoolId}
                      scenarioId={scenarioId}
                      mode={reportMode}
                      onModeChange={handleReportModeChange}
                      reportCurrency={reportCurrency}
                      onReportCurrencyChange={setReportCurrency}
                    />
                  ) : activeTab === "detayli_rapor" ? (
                    <ScenarioDetailedReportPanel
                      report={report}
                      loading={reportLoading}
                      onReload={loadReport}
                      onCalculate={handleCalculateReport}
                      calculating={actionBusy === "calculate"}
                      requiresCalculation={reportRequiresCalculation}
                      currency={resolveCurrency(scenario)}
                      scenario={scenario}
                      mode={reportMode}
                      onModeChange={handleReportModeChange}
                      reportCurrency={reportCurrency}
                      onReportCurrencyChange={setReportCurrency}
                    />
                  ) : (
                    <ModulePanel
                      module={activeModule}
                      context={context}
                      progress={progress}
                      workItem={activeWorkItem}
                      required={activeModule.workId ? requiredSet.has(activeModule.workId) : false}
                      isHeadquarter={isHeadquarter}
                      scenarioLocked={locked}
                      canWrite={activeCanWrite}
                      user={user}
                      savingTemelBilgiler={actionBusy === "save"}
                      savingKapasite={actionBusy === "save"}
                      savingNorm={actionBusy === "save"}
                      savingIk={actionBusy === "save"}
                      savingGelirler={actionBusy === "save"}
                      savingGiderler={actionBusy === "save"}
                      savingDiscounts={actionBusy === "save"}
                      permissionScope={permissionScope}
                      onModuleDirtyPathsChange={handleModuleDirtyPathsChange}
                      onSaveTemelBilgiler={handleSaveTemelBilgiler}
                      onSaveKapasite={handleSaveKapasite}
                      onSaveNorm={handleSaveNorm}
                      onSaveIk={handleSaveIk}
                      onSaveGelirler={handleSaveGelirler}
                      onSaveGiderler={handleSaveGiderler}
                      onSaveDiscounts={handleSaveDiscounts}
                      onSectionModeBack={goBack}
                      temelSectionFilter={temelSectionFilter}
                      onTemelSectionFilterChange={setTemelSectionFilter}
                      temelActiveSection={temelActiveSection}
                      onTemelActiveSectionChange={setTemelActiveSection}
                      stickyTemelSectionActions={temelSectionEditorOpen}
                      stickyTemelSectionBottomInset={insets.bottom}
                      kapasiteSectionFilter={kapasiteSectionFilter}
                      onKapasiteSectionFilterChange={setKapasiteSectionFilter}
                      kapasiteActiveSection={kapasiteActiveSection}
                      onKapasiteActiveSectionChange={setKapasiteActiveSection}
                      stickyKapasiteSectionActions={kapasiteSectionEditorOpen && kapasiteActiveSection === "kademeKapasiteleri"}
                      stickyKapasiteSectionBottomInset={insets.bottom}
                      normSectionFilter={normSectionFilter}
                      onNormSectionFilterChange={setNormSectionFilter}
                      normActiveSection={normActiveSection}
                      onNormActiveSectionChange={setNormActiveSection}
                      stickyNormSectionActions={normSectionEditorOpen}
                      stickyNormSectionBottomInset={insets.bottom}
                      ikSectionFilter={ikSectionFilter}
                      onIkSectionFilterChange={setIkSectionFilter}
                      ikActiveSection={ikActiveSection}
                      onIkActiveSectionChange={setIkActiveSection}
                      stickyIkSectionActions={ikSectionEditorOpen && ikActiveSection !== "giderEslestirme"}
                      stickyIkSectionBottomInset={insets.bottom}
                      gelirlerSectionFilter={gelirlerSectionFilter}
                      onGelirlerSectionFilterChange={setGelirlerSectionFilter}
                      gelirlerActiveSection={gelirlerActiveSection}
                      onGelirlerActiveSectionChange={setGelirlerActiveSection}
                      stickyGelirlerSectionActions={gelirlerSectionEditorOpen && gelirlerActiveSection !== "brutGelirOzeti"}
                      stickyGelirlerSectionBottomInset={insets.bottom}
                      giderlerSectionFilter={giderlerSectionFilter}
                      onGiderlerSectionFilterChange={setGiderlerSectionFilter}
                      giderlerActiveSection={giderlerActiveSection}
                      onGiderlerActiveSectionChange={setGiderlerActiveSection}
                      stickyGiderlerSectionActions={giderlerSectionEditorOpen && giderlerActiveSection !== "giderOzeti"}
                      stickyGiderlerSectionBottomInset={insets.bottom}
                    />
                  )}
                </View>
              </>
            )}
          </ScrollView>

          {showScenarioStickyFooter ? (
            <View
              style={[
                styles.stickyFooter,
              {
                paddingBottom: insets.bottom + spacing.sm,
                backgroundColor: themeColors.bg,
                borderTopColor: themeColors.border,
              },
            ]}
          >
            <View style={styles.footerTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.footerTitle, { color: themeColors.text }]}>
                  {dirty ? "Kaydedilmemiş değişiklik var" : "Workflow hazır"}
                </Text>
                <Text style={[styles.footerSub, { color: themeColors.textDim }]} numberOfLines={2}>
                  {footerBlocker}
                </Text>
              </View>
              <Button
                label="Yenile"
                icon="refresh-outline"
                variant="secondary"
                small
                onPress={refreshScenario}
                testID="scenario-refresh-button"
              />
            </View>
            {canReviewActive ? (
              <TextInput
                value={revisionComment}
                onChangeText={setRevisionComment}
                placeholder="Revizyon notu"
                placeholderTextColor={themeColors.textMuted}
                style={[
                  styles.revisionInput,
                  {
                    backgroundColor: themeColors.bgElev2,
                    borderColor: themeColors.border,
                    color: themeColors.text,
                  },
                ]}
                multiline
                testID="scenario-review-comment-input"
              />
            ) : null}
            <View style={styles.footerActions}>
              {canShowSubmit ? (
                <Button
                  label="Gonder"
                  icon="paper-plane-outline"
                  small
                  disabled={!canSubmitActive || actionBusy != null}
                  loading={actionBusy === "submit"}
                  onPress={handleSubmitActive}
                  style={styles.footerActionButton}
                  testID="scenario-submit-work-item-button"
                />
              ) : null}
              {canReviewActive ? (
                <>
                  <Button
                    label="Onayla"
                    icon="checkmark-circle-outline"
                    small
                    disabled={actionBusy != null}
                    loading={actionBusy === "approve"}
                    onPress={() => handleReviewActive("approve")}
                    style={styles.footerActionButton}
                    testID="scenario-approve-work-item-button"
                  />
                  <Button
                    label="Revizyon"
                    icon="return-up-back-outline"
                    variant="secondary"
                    small
                    disabled={actionBusy != null}
                    loading={actionBusy === "revise"}
                    onPress={() => handleReviewActive("revise")}
                    style={styles.footerActionButton}
                    testID="scenario-revise-work-item-button"
                  />
                </>
              ) : null}
              {showSendForApproval ? (
                <Button
                  label="Merkeze Ilet"
                  icon="send-outline"
                  small
                  disabled={!canSendForApproval || actionBusy != null}
                  loading={actionBusy === "send"}
                  onPress={handleSendForApproval}
                  style={styles.footerActionButton}
                  testID="scenario-send-for-approval-button"
                />
              ) : null}
              {showAdminApprovalLink ? (
                <Button
                  label="Onaylar"
                  icon="shield-checkmark-outline"
                  variant="secondary"
                  small
                  onPress={() => router.push("/admin/approvals")}
                  style={styles.footerActionButton}
                  testID="scenario-admin-approvals-link"
                />
              ) : null}
            </View>
          </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function NoAccessPanel() {
  const { colors: themeColors } = useAppTheme();
  return (
    <Card testID="scenario-no-module-access">
      <View style={styles.centerPad}>
        <Ionicons name="lock-closed-outline" size={30} color={themeColors.textDim} />
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Yetki Gerekli</Text>
        <Text style={[styles.emptyText, { color: themeColors.textDim }]}>
          Bu senaryoda goruntuleyebileceginiz modul bulunmuyor. Modul veya rapor yetkisi icin yoneticinizle gorusun.
        </Text>
      </View>
    </Card>
  );
}

function ScenarioSummary({
  scenarioName,
  academicYear,
  currency,
  statusLabel,
  progress,
  requiredCount,
  isHeadquarter,
  locked,
  metaWarning,
}: {
  scenarioName: string;
  academicYear: string;
  currency: string;
  statusLabel: string;
  progress: ProgressModel | null;
  requiredCount: number;
  isHeadquarter: boolean;
  locked: boolean;
  metaWarning: string;
}) {
  const { colors: themeColors } = useAppTheme();
  const pct = progress?.pct ?? 0;
  const totalCount = progress?.totalCount ?? requiredCount;
  const completedCount = progress?.completedCount ?? 0;
  const missingCount = Math.max(totalCount - completedCount, 0);
  return (
    <View testID="scenario-shell-summary" style={styles.summaryStack}>
      <GradientHeroCard
        eyebrow={isHeadquarter ? "HQ SENARYO" : "SENARYO DURUMU"}
        title={scenarioName}
        subtitle={`${academicYear} / ${currency}`}
        icon="analytics-outline"
        metricValue={`${Math.round(pct)}%`}
        metricLabel="ortalama ilerleme"
        progress={pct}
        right={
          <View style={styles.heroStatusBadge}>
            {locked ? <Ionicons name="lock-closed-outline" size={13} color="#FFFFFF" /> : null}
            <Text style={styles.heroStatusText} numberOfLines={1}>
              {locked ? "Kilitli" : statusLabel}
            </Text>
          </View>
        }
        footer={
          <Text style={styles.heroFooterText}>
            {isHeadquarter
              ? "HQ senaryo: IK, Gelirler ve Giderler zorunlu."
              : "Tum ana modullerin ilerlemesini ve uyarilarini buradan izleyin."}
          </Text>
        }
      />

      <View style={styles.summaryStatsRow}>
        <View style={[styles.summaryStatCard, { backgroundColor: themeColors.bgElev, borderColor: themeColors.border }, shadow.soft]}>
          <View style={[styles.summaryStatIcon, { backgroundColor: alpha(themeColors.primary, 0.1) }]}>
            <Ionicons name="list-outline" size={17} color={themeColors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.summaryStatLabel, { color: themeColors.textMuted }]}>Zorunlu</Text>
            <Text style={[styles.summaryStatValue, { color: themeColors.text }]}>{totalCount}</Text>
          </View>
        </View>
        <View style={[styles.summaryStatCard, { backgroundColor: themeColors.bgElev, borderColor: themeColors.border }, shadow.soft]}>
          <View style={[styles.summaryStatIcon, { backgroundColor: alpha(themeColors.success, 0.1) }]}>
            <Ionicons name="checkmark-done-outline" size={17} color={themeColors.success} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.summaryStatLabel, { color: themeColors.textMuted }]}>Tamam</Text>
            <Text style={[styles.summaryStatValue, { color: themeColors.text }]}>{completedCount}</Text>
          </View>
        </View>
        <View style={[styles.summaryStatCard, { backgroundColor: themeColors.bgElev, borderColor: themeColors.border }, shadow.soft]}>
          <View style={[styles.summaryStatIcon, { backgroundColor: alpha(themeColors.warn, 0.1) }]}>
            <Ionicons name="alert-circle-outline" size={17} color={themeColors.warn} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.summaryStatLabel, { color: themeColors.textMuted }]}>Eksik</Text>
            <Text style={[styles.summaryStatValue, { color: themeColors.text }]}>{missingCount}</Text>
          </View>
        </View>
      </View>

      {metaWarning ? (
        <View style={[styles.noticeBox, { backgroundColor: alpha(themeColors.warn, 0.08), borderColor: alpha(themeColors.warn, 0.28) }]}>
          <Ionicons name="information-circle-outline" size={15} color={themeColors.warn} />
          <Text style={[styles.noticeText, { color: themeColors.textDim }]}>{metaWarning}</Text>
        </View>
      ) : null}
      {progress?.missingDetailsLines?.length ? (
        <Card style={styles.missingCard}>
          <Text style={[styles.tinyLabel, { color: themeColors.textDim }]}>Eksik Alanlar</Text>
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            {progress.missingDetailsLines.slice(0, 4).map((line) => (
              <Text key={line} style={[styles.missingLine, { backgroundColor: themeColors.bgElev2, borderColor: themeColors.border, color: themeColors.textDim }]} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}


function PrincipalScenarioCompactCard({
  scenario,
  statusLabel,
  statusTone,
  progress,
  locked,
  isHeadquarter,
  metaWarning,
}: {
  scenario: Scenario | null;
  statusLabel: string;
  statusTone: StatusTone;
  progress: ProgressModel | null;
  locked: boolean;
  isHeadquarter: boolean;
  metaWarning: string;
}) {
  const { colors: themeColors } = useAppTheme();
  const pct = progress?.pct ?? 0;
  const totalCount = progress?.totalCount ?? 0;
  const completedCount = progress?.completedCount ?? 0;
  const missingCount = Math.max(totalCount - completedCount, 0);
  return (
    <Card style={styles.principalScenarioCard} testID="scenario-shell-summary">
      <View style={styles.principalScenarioTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.principalScenarioTitle, { color: themeColors.text }]} numberOfLines={2}>
            {scenario?.name || "Senaryo"}
          </Text>
          <Text style={[styles.principalScenarioMeta, { color: themeColors.textDim }]} numberOfLines={1}>
            {scenario?.academic_year || "-"} • {resolveCurrency(scenario)} • {isHeadquarter ? "HQ" : "Yerel"}
          </Text>
        </View>
        <StatusPill
          label={locked ? "Kilitli" : statusLabel}
          tone={locked ? "muted" : statusTone}
          icon={locked ? "lock-closed-outline" : undefined}
          showDot={!locked}
          style={styles.principalScenarioStatus}
        />
      </View>
      <View style={styles.principalProgressRow}>
        <View style={styles.principalProgressTrack}>
          <ProgressBar value={pct} height={9} />
        </View>
        <Text style={[styles.principalPercent, { color: themeColors.text }]}>{Math.round(pct)}%</Text>
      </View>
      <View style={styles.principalPillRow}>
        <View style={[styles.principalMiniPill, { backgroundColor: alpha(themeColors.primary, 0.1), borderColor: alpha(themeColors.primary, 0.28) }]}>
          <Text style={[styles.principalMiniPillText, { color: themeColors.primary }]}>{resolveCurrency(scenario)}</Text>
        </View>
        <View style={[styles.principalMiniPill, { backgroundColor: themeColors.bgElev2, borderColor: themeColors.border }]}>
          <Text style={[styles.principalMiniPillText, { color: themeColors.textDim }]}>Tamam {completedCount}/{totalCount || "-"}</Text>
        </View>
        {missingCount ? (
          <View style={[styles.principalMiniPill, { backgroundColor: alpha(themeColors.warn, 0.1), borderColor: alpha(themeColors.warn, 0.28) }]}>
            <Text style={[styles.principalMiniPillText, { color: themeColors.warn }]}>{missingCount} eksik</Text>
          </View>
        ) : null}
      </View>
      {metaWarning ? (
        <View style={[styles.noticeBox, { backgroundColor: alpha(themeColors.warn, 0.08), borderColor: alpha(themeColors.warn, 0.28) }]}>
          <Ionicons name="information-circle-outline" size={15} color={themeColors.warn} />
          <Text style={[styles.noticeText, { color: themeColors.textDim }]}>{metaWarning}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function PrincipalModuleListCard({
  module,
  required,
  progress,
  workLabel,
  onPress,
}: {
  module: ModuleDef;
  required: boolean;
  progress: { pct: number | null; done: boolean; missingLines: string[] };
  workLabel: string;
  onPress: () => void;
}) {
  const { colors: themeColors } = useAppTheme();
  const isDone = Boolean(progress.done);
  const isMissing = required && !isDone;
  const iconColor = isDone ? themeColors.success : isMissing ? themeColors.warn : themeColors.primary;
  const iconName = isDone ? "checkmark" : isMissing ? "alert" : module.icon;
  const subtitle = progress.missingLines[0] || (isDone ? "Tamamlandı • Son kayıt güncel" : workLabel);
  return (
    <Pressable
      testID={`tab-${module.key}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.principalModuleCard,
        {
          backgroundColor: themeColors.bgElev,
          borderColor: themeColors.border,
          opacity: pressed ? 0.88 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        shadow.soft,
      ]}
    >
      <View style={[styles.principalModuleIcon, { backgroundColor: alpha(iconColor, 0.12) }]}>
        <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.principalModuleTitleRow}>
          <Text style={[styles.principalModuleTitle, { color: themeColors.text }]} numberOfLines={1}>
            {module.label}
          </Text>
          {progress.pct != null ? (
            <Text style={[styles.principalModulePct, { color: themeColors.textDim }]}>{Math.round(progress.pct)}%</Text>
          ) : null}
        </View>
        <Text style={[styles.principalModuleSub, { color: themeColors.textDim }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={21} color={themeColors.textMuted} />
    </Pressable>
  );
}

function PrincipalSendCard({
  canSend,
  loading,
  blocker,
  onPress,
}: {
  canSend: boolean;
  loading: boolean;
  blocker?: string;
  onPress: () => void;
}) {
  const { colors: themeColors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!canSend || loading}
      testID="scenario-send-for-approval-button"
      style={({ pressed }) => [
        styles.principalSendCard,
        {
          backgroundColor: canSend ? alpha(themeColors.primary, 0.1) : themeColors.bgElev2,
          borderColor: canSend ? alpha(themeColors.primary, 0.32) : themeColors.border,
          opacity: !canSend || loading ? 0.72 : pressed ? 0.86 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.principalSendTitle, { color: canSend ? themeColors.primary : themeColors.text }]}>
          Merkeze gönder
        </Text>
        <Text style={[styles.principalSendSub, { color: themeColors.textDim }]} numberOfLines={2}>
          {canSend ? "Tüm kontroller tamam. Senaryoyu merkeze iletebilirsiniz." : blocker || "Eksikler tamamlanmadan gönderilemez."}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color={themeColors.primary} />
      ) : (
        <StatusPill label={canSend ? "Hazır" : "Kilitli"} tone={canSend ? "primary" : "muted"} showDot={false} />
      )}
    </Pressable>
  );
}


function PrincipalFilterTabs({
  value,
  onChange,
  themeColors,
  missingCount,
  doneCount,
}: {
  value: "missing" | "done";
  onChange: (value: "missing" | "done") => void;
  themeColors: AppThemeColors;
  missingCount: number;
  doneCount: number;
}) {
  return (
    <View style={[styles.principalHeaderTabs, { backgroundColor: themeColors.bgElev2, borderColor: themeColors.border }]}>
      <Pressable
        onPress={() => onChange("missing")}
        style={[styles.principalHeaderTab, value === "missing" ? [styles.principalHeaderTabActive, { backgroundColor: themeColors.bgElev }] : null]}
        testID="temel-filter-missing"
      >
        <Text style={[styles.principalHeaderTabText, { color: value === "missing" ? themeColors.primary : themeColors.textDim }]}>
          Eksik {missingCount}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("done")}
        style={[styles.principalHeaderTab, value === "done" ? [styles.principalHeaderTabActive, { backgroundColor: themeColors.bgElev }] : null]}
        testID="temel-filter-done"
      >
        <Text style={[styles.principalHeaderTabText, { color: value === "done" ? themeColors.primary : themeColors.textDim }]}>
          Tamam {doneCount}
        </Text>
      </Pressable>
    </View>
  );
}

function ModulePanel({
  module,
  context,
  progress,
  workItem,
  required,
  isHeadquarter,
  scenarioLocked,
  canWrite,
  user,
  savingTemelBilgiler,
  savingKapasite,
  savingNorm,
  savingIk,
  savingGelirler,
  savingGiderler,
  savingDiscounts,
  permissionScope,
  onModuleDirtyPathsChange,
  onSaveTemelBilgiler,
  onSaveKapasite,
  onSaveNorm,
  onSaveIk,
  onSaveGelirler,
  onSaveGiderler,
  onSaveDiscounts,
  onSectionModeBack,
  temelSectionFilter,
  onTemelSectionFilterChange,
  temelActiveSection,
  onTemelActiveSectionChange,
  stickyTemelSectionActions,
  stickyTemelSectionBottomInset,
  kapasiteSectionFilter,
  onKapasiteSectionFilterChange,
  kapasiteActiveSection,
  onKapasiteActiveSectionChange,
  stickyKapasiteSectionActions,
  stickyKapasiteSectionBottomInset,
  normSectionFilter,
  onNormSectionFilterChange,
  normActiveSection,
  onNormActiveSectionChange,
  stickyNormSectionActions,
  stickyNormSectionBottomInset,
  ikSectionFilter,
  onIkSectionFilterChange,
  ikActiveSection,
  onIkActiveSectionChange,
  stickyIkSectionActions,
  stickyIkSectionBottomInset,
  gelirlerSectionFilter,
  onGelirlerSectionFilterChange,
  gelirlerActiveSection,
  onGelirlerActiveSectionChange,
  stickyGelirlerSectionActions,
  stickyGelirlerSectionBottomInset,
  giderlerSectionFilter,
  onGiderlerSectionFilterChange,
  giderlerActiveSection,
  onGiderlerActiveSectionChange,
  stickyGiderlerSectionActions,
  stickyGiderlerSectionBottomInset,
}: {
  module: ModuleDef;
  context: ScenarioContext | null;
  progress: ProgressModel | null;
  workItem?: WorkItem;
  required: boolean;
  isHeadquarter: boolean;
  scenarioLocked: boolean;
  canWrite: boolean;
  user: User | null | undefined;
  savingTemelBilgiler: boolean;
  savingKapasite: boolean;
  savingNorm: boolean;
  savingIk: boolean;
  savingGelirler: boolean;
  savingGiderler: boolean;
  savingDiscounts: boolean;
  permissionScope: PermissionScope;
  onModuleDirtyPathsChange: (paths: string[], source?: string) => void;
  onSaveTemelBilgiler: (draft: TemelBilgilerDraft) => Promise<void>;
  onSaveKapasite: (draft: KapasiteDraft) => Promise<void>;
  onSaveNorm: (draft: NormDraft) => Promise<void>;
  onSaveIk: (draft: IkDraft) => Promise<void>;
  onSaveGelirler: (draft: GelirlerDraft) => Promise<void>;
  onSaveGiderler: (draft: GiderlerDraft) => Promise<void>;
  onSaveDiscounts: (draft: DiscountsDraft) => Promise<void>;
  onSectionModeBack?: () => void;
  temelSectionFilter?: TemelSectionFilter;
  onTemelSectionFilterChange?: (filter: TemelSectionFilter) => void;
  temelActiveSection?: TemelSectionKey | null;
  onTemelActiveSectionChange?: (section: TemelSectionKey | null) => void;
  stickyTemelSectionActions?: boolean;
  stickyTemelSectionBottomInset?: number;
  kapasiteSectionFilter?: KapasiteSectionFilter;
  onKapasiteSectionFilterChange?: (filter: KapasiteSectionFilter) => void;
  kapasiteActiveSection?: KapasiteSectionKey | null;
  onKapasiteActiveSectionChange?: (section: KapasiteSectionKey | null) => void;
  stickyKapasiteSectionActions?: boolean;
  stickyKapasiteSectionBottomInset?: number;
  normSectionFilter?: NormSectionFilter;
  onNormSectionFilterChange?: (filter: NormSectionFilter) => void;
  normActiveSection?: NormSectionKey | null;
  onNormActiveSectionChange?: (section: NormSectionKey | null) => void;
  stickyNormSectionActions?: boolean;
  stickyNormSectionBottomInset?: number;
  ikSectionFilter?: IkSectionFilter;
  onIkSectionFilterChange?: (filter: IkSectionFilter) => void;
  ikActiveSection?: IkSectionKey | null;
  onIkActiveSectionChange?: (section: IkSectionKey | null) => void;
  stickyIkSectionActions?: boolean;
  stickyIkSectionBottomInset?: number;
  gelirlerSectionFilter?: GelirlerSectionFilter;
  onGelirlerSectionFilterChange?: (filter: GelirlerSectionFilter) => void;
  gelirlerActiveSection?: GelirlerMobileSectionKey | null;
  onGelirlerActiveSectionChange?: (section: GelirlerMobileSectionKey | null) => void;
  stickyGelirlerSectionActions?: boolean;
  stickyGelirlerSectionBottomInset?: number;
  giderlerSectionFilter?: GiderlerSectionFilter;
  onGiderlerSectionFilterChange?: (filter: GiderlerSectionFilter) => void;
  giderlerActiveSection?: GiderlerMobileSectionKey | null;
  onGiderlerActiveSectionChange?: (section: GiderlerMobileSectionKey | null) => void;
  stickyGiderlerSectionActions?: boolean;
  stickyGiderlerSectionBottomInset?: number;
}) {
  const { colors: themeColors } = useAppTheme();
  const isPrincipal = String(user?.role || "") === "principal";
  const moduleProgress = progressForModule(module, progress);
  const workMeta = workStateMeta(themeColors, workItem?.state);
  const optionalReason = isHeadquarter && module.workId && !required ? "HQ senaryoda opsiyonel" : "";
  const editorReady =
    module.key === "temel_bilgiler" ||
    module.key === "kapasite" ||
    module.key === "norm.ders_dagilimi" ||
    module.key === "ik.local_staff" ||
    module.key === "gelirler.unit_fee" ||
    module.key === "giderler.isletme";
  const lockReason = scenarioLocked
    ? "Senaryo kilitli"
    : workMeta.locked
      ? "Modul inceleme/onay durumunda"
      : !canWrite
        ? "Bu modul icin yazma yetkiniz yok"
        : optionalReason || (editorReady
          ? "Degisiklikleri kaydetmeden modul degistirilemez"
          : "Editor port edilene kadar salt okunur; tamamlanan modul footer'dan gonderilebilir");
  const canEditModule = canWrite && !scenarioLocked && !workMeta.locked;
  const canWriteDiscounts =
    can(user, "section.discounts.discounts", "write", permissionScope) ||
    can(user, "page.discounts", "write", permissionScope);
  const canEditDiscounts = canWriteDiscounts && !scenarioLocked && !workMeta.locked;
  const discountsLockReason = scenarioLocked
    ? "Senaryo kilitli"
    : workMeta.locked
      ? "Modul inceleme/onay durumunda"
      : !canWriteDiscounts
        ? "Indirimler icin yazma yetkiniz yok"
        : "Indirim degisiklikleri kaydedilmeden modul degistirilemez";
  const onTemelDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "temel_bilgiler"), [onModuleDirtyPathsChange]);
  const onKapasiteDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "kapasite"), [onModuleDirtyPathsChange]);
  const onNormDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "norm"), [onModuleDirtyPathsChange]);
  const onIkDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "ik"), [onModuleDirtyPathsChange]);
  const onGelirlerDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "gelirler"), [onModuleDirtyPathsChange]);
  const onGiderlerDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "giderler"), [onModuleDirtyPathsChange]);
  const onDiscountsDirty = React.useCallback((paths: string[]) => onModuleDirtyPathsChange(paths, "discounts"), [onModuleDirtyPathsChange]);

  return (
    <>
      {!isPrincipal && !stickyTemelSectionActions && !stickyKapasiteSectionActions && !stickyNormSectionActions && !stickyIkSectionActions && !stickyGelirlerSectionActions ? (
        <Card testID={`module-${module.key}`} style={styles.moduleShellCard}>
          <View style={styles.moduleTop}>
            <View style={[styles.moduleIcon, { backgroundColor: alpha(themeColors.primary, 0.14) }]}>
              <Ionicons name={module.icon} size={20} color={themeColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{module.label}</Text>
              <Text style={[styles.sectionSub, { color: themeColors.textDim }]}>{required ? "Zorunlu modül" : "Opsiyonel veya rapor modülü"}</Text>
            </View>
            {canWrite ? (
              <View style={[styles.writePill, { backgroundColor: alpha(themeColors.success, 0.12), borderColor: alpha(themeColors.success, 0.34) }]}>
                <Text style={[styles.writePillText, { color: themeColors.success }]}>Yazma</Text>
              </View>
            ) : null}
            <StatusPill
              label={workMeta.label}
              tone={workStateTone(workItem?.state)}
              icon={workMeta.icon}
              showDot={false}
            />
          </View>

          {moduleProgress.pct != null ? (
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar value={moduleProgress.pct} />
              <View style={styles.progressLine}>
                <Text style={[styles.progressText, { color: themeColors.textDim }]}>{Math.round(moduleProgress.pct)}%</Text>
                <Text style={[styles.progressText, { color: themeColors.textDim }]}>{moduleProgress.done ? "Tamam" : "Eksik"}</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.noticeBox, { backgroundColor: alpha(themeColors.warn, 0.08), borderColor: alpha(themeColors.warn, 0.28) }]}>
            <Ionicons name="lock-closed-outline" size={15} color={themeColors.warn} />
            <Text style={[styles.noticeText, { color: themeColors.textDim }]}>{lockReason}</Text>
          </View>

          {workItem?.manager_comment ? (
            <View style={[styles.commentBox, { backgroundColor: themeColors.bgElev2, borderColor: themeColors.border }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={themeColors.textDim} />
              <Text style={[styles.commentText, { color: themeColors.textDim }]}>{workItem.manager_comment}</Text>
            </View>
          ) : null}

          {moduleProgress.missingLines.length ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Text style={[styles.tinyLabel, { color: themeColors.textDim }]}>Modül Eksikleri</Text>
              {moduleProgress.missingLines.slice(0, 5).map((line) => (
                <Text key={line} style={[styles.missingLine, { backgroundColor: themeColors.bgElev2, borderColor: themeColors.border, color: themeColors.textDim }]} numberOfLines={2}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {module.key === "temel_bilgiler" ? (
        <TemelBilgilerEditor
          value={context?.inputs?.temelBilgiler}
          scenario={context?.scenario || null}
          user={user}
          currencyCode={resolveCurrency(context?.scenario || null)}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingTemelBilgiler}
          onDirtyPathsChange={onTemelDirty}
          onSave={onSaveTemelBilgiler}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={temelSectionFilter}
          onSectionFilterChange={onTemelSectionFilterChange}
          activeSectionKey={temelActiveSection}
          onActiveSectionKeyChange={onTemelActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyTemelSectionActions)}
          stickyBottomInset={stickyTemelSectionBottomInset || 0}
        />
      ) : module.key === "kapasite" ? (
        <KapasiteEditor
          value={context?.inputs?.kapasite}
          inputs={context?.inputs || null}
          scenario={context?.scenario || null}
          user={user}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingKapasite}
          onDirtyPathsChange={onKapasiteDirty}
          onSave={onSaveKapasite}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={kapasiteSectionFilter}
          onSectionFilterChange={onKapasiteSectionFilterChange}
          activeSectionKey={kapasiteActiveSection}
          onActiveSectionKeyChange={onKapasiteActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyKapasiteSectionActions)}
          stickyBottomInset={stickyKapasiteSectionBottomInset || 0}
        />
      ) : module.key === "norm.ders_dagilimi" ? (
        <NormEditor
          value={context?.norm}
          inputs={context?.inputs || null}
          scenario={context?.scenario || null}
          canEditGradePlan={canEditModule}
          canEditNormConfig={canEditModule && can(user, "page.norm", "write", permissionScope)}
          disabledReason={lockReason}
          saving={savingNorm}
          onDirtyPathsChange={onNormDirty}
          onSave={onSaveNorm}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={normSectionFilter}
          onSectionFilterChange={onNormSectionFilterChange}
          activeSectionKey={normActiveSection}
          onActiveSectionKeyChange={onNormActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyNormSectionActions)}
          stickyBottomInset={stickyNormSectionBottomInset || 0}
        />
      ) : module.key === "ik.local_staff" ? (
        <IkEditor
          value={context?.inputs?.ik}
          inputs={context?.inputs || null}
          scenario={context?.scenario || null}
          currencyCode={resolveCurrency(context?.scenario || null)}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingIk}
          onDirtyPathsChange={onIkDirty}
          onSave={onSaveIk}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={ikSectionFilter}
          onSectionFilterChange={onIkSectionFilterChange}
          activeSectionKey={ikActiveSection}
          onActiveSectionKeyChange={onIkActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyIkSectionActions)}
          stickyBottomInset={stickyIkSectionBottomInset || 0}
        />
      ) : module.key === "gelirler.unit_fee" ? (
        <GelirlerEditor
          value={context?.inputs?.gelirler}
          inputs={context?.inputs || null}
          scenario={context?.scenario || null}
          currencyCode={resolveCurrency(context?.scenario || null)}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingGelirler}
          onDirtyPathsChange={onGelirlerDirty}
          onSave={onSaveGelirler}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={gelirlerSectionFilter}
          onSectionFilterChange={onGelirlerSectionFilterChange}
          activeSectionKey={gelirlerActiveSection}
          onActiveSectionKeyChange={onGelirlerActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyGelirlerSectionActions)}
          stickyBottomInset={stickyGelirlerSectionBottomInset || 0}
        />
      ) : module.key === "giderler.isletme" ? (
        <GiderlerEditor
          value={context?.inputs?.giderler}
          inputs={context?.inputs || null}
          scenario={context?.scenario || null}
          currencyCode={resolveCurrency(context?.scenario || null)}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingGiderler}
          onDirtyPathsChange={onGiderlerDirty}
          onSave={onSaveGiderler}
          discountsValue={context?.inputs?.discounts}
          discountsCanEdit={canEditDiscounts}
          discountsDisabledReason={discountsLockReason}
          discountsSaving={savingDiscounts}
          onDiscountsDirtyPathsChange={onDiscountsDirty}
          onDiscountsSave={onSaveDiscounts}
          sectionMode
          onSectionModeBack={onSectionModeBack}
          sectionFilter={giderlerSectionFilter}
          onSectionFilterChange={onGiderlerSectionFilterChange}
          activeSectionKey={giderlerActiveSection}
          onActiveSectionKeyChange={onGiderlerActiveSectionChange}
          showSectionModeTopControls={!isPrincipal}
          stickySectionActions={Boolean(stickyGiderlerSectionActions)}
          stickyBottomInset={stickyGiderlerSectionBottomInset || 0}
        />
      ) : (
        <ModuleReadOnlySummary module={module} context={context} />
      )}
    </>
  );
}

function ModuleReadOnlySummary({ module, context }: { module: ModuleDef; context: ScenarioContext | null }) {
  const inputs = context?.inputs || null;
  const scenario = context?.scenario || null;
  const norm = context?.norm;
  const currency = resolveCurrency(scenario);
  const temel = asObject(inputs?.temelBilgiler);
  const kapasite = asObject(inputs?.kapasite);
  const years = asObject(kapasite.years);

  if (module.key === "temel_bilgiler") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Senaryo" value={scenario?.name || "-"} />
          <Row label="Akademik yil" value={scenario?.academic_year || "-"} />
          <Row label="Program tipi" value={String(temel.programType || scenario?.program_type || "-")} />
          <Row label="Etkin kademe" value={formatInt(countEnabledKademeler(inputs))} />
          <Row label="Input guncelleme" value={formatDate(context?.inputsUpdatedAt)} />
        </View>
      </Card>
    );
  }

  if (module.key === "kapasite") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Mevcut ogrenci" value={formatInt(num(kapasite.currentStudents))} />
          <Row label="Yil 1 kapasite" value={formatInt(num(years.y1))} />
          <Row label="Yil 2 kapasite" value={formatInt(num(years.y2))} />
          <Row label="Yil 3 kapasite" value={formatInt(num(years.y3))} />
          <Row label="Kademe detayi" value={formatInt(countObjectKeys(kapasite.byKademe))} />
        </View>
      </Card>
    );
  }

  if (module.key === "norm.ders_dagilimi") {
    const normYears = asObject(asObject(norm).years);
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        {norm ? (
          <View style={{ marginTop: spacing.sm }}>
            <Row label="Yil 1 haftalik max" value={String(asObject(normYears.y1).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Yil 2 haftalik max" value={String(asObject(normYears.y2).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Yil 3 haftalik max" value={String(asObject(normYears.y3).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Ders saati tanimi" value={formatInt(countCurriculumEntries(norm))} />
            <Row label="Norm guncelleme" value={formatDate(context?.normUpdatedAt)} />
          </View>
        ) : (
          <Text style={styles.emptyText}>Norm konfigurasyonu bu kullanici icin okunamadi veya henuz yok.</Text>
        )}
      </Card>
    );
  }

  if (module.key === "ik.local_staff") {
    const ik = asObject(inputs?.ik);
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Yerel kadro yillari" value={formatInt(countObjectKeys(ik.years))} />
          <Row label="HQ kadro tanimi" value={formatInt(countObjectKeys(ik.hq))} />
          <Row label="Varsayim seti" value={formatInt(countObjectKeys(ik.assumptions))} />
        </View>
      </Card>
    );
  }

  if (module.key === "gelirler.unit_fee") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Ogrenim ucreti satiri" value={formatInt(countTuitionRows(inputs))} />
          <Row label="Egitim disi gelir" value={formatInt(countIncomeRows(inputs, "nonEducationFees"))} />
          <Row label="Yurt geliri" value={formatInt(countIncomeRows(inputs, "dormitory"))} />
          <Row label="Diger kurum geliri" value={formatInt(countIncomeRows(inputs, "otherInstitutionIncome"))} />
          <Row label="Para birimi" value={currency} />
        </View>
      </Card>
    );
  }

  if (module.key === "giderler.isletme") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Isletme gider kalemi" value={formatInt(countExpenseItems(inputs, "isletme"))} />
          <Row label="Ogrenim disi gider" value={formatInt(countExpenseItems(inputs, "ogrenimDisi"))} />
          <Row label="Yurt gideri" value={formatInt(countExpenseItems(inputs, "yurt"))} />
          <Row label="Para birimi" value={currency} />
        </View>
      </Card>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  principalHeaderTabs: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  principalHeaderTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  principalHeaderTabActive: {
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  principalHeaderTabText: {
    ...font.small,
    fontWeight: "900",
  },
  principalHeaderTabLine: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 0,
    height: 3,
    borderRadius: 999,
  },
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerPad: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
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
  headerSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  headerStatusPill: { maxWidth: 138 },
  errorWrap: { padding: spacing.lg },
  errorText: { color: colors.danger, ...font.body },
  summaryWrap: { padding: spacing.lg, paddingBottom: spacing.md },
  principalFlow: { padding: spacing.lg, gap: spacing.md },
  principalBody: { paddingTop: 0 },
  principalScenarioCard: { borderRadius: 24, gap: spacing.md },
  principalScenarioTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  principalScenarioTitle: { ...font.h3, fontSize: 17, letterSpacing: -0.2 },
  principalScenarioMeta: { ...font.small, marginTop: 4 },
  principalScenarioStatus: { maxWidth: 132 },
  principalProgressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  principalProgressTrack: { flex: 1, minWidth: 0 },
  principalPercent: { ...font.small, width: 42, flexShrink: 0, textAlign: "right", fontWeight: "900" },
  principalPillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  principalMiniPill: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  principalMiniPillText: { ...font.tiny, fontWeight: "900" },
  principalModuleCard: {
    minHeight: 78,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  principalModuleIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  principalModuleTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  principalModuleTitle: { ...font.bodyMd, fontWeight: "900" },
  principalModulePct: { ...font.tiny, fontWeight: "900" },
  principalModuleSub: { ...font.small, marginTop: 3, lineHeight: 18 },
  principalSendCard: {
    minHeight: 84,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  principalSendTitle: { ...font.bodyMd, fontWeight: "900" },
  principalSendSub: { ...font.small, marginTop: 4, lineHeight: 18 },
  summaryStack: { gap: spacing.md },
  heroStatusBadge: {
    maxWidth: 116,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroStatusText: { color: "#FFFFFF", ...font.tiny, fontWeight: "800" },
  heroFooterText: { color: "rgba(255,255,255,0.84)", ...font.small, lineHeight: 18 },
  summaryStatsRow: { flexDirection: "row", gap: spacing.sm },
  summaryStatCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryStatIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryStatLabel: { ...font.tiny, letterSpacing: 0 },
  summaryStatValue: { ...font.h3, marginTop: 2 },
  missingCard: { gap: 0 },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  progressLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  progressText: { color: colors.textDim, ...font.small },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F9731644",
    backgroundColor: "#F9731614",
  },
  noticeText: { color: colors.textDim, ...font.small, flex: 1 },
  missingLine: {
    color: colors.textDim,
    ...font.small,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tinyLabel: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  tabRow: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  tabHeader: { paddingHorizontal: spacing.lg, marginBottom: 0 },
  tabContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, gap: spacing.sm },
  moduleTabCard: {
    width: 136,
    minHeight: 112,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    overflow: "hidden",
  },
  moduleTabCardActive: {
    borderWidth: 1,
  },
  moduleTabTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  moduleTabIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTabPercent: { ...font.tiny, fontWeight: "900" },
  moduleTabTitle: { ...font.bodyMd, marginTop: spacing.md },
  moduleTabSub: { ...font.tiny, letterSpacing: 0, marginTop: 4 },
  moduleTabAccent: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    height: 4,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
  },
  sectionEditorScrollContent: {
    flexGrow: 1,
  },
  sectionEditorBody: {
    flex: 1,
    paddingBottom: 0,
  },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  moduleShellCard: { borderRadius: radius.xl },
  moduleTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  writePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#22C55E55",
    backgroundColor: "#22C55E18",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  writePillText: { color: colors.success, ...font.tiny, letterSpacing: 0 },
  commentBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentText: { color: colors.textDim, ...font.small, flex: 1 },
  emptyText: { color: colors.textDim, ...font.small, textAlign: "center", lineHeight: 20 },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    ...shadow.nav,
  },
  footerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  footerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  footerActionButton: {
    flexGrow: 1,
    minWidth: 112,
  },
  footerTitle: { color: colors.text, ...font.bodyMd },
  footerSub: { color: colors.textDim, ...font.tiny, marginTop: 2, letterSpacing: 0 },
  revisionInput: {
    minHeight: 44,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...font.small,
  },
});
