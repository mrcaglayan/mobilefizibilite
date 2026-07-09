import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AdminUser, School, SchoolAssignment, api } from "@/src/api/client";
import { ASSIGNMENT_MODULES, normalizeAssignmentDraft } from "@/src/admin/pr09";
import { alpha, font, radius, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { Button, Card, Chip, EmptyState, Row, SearchBar, StatusBadge } from "@/src/ui/components";

const ASSIGNMENT_ROLES = [
  { key: "principal", label: "Okul Müdürü", icon: "school-outline" as const },
  { key: "hr", label: "İK", icon: "people-outline" as const },
  { key: "accountant", label: "Muhasebe", icon: "calculator-outline" as const },
];

type AssignmentMode = "admin" | "manager";

type Props = {
  mode: AssignmentMode;
  canAccess?: boolean;
  backFallback: string;
  testID: string;
};

function userName(user?: AdminUser | null) {
  return user?.full_name || user?.email || "-";
}

function signature(assignments: SchoolAssignment[]) {
  return JSON.stringify(
    normalizeAssignmentDraft(assignments)
      .map((row) => ({ ...row, modules: [...row.modules].sort() }))
      .sort((a, b) => Number(a.userId) - Number(b.userId)),
  );
}

function sortUsers(users: AdminUser[]) {
  return [...users].sort((a, b) => {
    const left = String(a.full_name || a.email || "").toLocaleLowerCase("tr-TR");
    const right = String(b.full_name || b.email || "").toLocaleLowerCase("tr-TR");
    return left.localeCompare(right, "tr-TR");
  });
}

function defaultAssignmentRole(user: AdminUser) {
  if (user.role === "accountant") return "accountant";
  if (user.role === "hr") return "hr";
  return "principal";
}

function roleLabel(role?: string | null) {
  return ASSIGNMENT_ROLES.find((row) => row.key === role)?.label || String(role || "Kullanıcı");
}

function isForbiddenCandidate(mode: AssignmentMode, user: AdminUser) {
  if (user.role === "admin") return true;
  if (mode === "manager" && user.role === "manager") return true;
  return false;
}

function goBack(router: ReturnType<typeof useRouter>, fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}

function Notice({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.notice, { borderColor: alpha(color, 0.32), backgroundColor: alpha(color, 0.12) }]}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.noticeText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

export function SchoolAssignmentsScreen({ mode, canAccess = true, backFallback, testID }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [principals, setPrincipals] = useState<AdminUser[]>([]);
  const [assignments, setAssignments] = useState<SchoolAssignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
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
    if (!id || !canAccess) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setErr("");
    setMessage("");
    try {
      const [schoolRes, userRes, principalRows, assignmentRows] = await Promise.all([
        api.getSchool(id),
        mode === "admin"
          ? api.adminListUsers({ limit: 500, fields: "all", order: "full_name:asc" })
          : api.managerListUsers(),
        mode === "admin" ? api.adminGetSchoolPrincipals(id).catch(() => []) : api.managerGetSchoolPrincipals(id).catch(() => []),
        mode === "admin" ? api.adminGetSchoolAssignments(id) : api.managerGetSchoolAssignments(id),
      ]);
      const nextAssignments = normalizeAssignmentDraft(assignmentRows);
      setSchool(schoolRes);
      setUsers(sortUsers(userRes.items));
      setPrincipals(Array.isArray(principalRows) ? principalRows : []);
      setAssignments(nextAssignments);
      setSnapshot(signature(nextAssignments));
      setSelectedUserId(nextAssignments[0]?.userId ?? null);
      setConfirmSave(false);
    } catch (error: any) {
      setErr(error?.message || "Atamalar yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAccess, id, mode]);

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

  const selectedAssignment = assignments.find((row) => Number(row.userId) === Number(selectedUserId)) || null;
  const selectedUser = selectedAssignment ? usersById.get(String(selectedAssignment.userId)) || null : null;

  const candidateUsers = useMemo(() => {
    const assigned = new Set(assignments.map((row) => String(row.userId)));
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return users.filter((user) => {
      if (assigned.has(String(user.id))) return false;
      if (isForbiddenCandidate(mode, user)) return false;
      if (school?.country_id != null && user.country_id != null && Number(user.country_id) !== Number(school.country_id)) return false;
      if (!q) return true;
      return `${user.full_name || ""} ${user.email || ""}`.toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [assignments, mode, school?.country_id, search, users]);

  function updateAssignment(userId: number, updater: (assignment: SchoolAssignment) => SchoolAssignment) {
    setConfirmSave(false);
    setAssignments((prev) => prev.map((assignment) => (
      Number(assignment.userId) === Number(userId) ? updater(assignment) : assignment
    )));
  }

  function chooseUser(user: AdminUser) {
    setConfirmSave(false);
    setAssignments((prev) => {
      if (prev.some((assignment) => Number(assignment.userId) === Number(user.id))) return prev;
      return [...prev, { userId: Number(user.id), role: defaultAssignmentRole(user), modules: [] }];
    });
    setSelectedUserId(Number(user.id));
    setMessage(`${userName(user)} seçildi. Şimdi rol ve modül atayın.`);
  }

  function removeUser(userId: number) {
    setConfirmSave(false);
    setAssignments((prev) => prev.filter((assignment) => Number(assignment.userId) !== Number(userId)));
    setSelectedUserId((current) => (Number(current) === Number(userId) ? null : current));
  }

  async function save() {
    if (!id) return;
    if (!confirmSave) {
      setConfirmSave(true);
      setMessage("Atamalar mevcut listeyle değiştirilecek. Kaydetmek için tekrar onaylayın.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = normalizeAssignmentDraft(assignments);
      if (mode === "admin") await api.adminSetSchoolAssignments(id, { assignments: payload });
      else await api.managerSetSchoolAssignments(id, { assignments: payload });
      await load();
      setMessage("Okul atamaları kaydedildi.");
    } catch (error: any) {
      setErr(error?.message || "Atamalar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const back = () => {
    if (dirty) {
      setMessage("Önce değişiklikleri kaydedin veya vazgeçin.");
      return;
    }
    goBack(router, backFallback);
  };

  if (!canAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]} testID={`${testID}-denied`}>
        <Header title="Yetki Yok" eyebrow={mode === "admin" ? "YÖNETİM" : "MÜDÜR YÖNETİMİ"} onBack={back} />
        <View style={styles.bodyPad}>
          <Notice icon="lock-closed-outline" color={colors.warn} text="Okul atamaları için yetki gerekir." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]} testID={testID}>
      <Header
        title={school?.name || "Okul Atamaları"}
        eyebrow={mode === "admin" ? "YÖNETİM" : "MÜDÜR YÖNETİMİ"}
        onBack={back}
        right={
          <Button
            label={confirmSave ? "Onayla" : "Kaydet"}
            icon="save-outline"
            small
            onPress={save}
            loading={saving}
            disabled={!dirty || !id}
            variant={confirmSave ? "danger" : "primary"}
          />
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                if (dirty) {
                  setMessage("Önce değişiklikleri kaydedin veya vazgeçin.");
                  setRefreshing(false);
                  return;
                }
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 112 }]}
        >
          {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
          {message ? <Notice icon="information-circle-outline" color={confirmSave ? colors.warn : colors.primary} text={message} /> : null}

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{school?.name || "-"}</Text>
            <Text style={[styles.sectionSub, { color: colors.textDim }]}>Okul seçildi. Şimdi kullanıcı seçin, ardından rol ve modül sorumluluklarını belirleyin.</Text>
            <View style={styles.stepsRow}>
              <StepPill index={1} label="Okul" done />
              <StepPill index={2} label="Kullanıcı" done={Boolean(selectedUserId)} />
              <StepPill index={3} label="Rol & Modül" done={Boolean(selectedAssignment?.role && selectedAssignment.modules.length)} />
            </View>
            <Row label="Atama sayısı" value={String(assignments.length)} />
            <Row label="Principal sayısı" value={String(principals.length)} />
          </Card>

          <Card>
            <View style={styles.cardTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Kullanıcı seç</Text>
                <Text style={[styles.sectionSub, { color: colors.textDim }]}>Bu okul için atanacak kullanıcıyı seçin.</Text>
              </View>
              <StatusBadge label={`${candidateUsers.length} uygun`} tone="review" />
            </View>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Ad veya e-posta ara..." />
            <View style={styles.userList}>
              {candidateUsers.slice(0, 12).map((user) => (
                <UserChoiceCard key={String(user.id)} user={user} onPress={() => chooseUser(user)} selected={Number(selectedUserId) === Number(user.id)} />
              ))}
              {!candidateUsers.length ? <EmptyState icon="person-add-outline" title="Uygun kullanıcı yok" subtitle="Aramayı değiştirin veya kullanıcıların ülke/rol bilgisini kontrol edin." /> : null}
            </View>
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Rol ve modül ata</Text>
            {selectedAssignment ? (
              <>
                <View style={[styles.selectedUser, { borderColor: colors.border, backgroundColor: colors.bgElev2 }]}> 
                  <Avatar name={userName(selectedUser)} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userTitle, { color: colors.text }]}>{userName(selectedUser)}</Text>
                    <Text style={[styles.userSub, { color: colors.textDim }]}>{selectedUser?.email || `ID ${selectedAssignment.userId}`}</Text>
                    <Text style={[styles.userSub, { color: colors.textDim }]}>Mevcut rol: {roleLabel(selectedAssignment.role)}</Text>
                  </View>
                  <Pressable onPress={() => removeUser(selectedAssignment.userId)} hitSlop={10} style={[styles.removeBtn, { borderColor: alpha(colors.danger, 0.35), backgroundColor: alpha(colors.danger, 0.12) }]}>
                    <Ionicons name="trash-outline" size={17} color={colors.danger} />
                  </Pressable>
                </View>

                <Text style={[styles.groupLabel, { color: colors.textDim }]}>Rol</Text>
                <View style={styles.wrapChips}>
                  {ASSIGNMENT_ROLES.map((role) => (
                    <Chip
                      key={role.key}
                      label={role.label}
                      active={selectedAssignment.role === role.key}
                      onPress={() => updateAssignment(selectedAssignment.userId, (assignment) => ({ ...assignment, role: role.key }))}
                    />
                  ))}
                </View>

                <View style={styles.cardTitleRow}>
                  <Text style={[styles.groupLabel, { color: colors.textDim, marginBottom: 0 }]}>Modüller</Text>
                  <Button
                    label="Tümünü Seç"
                    small
                    variant="ghost"
                    onPress={() => updateAssignment(selectedAssignment.userId, (assignment) => ({ ...assignment, modules: ASSIGNMENT_MODULES.map((module) => module.id) }))}
                  />
                </View>
                <View style={styles.moduleGrid}>
                  {ASSIGNMENT_MODULES.map((module) => {
                    const active = selectedAssignment.modules.includes(module.id);
                    return (
                      <Pressable
                        key={module.id}
                        onPress={() => updateAssignment(selectedAssignment.userId, (assignment) => {
                          const modules = new Set(assignment.modules);
                          if (modules.has(module.id)) modules.delete(module.id);
                          else modules.add(module.id);
                          return { ...assignment, modules: Array.from(modules) };
                        })}
                        style={({ pressed }) => [
                          styles.moduleCard,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? alpha(colors.primary, 0.14) : colors.bgElev2,
                            opacity: pressed ? 0.82 : 1,
                          },
                        ]}
                      >
                        <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={18} color={active ? colors.primary : colors.textMuted} />
                        <Text style={[styles.moduleText, { color: active ? colors.text : colors.textDim }]}>{module.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <EmptyState icon="person-outline" title="Kullanıcı seçin" subtitle="Rol ve modül ataması için önce listeden bir kullanıcı seçin." />
            )}
          </Card>

          <Text style={[styles.listLabel, { color: colors.textDim }]}>Mevcut atamalar</Text>
          <View style={styles.assignmentList}>
            {assignments.map((assignment) => {
              const assignedUser = usersById.get(String(assignment.userId));
              const selected = Number(selectedUserId) === Number(assignment.userId);
              return (
                <Pressable
                  key={String(assignment.userId)}
                  onPress={() => setSelectedUserId(Number(assignment.userId))}
                  style={({ pressed }) => [
                    styles.assignmentRow,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: colors.bgElev,
                      opacity: pressed ? 0.86 : 1,
                    },
                  ]}
                >
                  <Avatar name={userName(assignedUser)} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userTitle, { color: colors.text }]}>{userName(assignedUser)}</Text>
                    <Text style={[styles.userSub, { color: colors.textDim }]}>{assignedUser?.email || `ID ${assignment.userId}`}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.roleText, { color: colors.primary }]}>{roleLabel(assignment.role)}</Text>
                    <Text style={[styles.userSub, { color: colors.textDim }]}>{assignment.modules.length} modül</Text>
                  </View>
                </Pressable>
              );
            })}
            {!assignments.length ? <EmptyState icon="person-add-outline" title="Atama yok" subtitle="Önce bir kullanıcı seçin." /> : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ eyebrow, title, onBack, right }: { eyebrow: string; title: string; onBack: () => void; right?: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}> 
      <Pressable onPress={onBack} hitSlop={12} style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.bgElev }]}> 
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.headerLabel, { color: colors.textMuted }]}>{eyebrow}</Text>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

