// School detail — scenarios list for a specific school.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, Scenario, School } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme";
import { EmptyState } from "@/src/ui/components";

export default function SchoolScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    try {
      const [s, sc] = await Promise.all([api.getSchool(id), api.listScenarios(id)]);
      setSchool(s);
      setScenarios(sc.items || []);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="school-detail-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          testID="school-back-button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>OKUL</Text>
          <Text numberOfLines={1} style={styles.headerTitle} testID="school-name">
            {school?.name || "Yükleniyor..."}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={{ color: colors.danger, ...font.body }}>{err}</Text>
        </View>
      ) : (
        <FlatList
          data={scenarios}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.md,
          }}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={styles.sectionTitle}>Senaryolar</Text>
              <Text style={styles.sectionSub}>
                Modellemek istediğiniz senaryoyu seçin
              </Text>
            </View>
          }
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
          ListEmptyComponent={
            <EmptyState
              icon="layers-outline"
              title="Senaryo bulunamadı"
              subtitle="Bu okul için henüz senaryo oluşturulmamış."
            />
          }
          renderItem={({ item }) => {
            const stateStyle = getStateStyle(item.state);
            return (
              <Pressable
                testID={`scenario-card-${item.id}`}
                onPress={() => router.push(`/scenario/${id}/${item.id}`)}
                style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {item.input_currency} · Güncelleme{" "}
                      {new Date(item.updated_at || item.created_at).toLocaleDateString("tr-TR")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </View>
                <View style={styles.cardFoot}>
                  <View style={[styles.stateBadge, { backgroundColor: stateStyle.bg, borderColor: stateStyle.border }]}>
                    <View style={[styles.dot, { backgroundColor: stateStyle.dot }]} />
                    <Text style={[styles.stateText, { color: stateStyle.text }]}>{stateStyle.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function getStateStyle(state?: string) {
  switch (state) {
    case "submitted":
      return {
        label: "Gönderildi",
        bg: "#4C8DFF22",
        border: "#4C8DFF55",
        text: "#93B5FF",
        dot: colors.accent,
      };
    case "approved":
      return {
        label: "Onaylandı",
        bg: "#22C55E22",
        border: "#22C55E55",
        text: "#86EFAC",
        dot: colors.success,
      };
    case "draft":
    default:
      return {
        label: "Taslak",
        bg: colors.bgElev2,
        border: colors.border,
        text: colors.textDim,
        dot: colors.textMuted,
      };
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  sectionTitle: { color: colors.text, ...font.h2 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 2, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...font.h3, color: colors.text },
  cardMeta: { color: colors.textDim, ...font.small, marginTop: 4 },
  cardFoot: { marginTop: spacing.md, flexDirection: "row" },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 999 },
  stateText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
});
