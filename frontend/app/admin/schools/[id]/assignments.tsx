import { SchoolAssignmentsScreen } from "@/src/assignments/SchoolAssignmentsScreen";

export default function AdminSchoolAssignmentsRoute() {
  return (
    <SchoolAssignmentsScreen
      mode="admin"
      canAccess
      backFallback="/admin/countries"
      testID="admin-school-assignments-screen"
    />
  );
}
