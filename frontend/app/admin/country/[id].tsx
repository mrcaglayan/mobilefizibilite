// Admin: Single country — schools list + create school in this country.

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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Country, School, api } from "@/src/api/client";
import { alpha, colors, font, radius, spacing } from "@/src/theme";
import { Button, Chip, EmptyStateCard, Input } from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";

export default function AdminCountryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [country, setCountry] = useState<Country | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    try {
      const [cRes, sRes] = await Promise.all([
        api.adminListCountries(),
        api.adminListCountrySchools(id, { includeClosed: true }),
      ]);
      const list: Country[] = cRes.items;
      const found = list.find((c) => String(c.id) === String(id)) || null;
      setCountry(found);
      setSchools(sRes.items);
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const filtered = useMemo(() => {
    if (statusFilter === "all") return schools;
    return schools.filter((s) => (s as any).status === statusFilter);
  }, [schools, statusFilter]);

  async function toggleSchoolStatus(school: School) {
    const current = (school as any).status || "active";
    const next = current === "active" ? "closed" : "active";
    try {
      await api.adminUpdateSchool(school.id, { status: next as any });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(next === "active" ? "Okul yeniden açıldı" : "Okul kapatıldı");
      await load();
    } catch (e: any) {
      setErr(e?.message || "İşlem başarısız");
    }
  }

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
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-country-screen">
      <View style={styles.header}>
        <Pressable
          testID="admin-country-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>ÜLKE</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {country?.name || "-"}
          </Text>
        </View>
        <Button
          label="Okul Ekle"
          icon="add"
          small
          onPress={() => setShowCreate(true)}
          testID="admin-country-add-school"
        />
      </View>

      {/* Country info */}
      {country ? (
        <View style={styles.info}>
          <View style={styles.flag}>
            <Text style={styles.flagText}>{country.code}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {country.name}
            </Text>
            <Text style={styles.infoSub}>
              {country.region || "-"} · {schools.length} okul
            </Text>
          </View>
        </View>
      ) : null}

      {/* Status filter */}
      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
          <Chip
            label="Tümü"
            active={statusFilter === "all"}
            onPress={() => setStatusFilter("all")}
            testID="admin-country-filter-all"
          />
          <Chip
            label="Aktif"
            active={statusFilter === "active"}
            onPress={() => setStatusFilter("active")}
            testID="admin-country-filter-active"
          />
          <Chip
            label="Kapalı"
            active={statusFilter === "closed"}
            onPress={() => setStatusFilter("closed")}
            testID="admin-country-filter-closed"
          />
        </ScrollView>
      </View>

      {err ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <View style={styles.errBox} testID="admin-country-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.sm,
        }}
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
          <EmptyStateCard
            icon="school-outline"
            title="Okul bulunamadı"
            subtitle="Sağ üstteki Okul Ekle düğmesi ile ekleyebilirsiniz."
          />
        }
        renderItem={({ item }) => {
          const status = (item as any).status || "active";
          const closed = status === "closed";
          return (
            <View
              testID={`admin-country-school-${item.id}`}
              style={[
                styles.schoolCard,
                closed && { opacity: 0.75 },
              ]}
            >
              <Pressable
                onPress={() => router.push(`/school/${item.id}`)}
                style={styles.schoolMain}
              >
                <View style={styles.schoolIcon}>
                  <Ionicons name="school-outline" size={20} color={closed ? colors.textDim : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.schoolName, closed && { textDecorationLine: "line-through" }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.schoolMeta}>
                    Oluşturma {new Date(item.created_at).toLocaleDateString("tr-TR")}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                testID={`admin-country-assignments-${item.id}`}
                onPress={() => router.push({ pathname: "/admin/schools/[id]/assignments", params: { id: String(item.id) } })}
                hitSlop={8}
                style={styles.assignmentBtn}
              >
                <Ionicons name="people-outline" size={16} color={colors.primary} />
                <Text style={{ ...font.tiny, color: colors.primary }}>ATAMA</Text>
              </Pressable>
              <Pressable
                testID={`admin-country-toggle-${item.id}`}
                onPress={() => toggleSchoolStatus(item)}
                hitSlop={8}
                style={[
                  styles.toggleBtn,
                  { borderColor: closed ? colors.success : alpha(colors.danger, 0.28) },
                ]}
              >
                <Ionicons
                  name={closed ? "refresh-outline" : "close-circle-outline"}
                  size={16}
                  color={closed ? colors.success : colors.danger}
                />
                <Text style={{ ...font.tiny, color: closed ? colors.success : colors.danger }}>
                  {closed ? "AÇ" : "KAPAT"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      <CreateSchoolSheet
        visible={showCreate}
        countryName={country?.name || ""}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          setShowCreate(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Okul eklendi");
          await load();
        }}
        countryId={id!}
      />

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 20 }]} testID="admin-country-toast">
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function CreateSchoolSheet({
  visible,
  countryId,
  countryName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  countryId: string;
  countryName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (visible) {
      setName("");
      setErr("");
    }
  }, [visible]);

  async function submit() {
    setErr("");
    if (!name.trim()) return setErr("Okul adı zorunlu");
    setSaving(true);
    try {
      await api.adminCreateCountrySchool(countryId, { name: name.trim() });
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Oluşturulamadı");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Yeni Okul" testID="create-school-sheet">
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {err ? (
          <View style={styles.errBox} testID="create-school-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <Text style={styles.hint}>
          Yeni okul <Text style={{ color: colors.text }}>{countryName || "-"}</Text> ülkesine eklenecek.
        </Text>

        <Input
          label="Okul / Kampüs Adı"
          value={name}
          onChangeText={setName}
          placeholder="İstanbul Ataşehir Kampüsü"
          testID="create-school-name"
        />

        <Button
          label="Okulu Oluştur"
          icon="checkmark"
          onPress={submit}
          loading={saving}
          disabled={!name.trim()}
          style={{ marginTop: spacing.md }}
          testID="create-school-submit"
        />
      </ScrollView>
    </BottomSheet>
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
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flag: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: alpha(colors.accent, 0.16),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.28),
  },
  flagText: { color: colors.primary, ...font.mono, fontSize: 15 },
  infoTitle: { color: colors.text, ...font.h3 },
  infoSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  chipsRow: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  schoolCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  schoolMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  schoolIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: alpha(colors.primary, 0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  schoolName: { color: colors.text, ...font.bodyMd, fontSize: 15 },
  schoolMeta: { color: colors.textDim, ...font.small, marginTop: 2 },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.bgElev2,
  },
  assignmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.28),
    backgroundColor: alpha(colors.primary, 0.08),
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: alpha(colors.danger, 0.1),
    borderColor: alpha(colors.danger, 0.28),
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errText: { color: colors.danger, ...font.small, flex: 1 },
  hint: { color: colors.textDim, ...font.small, marginBottom: spacing.md },
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
});
