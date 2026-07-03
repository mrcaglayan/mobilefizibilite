// Login screen — Turkish, matches the "Feasibility Studio" branding.

import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "@/src/auth/AuthContext";
import { colors, font, radius, spacing } from "@/src/theme";
import { BrandMark, Button, Input } from "@/src/ui/components";
import { loadRemembered, saveRemembered } from "@/src/api/client";

export default function LoginScreen() {
  const router = useRouter();
  const { login, token, user, bootstrapping } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await loadRemembered();
      if (r) {
        setEmail(r.email);
        setRemember(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!bootstrapping && token) router.replace(user?.must_reset_password ? "/profile" : "/schools");
  }, [bootstrapping, token, user?.must_reset_password, router]);

  async function submit() {
    setErr("");
    setLoading(true);
    try {
      const loggedInUser = await login(email.trim(), password, remember);
      if (remember) await saveRemembered({ email: email.trim() });
      else await saveRemembered(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(loggedInUser.must_reset_password ? "/profile" : "/schools");
    } catch (e: any) {
      setErr(e?.message || "Giriş başarısız");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <LinearGradient
              colors={["#F5B30122", "#F5B30100"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={{ padding: spacing.lg, paddingTop: spacing.xl }}>
              <BrandMark />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Ücret Belirleme Modülü · v1.5</Text>
              </View>
              <Text style={styles.title}>Ücret Belirleme Modülüne hoş geldiniz.</Text>
              <Text style={styles.subtitle}>
                Gelir, kapasite ve personel ihtiyaçlarını tek bir yerde modelleyin.
              </Text>

              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>150+</Text>
                  <Text style={styles.metricLabel}>Senaryo başına girdi</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>3</Text>
                  <Text style={styles.metricLabel}>Yıllık planlama</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricNum}>1</Text>
                  <Text style={styles.metricLabel}>Doğruluk kaynağı</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Giriş yap</Text>
            <Text style={styles.cardSub}>Hesap için yöneticinize başvurun.</Text>

            {err ? (
              <View style={styles.errBox} testID="login-error">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errText}>{err}</Text>
              </View>
            ) : null}

            <Input
              label="E-posta"
              placeholder="isim@sirket.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="login-email-input"
            />
            <Input
              label="Parola"
              placeholder="Şifreniz"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              testID="login-password-input"
              right={
                <Pressable
                  onPress={() => setShowPw((v) => !v)}
                  hitSlop={10}
                  testID="login-toggle-password"
                >
                  <Ionicons
                    name={showPw ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.textDim}
                  />
                </Pressable>
              }
            />

            <Pressable
              testID="login-remember-toggle"
              onPress={() => setRemember((v) => !v)}
              style={styles.remember}
            >
              <View style={[styles.checkbox, remember && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {remember ? <Ionicons name="checkmark" size={14} color={colors.primaryText} /> : null}
              </View>
              <Text style={styles.rememberText}>Beni hatırla</Text>
            </Pressable>

            <Button
              label={loading ? "Giriş yapılıyor..." : "Giriş yap"}
              onPress={submit}
              loading={loading}
              disabled={!email || !password}
              testID="login-submit-button"
              style={{ marginTop: spacing.md }}
            />
          </View>

          <Text style={styles.footer}>
            © Feasibility Studio · Ücret Belirleme Modülü
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xl },
  hero: {
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badge: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    backgroundColor: "#F5B30122",
    borderColor: colors.primaryDark,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: colors.primary, ...font.tiny, textTransform: "uppercase" },
  title: {
    ...font.h1,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.textDim,
    ...font.body,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.bgElev,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricNum: { ...font.h2, color: colors.primary },
  metricLabel: { color: colors.textDim, ...font.tiny, marginTop: 4, textTransform: "uppercase" },
  card: {
    margin: spacing.lg,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { ...font.h2, color: colors.text },
  cardSub: { ...font.small, color: colors.textDim, marginTop: 4, marginBottom: spacing.md },
  remember: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElev2,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberText: { color: colors.text, ...font.body },
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
  footer: {
    textAlign: "center",
    color: colors.textMuted,
    ...font.tiny,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
});
