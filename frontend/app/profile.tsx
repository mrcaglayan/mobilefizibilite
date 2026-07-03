import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api, PermissionEntry, School } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Input, Row } from "@/src/ui/components";

type Status = { type: "success" | "error"; message: string } | null;

function roleLabel(role?: string) {
  switch (role) {
    case "admin":
      return "Yönetici";
    case "manager":
      return "Müdür";
    case "accountant":
      return "Muhasebeci";
    case "principal":
      return "Okul Müdürü";
    case "hr":
      return "İK";
    case "user":
      return "Kullanıcı";
    default:
      return role || "-";
  }
}

function normalizePermissionRows(perms?: PermissionEntry[]) {
  const map = new Map<
    string,
    {
      resource: string;
      scope_school_id: number | null;
      scope_country_id: number | null;
      read: boolean;
      write: boolean;
    }
  >();

  (Array.isArray(perms) ? perms : []).forEach((permission) => {
    const resource = String(permission?.resource || "").trim();
    const action = String(permission?.action || "").toLowerCase();
    if (!resource || !action) return;
    const scopeSchoolId = permission.scope_school_id != null ? Number(permission.scope_school_id) : null;
    const scopeCountryId = permission.scope_country_id != null ? Number(permission.scope_country_id) : null;
    const key = `${resource}:${scopeSchoolId ?? "none"}:${scopeCountryId ?? "none"}`;
    if (!map.has(key)) {
      map.set(key, {
        resource,
        scope_school_id: Number.isFinite(scopeSchoolId) ? scopeSchoolId : null,
        scope_country_id: Number.isFinite(scopeCountryId) ? scopeCountryId : null,
        read: false,
        write: false,
      });
    }
    const row = map.get(key)!;
    if (action === "read") row.read = true;
    if (action === "write") row.write = true;
  });

  return Array.from(map.values()).sort((a, b) => a.resource.localeCompare(b.resource, "tr"));
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, changePassword, logout } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const mustReset = Boolean(user?.must_reset_password);

  const loadSchools = useCallback(async () => {
    setSchoolsLoading(true);
    try {
      const res = await api.listSchools({ limit: 50, fields: "brief", order: "name:asc" });
      setSchools(res.items);
    } catch {
      setSchools([]);
    } finally {
      setSchoolsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const schoolNameById = useMemo(() => {
    const map = new Map<number, string>();
    schools.forEach((school) => {
      const schoolId = Number(school.id);
      if (Number.isFinite(schoolId)) map.set(schoolId, school.name);
    });
    return map;
  }, [schools]);

  const schoolsToShow = useMemo(() => {
    if (user?.role !== "principal" || !Array.isArray(user.principalSchoolIds) || user.principalSchoolIds.length === 0) {
      return schools;
    }
    const assigned = new Set(user.principalSchoolIds.map((schoolId) => Number(schoolId)));
    return schools.filter((school) => assigned.has(Number(school.id)));
  }, [schools, user?.principalSchoolIds, user?.role]);

  const permissionRows = useMemo(() => normalizePermissionRows(user?.permissions), [user?.permissions]);

  async function submitPassword() {
    setStatus(null);
    if (!currentPassword || !newPassword) {
      setStatus({ type: "error", message: "Mevcut parola ve yeni parola zorunlu." });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "error", message: "Yeni parola en az 8 karakter olmalı." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "Yeni parola tekrarı eşleşmiyor." });
      return;
    }

    const wasForced = mustReset;
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus({ type: "success", message: "Parola güncellendi." });
      if (wasForced) router.replace("/schools");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus({ type: "error", message: e?.message || "Parola güncellenemedi." });
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="profile-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (mustReset ? undefined : router.back())}
            disabled={mustReset}
            hitSlop={12}
            style={[styles.iconBtn, mustReset && { opacity: 0.35 }]}
            testID="profile-back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>HESAP</Text>
            <Text style={styles.headerTitle}>Profil</Text>
          </View>
          <Pressable onPress={onLogout} hitSlop={10} style={styles.iconBtn} testID="profile-logout">
            <Ionicons name="log-out-outline" size={18} color={colors.textDim} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {mustReset ? (
            <View style={styles.warnBox} testID="profile-must-reset">
              <Ionicons name="key-outline" size={18} color={colors.warn} />
              <Text style={styles.warnText}>Devam etmek için yeni bir parola belirleyin.</Text>
            </View>
          ) : null}

          {status ? (
            <View style={[styles.statusBox, status.type === "error" ? styles.statusError : styles.statusSuccess]}>
              <Ionicons
                name={status.type === "error" ? "alert-circle-outline" : "checkmark-circle-outline"}
                size={16}
                color={status.type === "error" ? colors.danger : colors.success}
              />
              <Text style={styles.statusText}>{status.message}</Text>
            </View>
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>Hesap</Text>
            <View style={{ marginTop: spacing.sm }}>
              <Row label="Ad Soyad" value={user?.full_name || "-"} />
              <Row label="E-posta" value={user?.email || "-"} />
              <Row label="Rol" value={roleLabel(user?.role)} />
              <Row label="Ülke" value={user?.country_name || user?.country_code || "-"} />
            </View>
          </Card>

          <Card>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Atamalar</Text>
              {schoolsLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            </View>
            <Text style={styles.sectionSub}>Sorumlu olduğunuz okullar</Text>
            {schoolsToShow.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {schoolsToShow.map((school) => (
                  <View key={String(school.id)} style={styles.schoolRow}>
                    <Ionicons name="school-outline" size={16} color={colors.primary} />
                    <Text style={styles.schoolName} numberOfLines={1}>
                      {school.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>Atanmış okul bulunmuyor.</Text>
            )}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>İzinler</Text>
            {permissionRows.length === 0 ? (
              <Text style={styles.emptyText}>Tanımlı izin bulunmuyor.</Text>
            ) : (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {permissionRows.slice(0, 20).map((row, idx) => {
                  const schoolName =
                    row.scope_school_id != null ? schoolNameById.get(row.scope_school_id) : null;
                  const scope = schoolName
                    ? schoolName
                    : row.scope_school_id != null
                      ? `Okul #${row.scope_school_id}`
                      : row.scope_country_id != null
                        ? user?.country_code || user?.country_name || `Ülke #${row.scope_country_id}`
                        : "Genel";
                  return (
                    <View key={`${row.resource}-${idx}`} style={styles.permissionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.permissionResource} numberOfLines={1}>
                          {row.resource}
                        </Text>
                        <Text style={styles.permissionScope} numberOfLines={1}>
                          {scope}
                        </Text>
                      </View>
                      <View style={styles.permissionMarks}>
                        <PermissionMark label="R" enabled={row.read} />
                        <PermissionMark label="W" enabled={row.write} />
                      </View>
                    </View>
                  );
                })}
                {permissionRows.length > 20 ? (
                  <Text style={styles.emptyText}>+{permissionRows.length - 20} izin daha</Text>
                ) : null}
              </View>
            )}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Parola Değiştir</Text>
            <Text style={styles.sectionSub}>En az 8 karakter kullanın.</Text>
            <View style={{ marginTop: spacing.md }}>
              <Input
                label="Mevcut Parola"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                testID="profile-current-password"
              />
              <Input
                label="Yeni Parola"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                testID="profile-new-password"
              />
              <Input
                label="Yeni Parola Tekrar"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                testID="profile-confirm-password"
              />
              <Button
                label={saving ? "Kaydediliyor..." : "Parolayı Güncelle"}
                icon="key-outline"
                onPress={submitPassword}
                loading={saving}
                disabled={!currentPassword || !newPassword || !confirmPassword}
                testID="profile-change-password"
              />
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PermissionMark({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <View style={[styles.permissionMark, enabled ? styles.permissionMarkOn : styles.permissionMarkOff]}>
      <Text style={[styles.permissionMarkText, { color: enabled ? colors.primaryText : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
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
  iconBtn: {
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
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  warnBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9731622",
    borderColor: "#F9731655",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warnText: { color: "#FDBA74", ...font.small, flex: 1 },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusError: { backgroundColor: "#EF444422", borderColor: "#EF444455" },
  statusSuccess: { backgroundColor: "#22C55E22", borderColor: "#22C55E55" },
  statusText: { color: colors.text, ...font.small, flex: 1 },
  schoolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  schoolName: { color: colors.text, ...font.small, flex: 1 },
  emptyText: { color: colors.textDim, ...font.small, marginTop: spacing.md },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionResource: { color: colors.text, ...font.small },
  permissionScope: { color: colors.textMuted, ...font.tiny, marginTop: 2 },
  permissionMarks: { flexDirection: "row", gap: 6 },
  permissionMark: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  permissionMarkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  permissionMarkOff: { backgroundColor: colors.bg, borderColor: colors.border },
  permissionMarkText: { ...font.tiny, fontWeight: "900" },
});
