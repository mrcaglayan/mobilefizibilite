import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { getHomeRoute } from "@/src/auth/routes";
import { colors } from "@/src/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "slide_from_right",
            }}
          />
          <AuthRedirector />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AuthRedirector() {
  const { bootstrapping, token, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) return;

    const isLogin = pathname === "/login";
    const isProfile = pathname === "/profile";
    const isIndex = pathname === "/";

    if (!token) {
      if (!isLogin) router.replace("/login");
      return;
    }

    if (user?.must_reset_password) {
      if (!isProfile) router.replace("/profile");
      return;
    }

    if (isLogin || isIndex) {
      router.replace(getHomeRoute(user));
    }
  }, [bootstrapping, pathname, router, token, user]);

  const isLogin = pathname === "/login";
  const isProfile = pathname === "/profile";
  const isIndex = pathname === "/";
  const redirecting =
    (!token && !isLogin) ||
    (Boolean(token) && Boolean(user?.must_reset_password) && !isProfile) ||
    (Boolean(token) && !user?.must_reset_password && (isLogin || isIndex));

  if (bootstrapping) {
    return (
      <View style={overlayStyle}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (redirecting) {
    return (
      <View style={overlayStyle}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return null;
}

const overlayStyle = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: colors.bg,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
