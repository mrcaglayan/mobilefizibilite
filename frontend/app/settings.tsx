import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppThemeMode, alpha, font, radius, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { Card, GradientHeroCard, ScreenHeader, ScreenScaffold, SectionHeader } from "@/src/ui/components";

const THEME_OPTIONS: { key: AppThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "light", label: "Aydınlık", icon: "sunny-outline" },
  { key: "dark", label: "Karanlık", icon: "moon-outline" },
  { key: "system", label: "Sistem", icon: "phone-portrait-outline" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const colors = theme.colors;

  return (
    <ScreenScaffold testID="settings-screen">
      <ScreenHeader
        eyebrow="Uygulama"
        title="Ayarlar"
        subtitle={`Tema: ${theme.mode === "system" ? "Sistem" : theme.mode === "light" ? "Aydınlık" : "Karanlık"}`}
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 112, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <GradientHeroCard
          eyebrow="AYARLAR"
          title="Uygulama deneyimi"
          subtitle="Tema ve hesap kısayollarını tek yerden yönetin."
          icon="settings-outline"
          metricValue={theme.mode === "system" ? "Sistem" : theme.mode === "light" ? "Light" : "Dark"}
          metricLabel="aktif tema"
          progress={theme.resolvedMode === "light" ? 100 : 45}
        />

        <Section title="Görünüm">
          <Card style={{ gap: spacing.md }}>
            <Text style={[styles.cardLabel, { color: colors.textDim }]}>Tema</Text>
            <View style={styles.themeGrid}>
              {THEME_OPTIONS.map((item) => {
                const active = theme.mode === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => theme.setMode(item.key)}
                    style={({ pressed }) => [
                      styles.themeOption,
                      {
                        backgroundColor: active ? alpha(colors.primary, 0.14) : colors.bgElev2,
                        borderColor: active ? colors.primary : colors.border,
                        opacity: pressed ? 0.84 : 1,
                      },
                    ]}
                    testID={`settings-theme-${item.key}`}
                  >
                    <Ionicons name={item.icon} size={22} color={active ? colors.primary : colors.textDim} />
                    <Text style={[styles.themeText, { color: active ? colors.text : colors.textDim }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.infoRow, { backgroundColor: colors.bgSoft }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.infoText, { color: colors.textDim }]}>
                Sistem seçeneği cihaz temasını takip eder.
              </Text>
            </View>
          </Card>
        </Section>

        <Section title="Hesap">
          <Card style={{ padding: 0 }}>
            <SettingsRow
              icon="person-circle-outline"
              label="Profil Bilgileri"
              onPress={() => router.push("/profile")}
            />
            <SettingsRow
              icon="key-outline"
              label="Şifre Değiştir"
              onPress={() => router.push("/profile")}
            />
          </Card>
        </Section>

        <Section title="Uygulama">
          <Card style={{ padding: 0 }}>
            <SettingsRow icon="language-outline" label="Dil" value="Türkçe" />
            <SettingsRow icon="help-circle-outline" label="Yardım & Destek" value="Yakında" disabled />
          </Card>
        </Section>
      </ScrollView>
    </ScreenScaffold>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: disabled ? 0.55 : pressed ? 0.78 : 1 },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.textDim} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.textDim }]}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...font.bodyMd, marginLeft: 2 },
  cardLabel: { ...font.small, fontWeight: "700" },
  themeGrid: { flexDirection: "row", gap: spacing.sm },
  themeOption: {
    flex: 1,
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  themeText: { ...font.small, fontWeight: "700", textAlign: "center" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoText: { ...font.small, flex: 1 },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { ...font.bodyMd, flex: 1 },
  rowValue: { ...font.small },
});
