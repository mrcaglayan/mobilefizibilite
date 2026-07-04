// Auth context — holds JWT token + user profile, persists token via SecureStore.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, loadToken, saveToken, User } from "@/src/api/client";

type AuthState = {
  token: string | null;
  user: User | null;
  bootstrapping: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
  setSession: (session: { token?: string | null; user?: User | null }) => Promise<User | null>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function loadSessionUser(token: string, fallback?: User | null): Promise<User> {
  try {
    return await api.me(token);
  } catch {
    if (fallback) return fallback;
    throw new Error("Session could not be loaded");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) {
        setToken(t);
        try {
          const me = await loadSessionUser(t);
          setUser(me);
        } catch {
          await saveToken(null);
          setToken(null);
        }
      }
      setBootstrapping(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const res = await api.login(email, password);
    await saveToken(res.token);
    setToken(res.token);
    const me = await loadSessionUser(res.token, res.user);
    setUser(me);
    return me;
  }, []);

  const setSession = useCallback(async (session: { token?: string | null; user?: User | null }) => {
    if (!session?.token) return null;
    await saveToken(session.token);
    setToken(session.token);
    const me = await loadSessionUser(session.token, session.user || null);
    setUser(me);
    return me;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await api.changePassword({ currentPassword, newPassword });
      const me = await setSession(res);
      return me || res.user;
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, user, bootstrapping, login, changePassword, setSession, logout }),
    [token, user, bootstrapping, login, changePassword, setSession, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
