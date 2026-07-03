// Splash / redirect based on auth state.

import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { bootstrapping, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) return;
    if (token) router.replace("/schools");
    else router.replace("/login");
  }, [bootstrapping, token, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
