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

import { AdminUser, School, SchoolAssignment, api } from "@/src/api/client";
import { ASSIGNMENT_MODULES, normalizeAssignmentDraft } from "@/src/admin/pr09";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, EmptyState, Input, Row } from "@/src/ui/components";

const ASSIGNMENT_ROLES = [
  { key: "principal", label: "Principal" },
  { key: "hr", label: "HR" },
  { key: "accountant", label: "Accountant" },
];

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/admin/countries");
}

function userName(user?: AdminUser | null) {
  return user?.full_name || user?.email || "-";
}

function signature(assignments: SchoolAssignment[]) {
  return JSON.stringify(
    normalizeAssignmentDraft(assignments)
      .map((row) => ({ ...row, modules: [...row.modules].sort() }))
      .sort((a, b) => a.userId - b.userId),
  );
}

export default function AdminSchoolAssignmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [principals, setPrincipals] = useState<AdminUser[]>([]);
  const [assignments, setAssignments] = useState<SchoolAssignment[]>([]);
  const [snapshot, setSnapshot] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");

  const dirty = signature(assignments) !== snapshot;

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    setMessage("");
    try {
      const [schoolRes, userRes, principalRows, assignmentRows] = await Promise.all([
        api.getSchool(id),
        api.adminListUsers({ limit: 500, fields: "all", order: "full_name:asc" }),
        api.adminGetSchoolPrincipals(id).catch(() => []),
        api.adminGetSchoolAssignments(id),
      ]);
      const nextAssignments = normalizeAssignmentDraft(assignmentRows);
      setSchool(schoolRes);
      setUsers(userRes.items);
      setPrincipals(Array.isArray(principalRows) ? principalRows : []);
      setAssignments(nextAssignments);
      setSnapshot(signature(nextAssignments));
      setConfirmSave(false);
    } catch (error: any) {
      setErr(error?.message || "Atamalar yuklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const usersById = useMemo(() => {
    const map = new Map<string, AdminUser>();
    users.forEach((user) => map.set(String(user.id), user));
    principals.forEach((user) => {
      if (!map.has(String(user.id))) map.set(String(user.id), user);
    });
    return map;
  }, [principals, users]);

  const candidates = useMemo(() => {
    const assigned = new Set(assignments.map((row) => String(row.userId)));
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (assigned.has(String(user.id))) return false;
      if (String(user.role) === "admin") return false;
      if (school?.country_id != null && user.country_id != null && Number(user.country_id) !== Number(school.country_id)) return false;
      if (!q) return true;
      return `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(q);
    });
  }, [assignments, school?.country_id, search, users]);

  function updateAssignment(userId: number, updater: (assignment: SchoolAssignment) => SchoolAssignment) {
    setConfirmSave(false);
    setAssignments((prev) => prev.map((assignment) => (
      Number(assignment.userId) === Number(userId) ? updater(assignment) : assignment
    )));
  }

  function addUser(user: AdminUser) {
    setConfirmSave(false);
    setAssignments((prev) => [
      ...prev,
      { userId: Number(user.id), role: String(user.role || "principal") === "hr" ? "hr" : "principal", modules: [] },
    ]);
  }

  function removeUser(userId: number) {
    setConfirmSave(false);
    setAssignments((prev) => prev.filter((assignment) => Number(assignment.userId) !== Number(userId)));
  }

  async function save() {
    if (!id) return;
    if (!confirmSave) {
      setConfirmSave(true);
      setMessage("Atamalar mevcut listeyle degistirilecek. Kaydetmek icin tekrar onaylayin.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = normalizeAssignmentDraft(assignments);
      await api.adminSetSchoolAssignments(id, { assignments: payload });
      await load();
      setMessage("Okul atamalari kaydedildi.");
    } catch (error: any) {
      setErr(error?.message || "Atamalar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-school-assignments-screen">
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn} testID="admin-school-assignments-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YONETIM</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{school?.name || "Okul Atamalari"}</Text>
        </View>
        <Button label={confirmSave ? "Onayla" : "Kaydet"} icon="save-outline" small onPress={save} loading={saving} disabled={!dirty || !id} variant={confirmSave ? "danger" : "primary"} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(assignment) => String(assignment.userId)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                if (dirty) {
                  setMessage("Once degisiklikleri kaydedin veya vazgecin.");
                  setRefreshing(false);
                  return;
                }
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
              {message ? <Notice icon="information-circle-outline" color={confirmSave ? colors.warn : colors.primary} text={message} /> : null}

              <Card>
                <Text style={styles.sectionTitle}>{school?.name || "-"}</Text>
                <Text style={styles.sectionSub}>Principal, HR ve accountant modul sorumluluklari.</Text>
                <Row label="Okul ID" value={String(id || "-")} />
                <Row label="Principal sayisi" value={String(principals.length)} />
                <Row label="Atama sayisi" value={String(assignments.length)} />
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>Kullanici Ekle</Text>
                <Input value={search} onChangeText={setSearch} placeholder="Ad veya e-posta ara..." />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.candidateRow}>
                  {candidates.slice(0, 40).map((user) => (
                    <Pressable key={String(user.id)} onPress={() => addUser(user)} style={styles.candidateChip}>
                      <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                      <Text style={styles.candidateText} numberOfLines={1}>{userName(user)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {!candidates.length ? <Text style={styles.emptySmall}>Eklenecek uygun kullanici yok.</Text> : null}
              </Card>

              <Text style={styles.listLabel}>Mevcut Atamalar</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
          ListEmptyComponent={<EmptyState icon="person-add-outline" title="Atama yok" subtitle="Ustteki arama ile kullanici ekleyin." />}
          renderItem={({ item }) => {
            const user = usersById.get(String(item.userId));
            return (
              <Card testID={`admin-school-assignment-${item.userId}`}>
                <View style={styles.assignmentHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userTitle}>{userName(user)}</Text>
                    <Text style={styles.userSub}>{user?.email || `ID ${item.userId}`}</Text>
                  </View>
                  <Pressable onPress={() => removeUser(item.userId)} hitSlop={10} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={17} color={colors.danger} />
                  </Pressable>
                </View>

                <Text style={styles.groupLabel}>Rol</Text>
                <View style={styles.wrapChips}>
                  {ASSIGNMENT_ROLES.map((role) => (
                    <Chip
                      key={role.key}
                      label={role.label}
                      active={item.role === role.key}
                      onPress={() => updateAssignment(item.userId, (assignment) => ({ ...assignment, role: role.key }))}
                    />
                  ))}
                </View>

                <Text style={styles.groupLabel}>Moduller</Text>
                <View style={styles.wrapChips}>
                  {ASSIGNMENT_MODULES.map((module) => {
                    const active = item.modules.includes(module.id);
                    return (
                      <Chip
                        key={module.id}
                        label={module.label}
                        active={active}
                        onPress={() => updateAssignment(item.userId, (assignment) => {
                          const modules = new Set(assignment.modules);
                          if (modules.has(module.id)) modules.delete(module.id);
                          else modules.add(module.id);
                          return { ...assignment, modules: Array.from(modules) };
                        })}
                      />
                    );
                  })}
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Notice({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={[styles.notice, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
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
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4, marginBottom: spacing.md },
  listLabel: { color: colors.textDim, ...font.small, textTransform: "uppercase", letterSpacing: 0.6 },
  candidateRow: { gap: spacing.sm, alignItems: "center" },
  candidateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 220,
    height: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  candidateText: { color: colors.text, ...font.small, maxWidth: 170 },
  emptySmall: { color: colors.textDim, ...font.small },
  assignmentHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  userTitle: { color: colors.text, ...font.bodyMd },
  userSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#EF444455",
    backgroundColor: "#EF444418",
    alignItems: "center",
    justifyContent: "center",
  },
  groupLabel: { color: colors.textDim, ...font.small, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  noticeText: { color: colors.text, ...font.small, flex: 1 },
});
