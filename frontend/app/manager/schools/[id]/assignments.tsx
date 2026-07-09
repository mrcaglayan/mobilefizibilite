import { useLocalSearchParams } from "expo-router";

import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { SchoolAssignmentsScreen } from "@/src/assignments/SchoolAssignmentsScreen";

export default function ManagerSchoolAssignmentsRoute() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const countryId = user?.country_id == null ? null : Number(user.country_id);
  const canManage = can(user, "page.manage_permissions", "write", {
    countryId,
    schoolId: id ? Number(id) : null,
  });

  return (
    <SchoolAssignmentsScreen
      mode="manager"
      canAccess={canManage}
      backFallback="/manager/manage-permissions"
      testID="manager-school-assignments-screen"
    />
  );
}
