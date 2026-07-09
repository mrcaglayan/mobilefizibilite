// Admin: Users list + inline "Add user" bottom sheet.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

import { AdminUser, Country, api } from "@/src/api/client";
import { alpha, colors, font, radius, shadow, spacing } from "@/src/theme";
import { Button, Chip, EmptyStateCard, GradientHeroCard, Input, SearchHeader } from "@/src/ui/components";

const ROLES = [
  { key: "admin", label: "Yönetici" },
  { key: "manager", label: "Müdür" },
  { key: "accountant", label: "Muhasebeci" },
  { key: "principal", label: "Okul Müdürü" },
  { key: "hr", label: "İK" },
  { key: "user", label: "Kullanıcı" },
];

function roleLabel(role?: string) {
  return ROLES.find((r) => r.key === role)?.label || role || "-";
}

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [uRes, cRes] = await Promise.all([
        api.adminListUsers({ limit: 200 }),
        api.adminListCountries().catch(() => ({ items: [] })),
      ]);
      setUsers(uRes.items);
      setCountries(cRes.items);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (u.email || "").toLowerCase().includes(q) ||
        (u.full_name || "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-users-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          testID="admin-users-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YÖNETİM</Text>
          <Text style={styles.headerTitle}>Kullanıcılar</Text>
        </View>
        <Button
          label="Ekle"
          icon="add"
          small
          onPress={() => setShowCreate(true)}
          testID="admin-users-add-button"
        />
      </View>

      <View style={styles.heroWrap}>
        <GradientHeroCard
          eyebrow="KULLANICI YONETIMI"
          title="Ekip dizini"
          subtitle="Rollere ve ulke kapsamlarina gore kullanicilari yonetin."
          icon="people-outline"
          metricValue={String(users.length)}
          metricLabel="kayitli kullanici"
          progress={users.length ? 100 : 0}
        />
      </View>

      <SearchHeader
        value={search}
        onChangeText={setSearch}
        placeholder="E-posta veya ad ara..."
        testID="admin-users-search-header"
        inputProps={{ testID: "admin-users-search" }}
        style={styles.searchHeader}
      />

      {/* Role chips */}
      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
          <Chip
            label="Tümü"
            active={roleFilter === null}
            onPress={() => setRoleFilter(null)}
            testID="admin-users-role-all"
          />
          {ROLES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              active={roleFilter === r.key}
              onPress={() => setRoleFilter(r.key)}
              testID={`admin-users-role-${r.key}`}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={{ padding: spacing.lg }}>
          <View style={styles.errBox} testID="admin-users-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + 112,
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
              icon="people-outline"
              title="Kullanıcı bulunamadı"
              subtitle="Arama kriterinizi değiştirin veya yeni kullanıcı ekleyin."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`admin-user-card-${item.id}`}
              onPress={() => router.push(`/admin/user/${item.id}`)}
              style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.full_name || item.email || "?").trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.full_name || item.email}
                  </Text>
                  {item.must_reset_password ? (
                    <View style={styles.warnDot}>
                      <Ionicons name="key-outline" size={10} color={colors.warn} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.email}
                </Text>
                <View style={styles.cardTags}>
                  <View style={[styles.tag, { borderColor: alpha(colors.primary, 0.28), backgroundColor: alpha(colors.primary, 0.08) }]}>
                    <Text style={[styles.tagText, { color: colors.primary }]}>{roleLabel(item.role)}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.country_name || item.country_code || "Ülke yok"}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          )}
        />
      )}

      <CreateUserSheet
        visible={showCreate}
        countries={countries}
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

// -------------------- Create User bottom sheet --------------------

function CreateUserSheet({
  visible,
  countries,
  onClose,
  onCreated,
}: {
  visible: boolean;
  countries: Country[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [countryId, setCountryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (visible) {
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("user");
      setCountryId(null);
      setErr("");
    }
  }, [visible]);

  async function submit() {
    setErr("");
    if (!email.trim()) return setErr("E-posta zorunlu");
    if (password.length < 8) return setErr("Parola en az 8 karakter olmalı");
    setSaving(true);
    try {
      await api.adminCreateUser({
        full_name: full_name.trim() || undefined,
        email: email.trim(),
        password,
        role,
        country_id: countryId ?? undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Oluşturulamadı");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Yeni Kullanıcı</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              testID="create-user-close"
            >
              <Ionicons name="close" size={22} color={colors.textDim} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {err ? (
              <View style={styles.errBox} testID="create-user-error">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errText}>{err}</Text>
              </View>
            ) : null}

            <Input
              label="Ad Soyad (opsiyonel)"
              value={full_name}
              onChangeText={setFullName}
              placeholder="Adı Soyadı"
              testID="create-user-fullname"
            />
            <Input
              label="E-posta"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="isim@sirket.com"
              testID="create-user-email"
            />
            <Input
              label="Geçici Parola (en az 8 karakter)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              testID="create-user-password"
            />

            <Text style={styles.groupLabel}>ROL</Text>
            <View style={styles.chipGroup}>
              {ROLES.map((r) => (
                <Chip
                  key={r.key}
                  label={r.label}
                  active={role === r.key}
                  onPress={() => setRole(r.key)}
                  testID={`create-user-role-${r.key}`}
                />
              ))}
            </View>

            {countries.length > 0 ? (
              <>
                <Text style={styles.groupLabel}>ÜLKE (opsiyonel)</Text>
                <View style={styles.chipGroup}>
                  <Chip
                    label="Atama yok"
                    active={countryId === null}
                    onPress={() => setCountryId(null)}
                    testID="create-user-country-none"
                  />
                  {countries.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      active={countryId === c.id}
                      onPress={() => setCountryId(c.id)}
                      testID={`create-user-country-${c.code}`}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Button
              label="Kullanıcıyı Oluştur"
              icon="checkmark"
              onPress={submit}
              loading={saving}
              disabled={!email || password.length < 8}
              style={{ marginTop: spacing.md }}
              testID="create-user-submit"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  heroWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchHeader: { minHeight: 68, paddingBottom: spacing.xs },
  chipsRow: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: alpha(colors.accent, 0.16),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, ...font.h3 },
  cardTitle: { color: colors.text, ...font.bodyMd, fontSize: 15 },
  cardMeta: { color: colors.textDim, ...font.small, marginTop: 2 },
  cardTags: { flexDirection: "row", gap: 6, marginTop: 8 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  tagText: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.5 },
  warnDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: alpha(colors.warn, 0.12),
    borderColor: alpha(colors.warn, 0.34),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "90%",
  },
  grabber: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 10,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { color: colors.text, ...font.h2 },
  groupLabel: {
    color: colors.textDim,
    ...font.small,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
});
