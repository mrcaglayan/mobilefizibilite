import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";

import {
  AppThemeColors,
  AppThemeMode,
  ResolvedThemeMode,
  darkColors,
  lightColors,
} from "@/src/theme";
import { storage } from "@/src/utils/storage";

const THEME_STORAGE_KEY = "app.themeMode";

export type AppTheme = {
  mode: AppThemeMode;
  resolvedMode: ResolvedThemeMode;
  colors: AppThemeColors;
  isDark: boolean;
  setMode: (mode: AppThemeMode) => Promise<void>;
};

const ThemeContext = createContext<AppTheme | null>(null);

function normalizeMode(value: unknown): AppThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<AppThemeMode>("light");

  useEffect(() => {
    let mounted = true;
    storage.getItem(THEME_STORAGE_KEY, "light").then((stored) => {
      if (mounted) setModeState(normalizeMode(stored));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const resolvedMode: ResolvedThemeMode =
    mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;
  const colors = resolvedMode === "light" ? lightColors : darkColors;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  const setMode = useCallback(async (nextMode: AppThemeMode) => {
    const normalized = normalizeMode(nextMode);
    setModeState(normalized);
    await storage.setItem(THEME_STORAGE_KEY, normalized);
  }, []);

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      resolvedMode,
      colors,
      isDark: resolvedMode === "dark",
      setMode,
    }),
    [colors, mode, resolvedMode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useAppTheme must be used inside ThemeProvider");
  }
  return value;
}
