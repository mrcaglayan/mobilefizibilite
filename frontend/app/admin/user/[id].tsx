// Admin: Single user detail — change role, assign country, reset password, delete.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { AdminUser, Country, api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, Row } from "@/src/ui/components";
import { useAuth } from "@/src/auth/AuthContext";

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

export default function AdminUserDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [uRes, cRes] = await Promise.all([
        api.adminListUsers(),
        api.adminListCountries().catch(() => [] as any),
      ]);
      const list: AdminUser[] = Array.isArray(uRes) ? uRes : uRes?.users || [];
      const found = list.find((u) => String(u.id) === String(id)) || null;
      setUser(found);
      const cList: Country[] = Array.isArray(cRes)
        ? (cRes as Country[])
        : (cRes as any)?.countries || (cRes as any)?.items || [];
      setCountries(cList);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = useMemo(
    () => user && me && String(user.id) === String(me.id),
    [user, me],
  );

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function changeRole(newRole: string) {
    if (!user || user.role === newRole) return;
    setSavingRole(true);
    setErr("");
    try {
      const updated = await api.adminUpdateUserRole(user.id, newRole);
      setUser({ ...user, ...updated });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Rol güncellendi");
    } catch (e: any) {
      setErr(e?.message || "Rol güncellenemedi");
    } finally {
      setSavingRole(false);
    }
  }

  async function assignCountry(countryId: number) {
    if (!user) return;
    setSavingCountry(true);
    setErr("");
    try {
      const updated = await api.adminAssignUserCountry(user.id, { country_id: countryId });
      setUser({ ...user, ...updated });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Ülke atandı");
    } catch (e: any) {
      setErr(e?.message || "Ülke atanamadı");
    } finally {
      setSavingCountry(false);
    }
  }

  async function resetPassword() {
    if (!user) return;
    setResetting(true);
    setErr("");
    try {
      const res = await api.adminResetUserPassword(user.id);
      setTempPw(res.temporary_password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErr(e?.message || "Parola sıfırlanamadı");
    } finally {
      setResetting(false);
    }
  }

  async function deleteUser() {
    if (!user) return;
    setDeleting(true);
    setErr("");
    try {
      await api.adminDeleteUser(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmDelete(false);
      router.back();
    } catch (e: any) {
      setErr(e?.message || "Silinemedi");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
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

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{err ? "Yüklenemedi" : "Kullanıcı Bulunamadı"}</Text>
          </View>
        </View>
        {err ? (
          <View style={{ padding: spacing.lg }}>
            <View style={styles.errBox} testID="admin-user-error">
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errText}>{err}</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-user-detail-screen">
      <View style={styles.header}>
        <Pressable
          testID="admin-user-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>KULLANICI</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {user.full_name || user.email}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        {err ? (
          <View style={styles.errBox} testID="admin-user-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {/* Profile card */}
        <Card>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.full_name || user.email || "?").trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {user.full_name || "-"}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
              <View style={styles.badges}>
                <View style={[styles.tag, { backgroundColor: "#F5B30122", borderColor: colors.primaryDark }]}>
                  <Text style={[styles.tagText, { color: colors.primary }]}>{roleLabel(user.role)}</Text>
                </View>
                {user.must_reset_password ? (
                  <View style={[styles.tag, { backgroundColor: "#F9731622", borderColor: "#F9731655" }]}>
                    <Ionicons name="key-outline" size={11} color={colors.warn} />
                    <Text style={[styles.tagText, { color: colors.warn }]}>Parola sıfırlama gerekli</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Row label="Kullanıcı ID" value={String(user.id)} />
            <Row label="Ülke" value={user.country_name || user.country_code || "-"} />
            <Row label="Bölge" value={user.region || "-"} />
          </View>
        </Card>

        {/* Change role */}
        <Card>
          <Text style={styles.section}>Rol</Text>
          <Text style={styles.sectionSub}>
            Kullanıcının erişim seviyesini seçin
          </Text>
          <View style={styles.chipGroup}>
            {ROLES.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                active={user.role === r.key}
                onPress={() => changeRole(r.key)}
                testID={`admin-user-role-${r.key}`}
              />
            ))}
          </View>
          {savingRole ? (
            <View style={styles.miniLoad}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.miniLoadText}>Kaydediliyor...</Text>
            </View>
          ) : null}
        </Card>

        {/* Assign country */}
        {countries.length > 0 ? (
          <Card>
            <Text style={styles.section}>Ülke Ataması</Text>
            <Text style={styles.sectionSub}>
              Bu ülkenin okullarına erişim verir
            </Text>
            <View style={styles.chipGroup}>
              {countries.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={user.country_id === c.id}
                  onPress={() => assignCountry(c.id)}
                  testID={`admin-user-country-${c.code}`}
                />
              ))}
            </View>
            {savingCountry ? (
              <View style={styles.miniLoad}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.miniLoadText}>Kaydediliyor...</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Reset password */}
        <Card>
          <Text style={styles.section}>Parola</Text>
          <Text style={styles.sectionSub}>
            Yeni bir geçici parola oluşturun ve kullanıcıya iletin
          </Text>
          <Button
            label="Parolayı Sıfırla"
            icon="key-outline"
            variant="secondary"
            onPress={resetPassword}
            loading={resetting}
            style={{ marginTop: spacing.md }}
            testID="admin-user-reset-password"
          />
        </Card>

        {/* Danger zone */}
        <Card style={{ borderColor: "#EF444444" }}>
          <Text style={[styles.section, { color: colors.danger }]}>Tehlikeli Bölge</Text>
          <Text style={styles.sectionSub}>
            Bu işlem geri alınamaz. Kullanıcı silinir.
          </Text>
          <Button
            label={isSelf ? "Kendinizi silemezsiniz" : "Kullanıcıyı Sil"}
            icon="trash-outline"
            variant="danger"
            onPress={() => setConfirmDelete(true)}
            disabled={!!isSelf}
            style={{ marginTop: spacing.md }}
            testID="admin-user-delete"
          />
        </Card>
      </ScrollView>

      {/* Temp password modal */}
      <Modal transparent visible={!!tempPw} animationType="fade" onRequestClose={() => setTempPw(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="admin-user-temp-pw-modal">
            <View style={styles.modalIcon}>
              <Ionicons name="key" size={26} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Geçici Parola</Text>
            <Text style={styles.modalSub}>
              Bu parolayı kullanıcıya güvenli bir şekilde iletin. Kullanıcı ilk girişte kendi parolasını belirleyecek.
            </Text>
            <View style={styles.pwBox}>
              <Text style={styles.pwText} selectable testID="admin-user-temp-pw-value">
                {tempPw}
              </Text>
              <Pressable
                testID="admin-user-copy-pw"
                onPress={async () => {
                  if (tempPw) await Clipboard.setStringAsync(tempPw);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  showToast("Kopyalandı");
                }}
                hitSlop={10}
                style={styles.copyBtn}
              >
                <Ionicons name="copy-outline" size={18} color={colors.text} />
              </Pressable>
            </View>
            <Button
              label="Anladım"
              onPress={() => setTempPw(null)}
              style={{ width: "100%" }}
              testID="admin-user-temp-pw-close"
            />
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal transparent visible={confirmDelete} animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: "#EF444422" }]}>
              <Ionicons name="alert" size={26} color={colors.danger} />
            </View>
            <Text style={styles.modalTitle}>Kullanıcı silinsin mi?</Text>
            <Text style={styles.modalSub}>
              {user.email} silinecek. Bu işlem geri alınamaz.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              <Button
                label="Vazgeç"
                variant="secondary"
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1 }}
                testID="admin-user-delete-cancel"
              />
              <Button
                label={deleting ? "Siliniyor..." : "Sil"}
                variant="danger"
                loading={deleting}
                onPress={deleteUser}
                style={{ flex: 1 }}
                testID="admin-user-delete-confirm"
              />
            </View>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 20 }]} testID="admin-user-toast">
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
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
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, ...font.h2 },
  name: { color: colors.text, ...font.h3, fontSize: 17 },
  email: { color: colors.textDim, ...font.body, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.bgElev2,
    borderColor: colors.border,
  },
  tagText: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.5 },
  section: { ...font.h3, color: colors.text },
  sectionSub: { ...font.small, color: colors.textDim, marginTop: 4, marginBottom: spacing.md },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniLoad: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md },
  miniLoadText: { color: colors.textDim, ...font.small },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EF444422",
    borderColor: "#EF444455",
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
  },
  errText: { color: "#FCA5A5", ...font.small, flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.bgElev,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: colors.text, ...font.h2, textAlign: "center" },
  modalSub: { color: colors.textDim, ...font.body, textAlign: "center", lineHeight: 20 },
  pwBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    width: "100%",
    padding: spacing.md,
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwText: { flex: 1, color: colors.primary, ...font.mono, fontSize: 18 },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
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
