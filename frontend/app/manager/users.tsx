// Manager: Users list — scoped to caller's country. Roles: principal/HR only for create.

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
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { AdminUser, api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Chip, EmptyState, Input } from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";

const ROLE_FILTERS = [
  { key: "principal", label: "Okul Müdürü" },
  { key: "hr", label: "İK" },
  { key: "user", label: "Kullanıcı" },
];

const CREATE_ROLES = [
  { key: "principal", label: "Okul Müdürü" },
  { key: "hr", label: "İK" },
];

function roleLabel(role?: string) {
  return (
    ROLE_FILTERS.find((r) => r.key === role)?.label ||
    (role === "manager" ? "Müdür" : role === "admin" ? "Yönetici" : role || "-")
  );
}

export default function ManagerUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const canManage = can(me, "page.manage_permissions", "write", {
    countryId: me?.country_id ?? null,
    schoolId: null,
  });
  const canCreateUser = can(me, "user.create", "write", {
    countryId: me?.country_id ?? null,
    schoolId: null,
  });

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setErr("");
    try {
      const res = await api.managerListUsers();
      setUsers(res.items);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage]);

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

  if (!canManage) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-users-denied">
        <View style={styles.header}>
          <Pressable
            testID="manager-users-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/schools")}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>MUDUR YONETIMI</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>Yetki Yok</Text>
          </View>
        </View>
        <View style={{ padding: spacing.lg }}>
          <View style={styles.errBox}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.warn} />
            <Text style={styles.errText}>Bu ekran icin page.manage_permissions yazma yetkisi gerekir.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-users-screen">
      <View style={styles.header}>
        <Pressable
          testID="manager-users-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>MÜDÜR YÖNETİMİ</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Kullanıcılar · {me?.country_name || "Ülke"}
          </Text>
        </View>
        {canCreateUser ? (
          <Button
            label="Ekle"
            icon="add"
            small
            onPress={() => setShowCreate(true)}
            testID="manager-users-add-button"
          />
        ) : null}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textDim} />
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="E-posta veya ad ara..."
          testID="manager-users-search"
          style={{ paddingHorizontal: 0 }}
        />
      </View>

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
            testID="manager-users-role-all"
          />
          {ROLE_FILTERS.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              active={roleFilter === r.key}
              onPress={() => setRoleFilter(r.key)}
              testID={`manager-users-role-${r.key}`}
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
          <View style={styles.errBox} testID="manager-users-error">
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
            <EmptyState
              icon="people-outline"
              title="Kullanıcı yok"
              subtitle="Ülkenizde henüz atanmış kullanıcı bulunmuyor."
            />
          }
          renderItem={({ item }) => {
            const isPeer = item.role === "manager" || item.role === "admin";
            return (
              <Pressable
                testID={`manager-user-card-${item.id}`}
                onPress={() => {
                  if (!isPeer) router.push(`/manager/user/${item.id}`);
                }}
                disabled={isPeer}
                style={({ pressed }) => [styles.card, { opacity: pressed && !isPeer ? 0.9 : 1 }]}
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
                    <View
                      style={[
                        styles.tag,
                        isPeer
                          ? { borderColor: colors.borderStrong, backgroundColor: colors.bgElev2 }
                          : { borderColor: colors.primaryDark, backgroundColor: "#F5B30111" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          { color: isPeer ? colors.textDim : colors.primary },
                        ]}
                      >
                        {roleLabel(item.role)}
                      </Text>
                    </View>
                  </View>
                </View>
                {isPeer ? (
                  <View style={styles.readOnlyBadge}>
                    <Ionicons name="lock-closed-outline" size={12} color={colors.textDim} />
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                )}
              </Pressable>
            );
          }}
        />
      )}

      <CreateUserSheet
        visible={showCreate}
        countryName={me?.country_name || ""}
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

function CreateUserSheet({
  visible,
  countryName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  countryName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"principal" | "hr">("principal");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (visible) {
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("principal");
      setErr("");
    }
  }, [visible]);

  async function submit() {
    setErr("");
    if (!email.trim()) return setErr("E-posta zorunlu");
    if (password.length < 8) return setErr("Parola en az 8 karakter olmalı");
    setSaving(true);
    try {
      await api.managerCreateUser({
        full_name: full_name.trim() || undefined,
        email: email.trim(),
        password,
        role,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Oluşturulamadı");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Yeni Kullanıcı" testID="manager-create-user-sheet">
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {err ? (
          <View style={styles.errBox} testID="manager-create-user-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <Text style={styles.hint}>
          Yeni kullanıcı <Text style={{ color: colors.text }}>{countryName || "-"}</Text> ülkesine eklenecek.
        </Text>

        <Input
          label="Ad Soyad (opsiyonel)"
          value={full_name}
          onChangeText={setFullName}
          placeholder="Adı Soyadı"
          testID="manager-create-user-fullname"
        />
        <Input
          label="E-posta"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="isim@sirket.com"
          testID="manager-create-user-email"
        />
        <Input
          label="Geçici Parola (en az 8 karakter)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          testID="manager-create-user-password"
        />

        <Text style={styles.groupLabel}>ROL</Text>
        <View style={styles.chipGroup}>
          {CREATE_ROLES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              active={role === r.key}
              onPress={() => setRole(r.key as any)}
              testID={`manager-create-user-role-${r.key}`}
            />
          ))}
        </View>

        <Button
          label="Kullanıcıyı Oluştur"
          icon="checkmark"
          onPress={submit}
          loading={saving}
          disabled={!email || password.length < 8}
          style={{ marginTop: spacing.md }}
          testID="manager-create-user-submit"
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
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
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#F5B30122",
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
  },
  tagText: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.5 },
  warnDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#F9731622",
    borderColor: "#F9731655",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  readOnlyBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.bgElev2,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  hint: { color: colors.textDim, ...font.small, marginBottom: spacing.md },
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