function StepPill({ index, label, done }: { index: number; label: string; done?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stepPill, { borderColor: done ? alpha(colors.success, 0.35) : colors.border, backgroundColor: done ? alpha(colors.success, 0.12) : colors.bgElev2 }]}> 
      <View style={[styles.stepDot, { backgroundColor: done ? colors.success : colors.textMuted }]}> 
        <Text style={styles.stepDotText}>{done ? "✓" : index}</Text>
      </View>
      <Text style={[styles.stepText, { color: done ? colors.text : colors.textDim }]}>{label}</Text>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const { colors } = useAppTheme();
  const initial = String(name || "?").trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?";
  return (
    <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 0.16) }]}> 
      <Text style={[styles.avatarText, { color: colors.primary }]}>{initial}</Text>
    </View>
  );
}

function UserChoiceCard({ user, selected, onPress }: { user: AdminUser; selected?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.userChoice,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? alpha(colors.primary, 0.12) : colors.bgElev2,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <Avatar name={userName(user)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.userTitle, { color: colors.text }]} numberOfLines={1}>{userName(user)}</Text>
        <Text style={[styles.userSub, { color: colors.textDim }]} numberOfLines={1}>{user.email || "-"}</Text>
      </View>
      <View style={[styles.roleBadge, { borderColor: alpha(colors.primary, 0.45) }]}> 
        <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{roleLabel(user.role).toLocaleUpperCase("tr-TR")}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bodyPad: { padding: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.8 },
  headerTitle: { ...font.h3, marginTop: 2 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...font.h3 },
  sectionSub: { ...font.small, marginTop: 4, marginBottom: spacing.md },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm },
  stepsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  stepPill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 10 },
  stepDot: { width: 19, height: 19, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  stepDotText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  stepText: { ...font.tiny, letterSpacing: 0 },
  userList: { gap: spacing.sm, marginTop: spacing.md },
  userChoice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "900" },
  userTitle: { ...font.bodyMd },
  userSub: { ...font.small, marginTop: 2 },
  roleBadge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeText: { ...font.tiny, letterSpacing: 0.6 },
  selectedUser: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  removeBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  groupLabel: { ...font.small, textTransform: "uppercase", letterSpacing: 0.7, marginTop: spacing.sm, marginBottom: spacing.sm },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  moduleGrid: { gap: spacing.sm },
  moduleCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm },
  moduleText: { ...font.small, flex: 1 },
  listLabel: { ...font.small, textTransform: "uppercase", letterSpacing: 0.8, marginTop: spacing.sm },
  assignmentList: { gap: spacing.sm },
  assignmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md },
  roleText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.8 },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  noticeText: { ...font.small, flex: 1 },
});
