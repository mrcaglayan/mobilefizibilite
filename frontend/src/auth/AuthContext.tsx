// Auth context — holds JWT token + user profile, persists token via SecureStore.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, loadToken, saveToken, User } from "@/src/api/client";

type AuthState = {
  token: string | null;
  user: User | null;
  bootstrapping: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
  setSession: (session: { token?: string | null; user?: User | null }) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

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
          const me = await api.me();
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
    setUser(res.user);
    return res.user;
  }, []);

  const setSession = useCallback(async (session: { token?: string | null; user?: User | null }) => {
    if (!session?.token) return;
    await saveToken(session.token);
    setToken(session.token);
    setUser(session.user || null);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await api.changePassword({ currentPassword, newPassword });
      await setSession(res);
      return res.user;
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
