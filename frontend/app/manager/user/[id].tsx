// Manager: Single user detail — change role (user/hr/principal), edit email, reset password.

import React, { useCallback, useEffect, useState } from "react";
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

import { AdminUser, api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, Input, Row } from "@/src/ui/components";
import { useAuth } from "@/src/auth/AuthContext";

const ROLES = [
  { key: "principal", label: "Okul Müdürü" },
  { key: "hr", label: "İK" },
  { key: "user", label: "Kullanıcı" },
];

function roleLabel(role?: string) {
  return ROLES.find((r) => r.key === role)?.label || role || "-";
}

export default function ManagerUserDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await api.managerListUsers();
      const list: AdminUser[] = Array.isArray(res) ? res : res?.users || [];
      const found = list.find((u) => String(u.id) === String(id)) || null;
      setUser(found);
      setEmailDraft(found?.email || "");
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function changeRole(newRole: string) {
    if (!user || user.role === newRole) return;
    setSavingRole(true);
    setErr("");
    try {
      await api.managerUpdateUserRole(user.id, newRole);
      setUser({ ...user, role: newRole });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Rol güncellendi");
    } catch (e: any) {
      setErr(e?.message || "Rol güncellenemedi");
    } finally {
      setSavingRole(false);
    }
  }

  async function saveEmail() {
    if (!user) return;
    const next = emailDraft.trim();
    if (!next || next === user.email) return;
    setSavingEmail(true);
    setErr("");
    try {
      await api.managerUpdateUserEmail(user.id, next);
      setUser({ ...user, email: next });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("E-posta güncellendi");
    } catch (e: any) {
      setErr(e?.message || "E-posta güncellenemedi");
      setEmailDraft(user.email);
    } finally {
      setSavingEmail(false);
    }
  }

  async function resetPassword() {
    if (!user) return;
    setResetting(true);
    setErr("");
    try {
      const res = await api.managerResetUserPassword(user.id);
      setTempPw(res.temporary_password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErr(e?.message || "Parola sıfırlanamadı");
    } finally {
      setResetting(false);
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
            <Text style={styles.headerTitle}>Kullanıcı Bulunamadı</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const emailDirty = emailDraft.trim() !== user.email && emailDraft.trim().length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-user-detail-screen">
      <View style={styles.header}>
        <Pressable
          testID="manager-user-back"
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
          <View style={styles.errBox} testID="manager-user-error">
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
            <Row label="Ülke" value={me?.country_name || user.country_name || "-"} />
          </View>
        </Card>

        {/* Change role */}
        <Card>
          <Text style={styles.section}>Rol</Text>
          <Text style={styles.sectionSub}>
            Müdürler bu rolleri atayabilir: Kullanıcı, İK, Okul Müdürü
          </Text>
          <View style={styles.chipGroup}>
            {ROLES.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                active={user.role === r.key}
                onPress={() => changeRole(r.key)}
                testID={`manager-user-role-${r.key}`}
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

        {/* Change email */}
        <Card>
          <Text style={styles.section}>E-posta</Text>
          <Text style={styles.sectionSub}>
            Kullanıcının giriş e-posta adresini güncelle
          </Text>
          <Input
            value={emailDraft}
            onChangeText={setEmailDraft}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="manager-user-email-input"
          />
          <Button
            label={emailDirty ? "E-postayı Kaydet" : "Değişiklik yok"}
            icon={emailDirty ? "save-outline" : "checkmark"}
            variant={emailDirty ? "primary" : "secondary"}
            onPress={saveEmail}
            loading={savingEmail}
            disabled={!emailDirty}
            testID="manager-user-email-save"
          />
        </Card>

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
            testID="manager-user-reset-password"
          />
        </Card>
      </ScrollView>

      {/* Temp password modal */}
      <Modal transparent visible={!!tempPw} animationType="fade" onRequestClose={() => setTempPw(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="manager-user-temp-pw-modal">
            <View style={styles.modalIcon}>
              <Ionicons name="key" size={26} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Geçici Parola</Text>
            <Text style={styles.modalSub}>
              Bu parolayı kullanıcıya güvenli bir şekilde iletin. Kullanıcı ilk girişte kendi parolasını belirleyecek.
            </Text>
            <View style={styles.pwBox}>
              <Text style={styles.pwText} selectable testID="manager-user-temp-pw-value">
                {tempPw}
              </Text>
              <Pressable
                testID="manager-user-copy-pw"
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
              testID="manager-user-temp-pw-close"
            />
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 20 }]} testID="manager-user-toast">
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
