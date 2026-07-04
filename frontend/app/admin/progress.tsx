import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { Country, api } from "@/src/api/client";
import {
  PROGRESS_SECTIONS,
  PROGRESS_TABS,
  ProgressConfig,
  normalizeProgressConfig,
} from "@/src/admin/pr09";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, EmptyState, Input } from "@/src/ui/components";

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/schools");
}

export default function AdminProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryId, setCountryId] = useState<string>("");
  const [config, setConfig] = useState<ProgressConfig | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [activeTab, setActiveTab] = useState(PROGRESS_TABS[0].key);
  const [search, setSearch] = useState("");
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [err, setErr] = useState("");

  const dirty = useMemo(() => {
    if (!config) return false;
    return JSON.stringify(normalizeProgressConfig(config)) !== snapshot;
  }, [config, snapshot]);

  const loadCountries = useCallback(async () => {
    const res = await api.adminListCountries();
    setCountries(res.items);
    setCountryId((prev) => prev || (res.items[0] ? String(res.items[0].id) : ""));
  }, []);

  const loadConfig = useCallback(async (idValue: string) => {
    if (!idValue) {
      setConfig(null);
      setSnapshot("");
      return;
    }
    setErr("");
    setMessage("");
    setLoading(true);
    try {
      const payload = await api.adminGetProgressRequirements(idValue) as { config?: unknown };
      const next = normalizeProgressConfig(payload?.config);
      setConfig(next);
      setSnapshot(JSON.stringify(next));
    } catch (error: any) {
      setErr(error?.message || "Ilerleme kurallari yuklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadCountries();
      } catch (error: any) {
        setErr(error?.message || "Ulkeler yuklenemedi.");
        setLoading(false);
      }
    })();
  }, [loadCountries]);

  useEffect(() => {
    if (countryId) loadConfig(countryId);
  }, [countryId, loadConfig]);

  function updateSection(sectionId: string, updater: (section: NonNullable<ProgressConfig["sections"]>[string]) => void) {
    setBulkConfirm(false);
    setConfig((prev) => {
      const base = normalizeProgressConfig(prev);
      const section = { ...(base.sections?.[sectionId] || {}) };
      updater(section);
      return {
        ...base,
        sections: {
          ...(base.sections || {}),
          [sectionId]: section,
        },
      };
    });
  }

  async function save() {
    if (!countryId || !config) return;
    setSaving(true);
    setErr("");
    setMessage("");
    try {
      const normalized = normalizeProgressConfig(config);
      const saved = await api.adminSaveProgressRequirements(countryId, normalized) as { config?: unknown };
      const next = normalizeProgressConfig(saved?.config || normalized);
      setConfig(next);
      setSnapshot(JSON.stringify(next));
      setMessage("Ilerleme kurallari kaydedildi.");
    } catch (error: any) {
      setErr(error?.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function applyBulk() {
    if (!config || !countryId || !targetIds.size) return;
    if (!bulkConfirm) {
      setBulkConfirm(true);
      setMessage("Secili ulkelere uygulamak icin tekrar onaylayin.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const normalized = normalizeProgressConfig(config);
      await api.adminBulkSaveProgressRequirements(Array.from(targetIds), normalized);
      const nextMessage = `${targetIds.size} ulkeye ilerleme kurallari uygulandi.`;
      setBulkConfirm(false);
      await loadConfig(countryId);
      setMessage(nextMessage);
    } catch (error: any) {
      setErr(error?.message || "Toplu uygulama basarisiz.");
    } finally {
      setSaving(false);
    }
  }

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PROGRESS_SECTIONS.filter((section) => {
      if (section.tabKey !== activeTab) return false;
      if (!q) return true;
      return `${section.label} ${section.id}`.toLowerCase().includes(q);
    });
  }, [activeTab, search]);

  const selectedCountry = countries.find((country) => String(country.id) === String(countryId));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-progress-screen">
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn} testID="admin-progress-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YONETIM</Text>
          <Text style={styles.headerTitle}>Ilerleme Kurallari</Text>
        </View>
        <Button label="Kaydet" icon="save-outline" small onPress={save} loading={saving} disabled={!dirty || !countryId} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (dirty) {
                setMessage("Once degisiklikleri kaydedin veya vazgecin.");
                setRefreshing(false);
                return;
              }
              setRefreshing(true);
              loadConfig(countryId);
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
        {message ? <Notice icon="information-circle-outline" color={colors.primary} text={message} /> : null}

        <Card>
          <Text style={styles.sectionTitle}>Ulke</Text>
          <Text style={styles.sectionSub}>Kurallar secili ulke icin kaydedilir.</Text>
          <View style={styles.chipGroup}>
            {countries.map((country) => (
              <Chip
                key={country.id}
                label={country.name}
                active={String(country.id) === countryId}
                onPress={() => {
                  if (dirty) {
                    setMessage("Ulke degistirmeden once kaydedin veya yenileyin.");
                    return;
                  }
                  setCountryId(String(country.id));
                  setTargetIds(new Set());
                }}
              />
            ))}
          </View>
        </Card>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !countryId || !config ? (
          <EmptyState icon="earth-outline" title="Ulke secin" subtitle="Ilerleme kurallarini duzenlemek icin ulke secin." />
        ) : (
          <>
            <Card>
              <Text style={styles.sectionTitle}>{selectedCountry?.name || "Secili ulke"}</Text>
              <Text style={styles.sectionSub}>Modul bazli zorunluluklari ac/kapat, ALL veya MIN modu sec.</Text>
              <Input value={search} onChangeText={setSearch} placeholder="Bolum veya anahtar ara..." />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {PROGRESS_TABS.map((tab) => (
                  <Chip key={tab.key} label={tab.label} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />
                ))}
              </ScrollView>
            </Card>

            {visibleSections.map((section) => {
              const sectionConfig = config.sections?.[section.id] || {};
              const enabled = sectionConfig.enabled !== false;
              const mode = String(sectionConfig.mode || "ALL").toUpperCase() === "MIN" ? "MIN" : "ALL";
              return (
                <Card key={section.id} testID={`admin-progress-section-${section.id}`}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{section.label}</Text>
                      <Text style={styles.cardSub}>{section.id}</Text>
                    </View>
                    <Chip
                      label={enabled ? "Aktif" : "Kapali"}
                      active={enabled}
                      onPress={() => updateSection(section.id, (draft) => { draft.enabled = !enabled; })}
                    />
                  </View>
                  <View style={styles.inlineChips}>
                    <Chip
                      label="ALL"
                      active={mode === "ALL"}
                      onPress={() => updateSection(section.id, (draft) => { draft.mode = "ALL"; })}
                    />
                    <Chip
                      label="MIN"
                      active={mode === "MIN"}
                      onPress={() => updateSection(section.id, (draft) => { draft.mode = "MIN"; draft.min = Number(draft.min || section.minDefault || 1); })}
                    />
                  </View>
                  {mode === "MIN" ? (
                    <Input
                      label="Minimum alan sayisi"
                      value={String(sectionConfig.min || section.minDefault || 1)}
                      keyboardType="numeric"
                      onChangeText={(value) => updateSection(section.id, (draft) => {
                        const n = Number(value.replace(/[^\d]/g, ""));
                        draft.min = Number.isFinite(n) && n > 0 ? n : 1;
                      })}
                    />
                  ) : null}
                </Card>
              );
            })}

            <Card>
              <Text style={styles.sectionTitle}>Toplu Uygula</Text>
              <Text style={styles.sectionSub}>Secili ulkenin mevcut kurallarini diger ulkelere kopyalar.</Text>
              <View style={styles.chipGroup}>
                {countries.filter((country) => String(country.id) !== countryId).map((country) => {
                  const id = String(country.id);
                  return (
                    <Chip
                      key={id}
                      label={country.name}
                      active={targetIds.has(id)}
                      onPress={() => {
                        setBulkConfirm(false);
                        setTargetIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                    />
                  );
                })}
              </View>
              <Button
                label={bulkConfirm ? "Onayla ve Uygula" : `Secili Ulkelere Uygula (${targetIds.size})`}
                icon="copy-outline"
                variant={bulkConfirm ? "danger" : "secondary"}
                onPress={applyBulk}
                loading={saving && bulkConfirm}
                disabled={!targetIds.size || !config}
              />
            </Card>
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
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardTitle: { color: colors.text, ...font.bodyMd },
  cardSub: { color: colors.textMuted, ...font.tiny, marginTop: 2 },
  tabs: { gap: spacing.sm, alignItems: "center", paddingVertical: spacing.xs },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  inlineChips: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md },
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
