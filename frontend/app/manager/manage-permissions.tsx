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

import { AdminUser, PermissionCatalog, School, api } from "@/src/api/client";
import {
  buildPermissionPayload,
  flattenCatalog,
  permissionKey,
  permissionsToDraft,
} from "@/src/admin/pr09";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { colors, font, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, EmptyState, Input } from "@/src/ui/components";

const ROLES = [
  { key: "user", label: "Kullanici" },
  { key: "hr", label: "IK" },
  { key: "principal", label: "Okul Muduru" },
];

function editableManagerRole(role?: string | null) {
  return ROLES.some((item) => item.key === role);
}

function managedRoleValue(role?: string | null) {
  if (editableManagerRole(role)) return String(role);
  if (role === "accountant") return "accountant";
  return "user";
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/schools");
}

function userLabel(user?: AdminUser | null) {
  return user?.full_name || user?.email || "-";
}

function stateSignature(role: string, selected: Record<string, boolean>, scopes: Record<string, string>) {
  return JSON.stringify({ role, selected, scopes });
}

function filterManagerCatalog(catalog: PermissionCatalog | null) {
  const next: PermissionCatalog = {};
  Object.entries(catalog || {}).forEach(([group, rows]) => {
    const allowed = (Array.isArray(rows) ? rows : []).filter((row) => row.resource !== "page.manage_permissions");
    if (allowed.length) next[group] = allowed;
  });
  return next;
}

function sortUsers(users: AdminUser[]) {
  return [...users].sort((a, b) => {
    const left = String(a.full_name || a.email || "").toLowerCase();
    const right = String(b.full_name || b.email || "").toLowerCase();
    return left.localeCompare(right);
  });
}

