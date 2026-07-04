import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function AdminSchoolPrincipalsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/admin/schools/[id]/assignments", params: { id: String(id) } }} />;
}
