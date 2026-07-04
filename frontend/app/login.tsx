import React, { useEffect, useMemo, useState } from "react";
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

import { loadRemembered, saveRemembered } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { getHomeRoute } from "@/src/auth/routes";
import { AppThemeColors, alpha, font, radius, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BrandMark, Button, Input } from "@/src/ui/components";

export default function LoginScreen() {
  const router = useRouter();
  const { login, token, user, bootstrapping } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const remembered = await loadRemembered();
      if (remembered) {
        setEmail(remembered.email);
        setRemember(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!bootstrapping && token) router.replace(getHomeRoute(user));
  }, [bootstrapping, token, user, router]);

  async function submit() {
    setErr("");
    setLoading(true);
    try {
      const loggedInUser = await login(email.trim(), password, remember);
      if (remember) await saveRemembered({ email: email.trim() });
      else await saveRemembered(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(getHomeRoute(loggedInUser));
    } catch (error: any) {
      setErr(error?.message || "Giriş başarısız.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={[alpha(theme.colors.primary, 0.18), alpha(theme.colors.primary, 0)]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.heroInner}>
              <BrandMark />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Ücret Belirleme Modülü</Text>
              </View>
              <Text style={styles.title}>Feasibility Studio</Text>
              <Text style={styles.subtitle}>
                Gelir, kapasite ve personel ihtiyaçlarını tek bir mobil çalışma alanında yönetin.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Giriş yap</Text>
            <Text style={styles.cardSub}>Hesabınızla devam edin.</Text>

            {err ? (
              <View style={styles.errBox} testID="login-error">
                <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
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
                <Pressable onPress={() => setShowPw((value) => !value)} hitSlop={10} testID="login-toggle-password">
                  <Ionicons
                    name={showPw ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={theme.colors.textDim}
                  />
                </Pressable>
              }
            />

            <Pressable
              testID="login-remember-toggle"
              onPress={() => setRemember((value) => !value)}
              style={styles.remember}
            >
              <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                {remember ? <Ionicons name="checkmark" size={14} color={theme.colors.primaryText} /> : null}
              </View>
              <Text style={styles.rememberText}>E-postamı hatırla</Text>
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

          <Text style={styles.footer}>Feasibility Studio</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingBottom: spacing.xl },
    hero: {
      overflow: "hidden",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    heroInner: { padding: spacing.lg, paddingTop: spacing.xl },
    badge: {
      marginTop: spacing.md,
      alignSelf: "flex-start",
      backgroundColor: alpha(colors.primary, 0.14),
      borderColor: alpha(colors.primary, 0.34),
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    badgeText: { color: colors.primary, ...font.tiny, fontWeight: "800" },
    title: { ...font.h1, color: colors.text, marginTop: spacing.md },
    subtitle: { color: colors.textDim, ...font.body, marginTop: spacing.sm, lineHeight: 22 },
    card: {
      margin: spacing.lg,
      backgroundColor: colors.bgElev,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    cardTitle: { ...font.h2, color: colors.text },
    cardSub: { ...font.small, color: colors.textDim, marginTop: 4, marginBottom: spacing.md },
    remember: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      backgroundColor: colors.bgElev2,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    rememberText: { color: colors.text, ...font.body },
    errBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: alpha(colors.danger, 0.12),
      borderColor: alpha(colors.danger, 0.3),
      borderWidth: StyleSheet.hairlineWidth,
      padding: spacing.sm,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    },
    errText: { color: colors.danger, ...font.small, flex: 1 },
    footer: { textAlign: "center", color: colors.textMuted, ...font.tiny, marginTop: spacing.md },
  });
}