export default function ManagerManagePermissionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const countryId = me?.country_id == null ? null : Number(me.country_id);
  const canManage = can(me, "page.manage_permissions", "write", { countryId, schoolId: null });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("user");
  const [permissionSelections, setPermissionSelections] = useState<Record<string, boolean>>({});
  const [permissionScopes, setPermissionScopes] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const [searchPermission, setSearchPermission] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");

  const selectedUser = users.find((user) => String(user.id) === String(selectedUserId)) || null;
  const dirty = selectedUser
    ? stateSignature(selectedRole, permissionSelections, permissionScopes) !== snapshot
    : false;

  const loadBase = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setErr("");
    try {
      const [userRes, schoolRes, catalogRes] = await Promise.all([
        api.managerListUsers(),
        api.listSchools({ fields: "all", order: "name:asc" }).catch(() => ({ items: [] as School[] })),
        api.managerGetPermissionsCatalog(),
      ]);
      setUsers(sortUsers(userRes.items));
      setSchools(schoolRes.items);
      setCatalog(filterManagerCatalog(catalogRes));
      if (params.userId && userRes.items.some((user) => String(user.id) === String(params.userId))) {
        setSelectedUserId((prev) => prev || String(params.userId));
      }
    } catch (error: any) {
      setErr(error?.message || "Yetki verileri yuklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage, params.userId]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadUserPermissions = useCallback(async (user: AdminUser | null) => {
    if (!user) {
      setSelectedRole("user");
      setPermissionSelections({});
      setPermissionScopes({});
      setSnapshot("");
      return;
    }
    setPermissionsLoading(true);
    setErr("");
    try {
      const permissions = await api.managerGetUserPermissions(user.id);
      const draft = permissionsToDraft(permissions.filter((row) => row.resource !== "page.manage_permissions"));
      const nextRole = managedRoleValue(user.role);
      setSelectedRole(nextRole);
      setPermissionSelections(draft.selected);
      setPermissionScopes(draft.scopes);
      setSnapshot(stateSignature(nextRole, draft.selected, draft.scopes));
    } catch (error: any) {
      setErr(error?.message || "Kullanici yetkileri yuklenemedi.");
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserPermissions(selectedUser);
  }, [loadUserPermissions, selectedUser]);

  const filteredUsers = useMemo(() => {
    const q = searchUser.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter && user.role !== roleFilter) return false;
      if (user.role === "manager" || user.role === "admin") return false;
      if (!q) return true;
      return `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(q);
    });
  }, [roleFilter, searchUser, users]);

  const catalogGroups = useMemo(() => {
    const q = searchPermission.trim().toLowerCase();
    return flattenCatalog(catalog).map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (!q) return true;
        return `${row.label} ${row.resource}`.toLowerCase().includes(q);
      }),
    })).filter((group) => group.rows.length > 0);
  }, [catalog, searchPermission]);

  function selectUser(user: AdminUser) {
    if (dirty) {
      setMessage("Kullanici degistirmeden once kaydedin veya yenileyin.");
      return;
    }
    setMessage("");
    setSelectedUserId(String(user.id));
  }

  function togglePermission(resource: string, action: "read" | "write") {
    const key = permissionKey(resource, action);
    const readKey = permissionKey(resource, "read");
    const writeKey = permissionKey(resource, "write");
    setPermissionSelections((prev) => {
      const next = { ...prev };
      const enable = !next[key];
      if (action === "write") {
        next[writeKey] = enable;
        if (enable) next[readKey] = true;
      } else {
        next[readKey] = enable;
        if (!enable) next[writeKey] = false;
      }
      return next;
    });
    setPermissionScopes((prev) => {
      const next = { ...prev };
      if (!next[readKey]) next[readKey] = "country";
      if (action === "write" && !next[writeKey]) next[writeKey] = next[readKey] || "country";
      return next;
    });
  }

  function setResourceScope(resource: string, scope: string) {
    const readKey = permissionKey(resource, "read");
    const writeKey = permissionKey(resource, "write");
    setPermissionScopes((prev) => {
      const next = { ...prev };
      if (permissionSelections[readKey]) next[readKey] = scope;
      if (permissionSelections[writeKey]) next[writeKey] = scope;
      return next;
    });
  }

  async function save() {
    if (!selectedUser || countryId == null) return;
    setSaving(true);
    setErr("");
    setMessage("");
    try {
      if (editableManagerRole(selectedUser.role) && String(selectedUser.role || "") !== String(selectedRole)) {
        await api.managerUpdateUserRole(selectedUser.id, { role: selectedRole });
      }
      const permissions = buildPermissionPayload(permissionSelections, permissionScopes, countryId)
        .filter((permission) => permission.resource !== "page.manage_permissions");
      await api.managerSetUserPermissions(selectedUser.id, { permissions });
      await loadBase();
      setSnapshot(stateSignature(selectedRole, permissionSelections, permissionScopes));
      setMessage("Kullanici yetkileri kaydedildi.");
    } catch (error: any) {
      setErr(error?.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-manage-permissions-denied">
        <View style={styles.header}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>MUDUR YONETIMI</Text>
            <Text style={styles.headerTitle}>Yetki Yok</Text>
          </View>
        </View>
        <View style={{ padding: spacing.lg }}>
          <Notice icon="lock-closed-outline" color={colors.warn} text="Bu ekran icin page.manage_permissions yazma yetkisi gerekir." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-manage-permissions-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (dirty) {
              setMessage("Once degisiklikleri kaydedin veya vazgecin.");
              return;
            }
            goBack(router);
          }}
          hitSlop={12}
          style={styles.backBtn}
          testID="manager-permissions-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>MUDUR YONETIMI</Text>
          <Text style={styles.headerTitle}>Yetkiler</Text>
        </View>
        <Button label="Kaydet" icon="save-outline" small onPress={save} loading={saving} disabled={!dirty || !selectedUser} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(user) => String(user.id)}
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
                loadBase();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
              {message ? <Notice icon="information-circle-outline" color={colors.primary} text={message} /> : null}

              <Card>
                <Text style={styles.sectionTitle}>{me?.country_name || "Ulke"} yetkileri</Text>
                <Text style={styles.sectionSub}>
                  Mudurler sadece kendi ulkesindeki kullanicilara ulke veya okul kapsamli yetki atayabilir.
                </Text>
                <Input value={searchUser} onChangeText={setSearchUser} placeholder="Kullanici ara..." />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
                  <Chip label="Tumu" active={roleFilter == null} onPress={() => setRoleFilter(null)} />
                  {ROLES.map((role) => (
                    <Chip key={role.key} label={role.label} active={roleFilter === role.key} onPress={() => setRoleFilter(role.key)} />
                  ))}
                </ScrollView>
              </Card>

              {selectedUser ? (
                <PermissionEditor
                  user={selectedUser}
                  schools={schools}
                  groups={catalogGroups}
                  selectedRole={selectedRole}
                  permissionSelections={permissionSelections}
                  permissionScopes={permissionScopes}
                  permissionsLoading={permissionsLoading}
                  searchPermission={searchPermission}
                  openGroups={openGroups}
                  onSearchPermission={setSearchPermission}
                  roleReadOnly={!editableManagerRole(selectedUser.role)}
                  onRoleChange={setSelectedRole}
                  onTogglePermission={togglePermission}
                  onScopeChange={setResourceScope}
                  onToggleGroup={(group) => {
                    setOpenGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    });
                  }}
                />
              ) : (
                <EmptyState icon="key-outline" title="Kullanici secin" subtitle="Yetki duzenlemek icin listeden bir kullanici secin." />
              )}

              <Card>
                <View style={styles.assignmentsHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Okul Atamalari</Text>
                    <Text style={styles.sectionSub}>Principal, HR ve accountant modul atamalari.</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.schoolChips}>
                  {schools.map((school) => (
                    <Pressable
                      key={String(school.id)}
                      onPress={() => {
                        if (dirty) {
                          setMessage("Once degisiklikleri kaydedin veya vazgecin.");
                          return;
                        }
                        router.push({ pathname: "/manager/schools/[id]/assignments", params: { id: String(school.id) } });
                      }}
                      style={styles.schoolChip}
                    >
                      <Ionicons name="school-outline" size={15} color={colors.primary} />
                      <Text style={styles.schoolChipText} numberOfLines={1}>{school.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {!schools.length ? <Text style={styles.emptySmall}>Atama yapilacak okul bulunamadi.</Text> : null}
              </Card>

              <Text style={styles.listLabel}>Kullanicilar</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.sm }}
          ListEmptyComponent={<EmptyState icon="people-outline" title="Kullanici bulunamadi" />}
          renderItem={({ item }) => {
            const selected = String(item.id) === String(selectedUserId);
            return (
              <Pressable
                onPress={() => selectUser(item)}
                style={({ pressed }) => [
                  styles.userCard,
                  selected && { borderColor: colors.primary, backgroundColor: "#F5B30112" },
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                testID={`manager-permissions-user-${item.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.userTitle}>{userLabel(item)}</Text>
                  <Text style={styles.userSub}>{item.email}</Text>
                </View>
                <Text style={styles.userRole}>{item.role}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PermissionEditor({
  user,
  schools,
  groups,
  selectedRole,
  roleReadOnly,
  permissionSelections,
  permissionScopes,
  permissionsLoading,
  searchPermission,
  openGroups,
  onSearchPermission,
  onRoleChange,
  onTogglePermission,
  onScopeChange,
  onToggleGroup,
}: {
  user: AdminUser;
  schools: School[];
  groups: ReturnType<typeof flattenCatalog>;
  selectedRole: string;
  roleReadOnly: boolean;
  permissionSelections: Record<string, boolean>;
  permissionScopes: Record<string, string>;
  permissionsLoading: boolean;
  searchPermission: string;
  openGroups: Set<string>;
  onSearchPermission: (value: string) => void;
  onRoleChange: (value: string) => void;
  onTogglePermission: (resource: string, action: "read" | "write") => void;
  onScopeChange: (resource: string, scope: string) => void;
  onToggleGroup: (group: string) => void;
}) {
  return (
    <Card testID="manager-permissions-editor">
      <Text style={styles.sectionTitle}>{userLabel(user)}</Text>
      <Text style={styles.sectionSub}>{user.email}</Text>

      <Text style={styles.groupLabel}>Rol</Text>
      {roleReadOnly ? (
        <>
          <View style={styles.wrapChips}>
            <Chip label={selectedRole === "accountant" ? "Muhasebeci" : selectedRole || "-"} active />
          </View>
          <Notice
            icon="lock-closed-outline"
            color={colors.warn}
            text="Bu kullanicinin rolu manager ekranindan degistirilemez; yetkiler yine kaydedilebilir."
          />
        </>
      ) : (
        <View style={styles.wrapChips}>
          {ROLES.map((role) => (
            <Chip key={role.key} label={role.label} active={selectedRole === role.key} onPress={() => onRoleChange(role.key)} />
          ))}
        </View>
      )}

      {permissionsLoading ? (
        <View style={styles.centerSmall}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <Input value={searchPermission} onChangeText={onSearchPermission} placeholder="Yetki ara..." />
          {groups.map((group) => {
            const open = openGroups.has(group.group) || Boolean(searchPermission.trim());
            const enabledCount = group.rows.reduce((sum, row) => {
              return sum
                + (permissionSelections[permissionKey(row.resource, "read")] ? 1 : 0)
                + (permissionSelections[permissionKey(row.resource, "write")] ? 1 : 0);
            }, 0);
            return (
              <View key={group.group} style={styles.permissionGroup}>
                <Pressable onPress={() => onToggleGroup(group.group)} style={styles.permissionGroupHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permissionGroupTitle}>{group.group}</Text>
                    <Text style={styles.cardSub}>{enabledCount}/{group.rows.length * 2} aktif</Text>
                  </View>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textDim} />
                </Pressable>
                {open ? (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {group.rows.map((row) => {
                      const readKey = permissionKey(row.resource, "read");
                      const writeKey = permissionKey(row.resource, "write");
                      const read = Boolean(permissionSelections[readKey]);
                      const write = Boolean(permissionSelections[writeKey]);
                      const scope = permissionScopes[writeKey] || permissionScopes[readKey] || "country";
                      return (
                        <View key={row.resource} style={styles.permissionRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.permissionTitle}>{row.label}</Text>
                            <Text style={styles.cardSub}>{row.resource}</Text>
                          </View>
                          <View style={styles.permissionActions}>
                            <Chip label="Oku" active={read} onPress={() => onTogglePermission(row.resource, "read")} />
                            <Chip label="Yaz" active={write} onPress={() => onTogglePermission(row.resource, "write")} />
                          </View>
                          {(read || write) ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeChips}>
                              <Chip label="Ulke" active={scope === "country"} onPress={() => onScopeChange(row.resource, "country")} />
                              {schools.map((school) => (
                                <Chip
                                  key={school.id}
                                  label={school.name}
                                  active={scope === `school:${school.id}`}
                                  onPress={() => onScopeChange(row.resource, `school:${school.id}`)}
                                />
                              ))}
                            </ScrollView>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </Card>
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
  centerSmall: { padding: spacing.lg, alignItems: "center", justifyContent: "center" },
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
  horizontalChips: { gap: spacing.sm, alignItems: "center" },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  userTitle: { color: colors.text, ...font.bodyMd },
  userSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  userRole: { color: colors.primary, ...font.tiny, textTransform: "uppercase" },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4, marginBottom: spacing.md },
  groupLabel: { color: colors.textDim, ...font.small, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  listLabel: { color: colors.textDim, ...font.small, textTransform: "uppercase", letterSpacing: 0.6 },
  assignmentsHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  schoolChips: { gap: spacing.sm, alignItems: "center", paddingBottom: 2 },
  schoolChip: {
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
  schoolChipText: { color: colors.text, ...font.small, maxWidth: 170 },
  emptySmall: { color: colors.textDim, ...font.small },
  permissionGroup: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  permissionGroupHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  permissionGroupTitle: { color: colors.text, ...font.bodyMd },
  permissionRow: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionTitle: { color: colors.text, ...font.bodyMd },
  permissionActions: { flexDirection: "row", gap: spacing.sm },
  scopeChips: { gap: spacing.sm, alignItems: "center", paddingBottom: 2 },
  cardSub: { color: colors.textDim, ...font.small, marginTop: 2 },
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
