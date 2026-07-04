// Admin: Countries list — create country + tap to see country's schools.

import React, { useCallback, useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Country, api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, EmptyState, Input } from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";

const REGIONS = ["EMEA", "APAC", "AMERICAS", "GLOBAL"];

export default function AdminCountriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/schools");
  }, [router]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await api.adminListCountries();
      setCountries(res.items);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-countries-screen">
      <View style={styles.header}>
        <Pressable
          testID="admin-countries-back"
          onPress={goBack}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YÖNETİM</Text>
          <Text style={styles.headerTitle}>Ülkeler</Text>
        </View>
        <Button
          label="Ekle"
          icon="add"
          small
          onPress={() => setShowCreate(true)}
          testID="admin-countries-add-button"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={{ padding: spacing.lg }}>
          <View style={styles.errBox} testID="admin-countries-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={countries}
          keyExtractor={(c) => String(c.id)}
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
          ListHeaderComponent={
            <Text style={styles.sectionSub}>
              Her ülke kendi okullarını ve senaryolarını içerir
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="earth-outline"
              title="Henüz ülke yok"
              subtitle="Sağ üstteki Ekle düğmesi ile ekleyebilirsiniz."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`admin-country-card-${item.code}`}
              onPress={() => router.push(`/admin/country/${item.id}`)}
              style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
            >
              <View style={styles.flag}>
                <Text style={styles.flagText}>{item.code}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.region || "-"} bölgesi
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          )}
        />
      )}

      <CreateCountrySheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          setShowCreate(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function CreateCountrySheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState("EMEA");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (visible) {
      setName("");
      setCode("");
      setRegion("EMEA");
      setErr("");
    }
  }, [visible]);

  async function submit() {
    setErr("");
    if (!name.trim() || !code.trim() || !region.trim()) {
      return setErr("Ad, kod ve bölge zorunlu");
    }
    setSaving(true);
    try {
      await api.adminCreateCountry({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        region,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Oluşturulamadı");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Yeni Ülke" testID="create-country-sheet">
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {err ? (
          <View style={styles.errBox} testID="create-country-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <Input
          label="Ülke Adı"
          value={name}
          onChangeText={setName}
          placeholder="Türkiye"
          testID="create-country-name"
        />
        <Input
          label="Kod (2-3 karakter)"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={3}
          placeholder="TR"
          testID="create-country-code"
        />

        <Text style={styles.groupLabel}>BÖLGE</Text>
        <View style={styles.chipGroup}>
          {REGIONS.map((r) => (
            <Pressable
              key={r}
              testID={`create-country-region-${r}`}
              onPress={() => setRegion(r)}
              style={({ pressed }) => [
                styles.regionChip,
                {
                  backgroundColor: region === r ? colors.primary : colors.bgElev2,
                  borderColor: region === r ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: region === r ? colors.primaryText : colors.textDim,
                  ...font.small,
                  fontWeight: "700",
                }}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button
          label="Ülkeyi Oluştur"
          icon="checkmark"
          onPress={submit}
          loading={saving}
          disabled={!name || !code || !region}
          style={{ marginTop: spacing.md }}
          testID="create-country-submit"
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
  sectionSub: { color: colors.textDim, ...font.small, marginBottom: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flag: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  flagText: { color: colors.primary, ...font.mono, fontSize: 15 },
  cardTitle: { color: colors.text, ...font.bodyMd, fontSize: 15 },
  cardMeta: { color: colors.textDim, ...font.small, marginTop: 2 },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EF444422",
    borderColor: "#EF444455",
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errText: { color: "#FCA5A5", ...font.small, flex: 1 },
  groupLabel: {
    color: colors.textDim,
    ...font.small,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  regionChip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
