import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest, ApiError, type RequestOptions } from "../lib/api";

const REFRESH_KEY = "lumon.refresh";
const CHANNEL_NAME = "lumon.session";

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type Me = {
  id: number;
  email: string;
  displayName: string;
  team: { code: string; name: string };
  role: { code: string; name: string };
  permissions: string[];
  clearance: { granted: boolean; grantedAt: string | null };
};

type Session = { accessToken: string; user: Me };
type SessionMessage =
  | { type: "tokens"; accessToken: string; refreshToken: string; user: Me | null }
  | { type: "logout" };

type AuthContextValue = {
  session: Session | null;
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (teamName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(localStorage.getItem(REFRESH_KEY)));
  const sessionRef = useRef<Session | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  function updateSession(next: Session | null) {
    sessionRef.current = next;
    setSession(next);
  }

  function clearSession(broadcast: boolean) {
    localStorage.removeItem(REFRESH_KEY);
    updateSession(null);
    if (broadcast) channelRef.current?.postMessage({ type: "logout" } satisfies SessionMessage);
  }

  function saveTokens(tokens: TokenPair, user: Me | null) {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    if (user) updateSession({ accessToken: tokens.accessToken, user });
    channelRef.current?.postMessage({
      type: "tokens",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    } satisfies SessionMessage);
  }

  async function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
    if (navigator.locks) return navigator.locks.request("lumon-refresh", callback);
    return callback();
  }

  function refresh(expiredToken?: string): Promise<string> {
    if (refreshPromise.current) return refreshPromise.current;
    const work = withRefreshLock(async () => {
      const current = sessionRef.current?.accessToken;
      if (current && current !== expiredToken) return current;
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) throw new ApiError(401, "SESSION_REVOKED", "La sesión terminó.", null);
      const tokens = await apiRequest<TokenPair>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
      saveTokens(tokens, sessionRef.current?.user ?? null);
      return tokens.accessToken;
    });
    refreshPromise.current = work;
    void work.finally(() => {
      if (refreshPromise.current === work) refreshPromise.current = null;
    }).catch(() => undefined);
    return work;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = sessionRef.current?.accessToken;
    if (!token) throw new ApiError(401, "TOKEN_INVALID", "Inicia sesión para continuar.", null);
    try {
      return await apiRequest<T>(path, { ...options, accessToken: token });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TOKEN_EXPIRED") {
        try {
          const next = await refresh(token);
          return await apiRequest<T>(path, { ...options, accessToken: next });
        } catch (refreshError) {
          if (refreshError instanceof ApiError &&
              ["REFRESH_REUSED", "SESSION_REVOKED", "TOKEN_INVALID"].includes(refreshError.code)) {
            clearSession(true);
          }
          throw refreshError;
        }
      }
      if (error instanceof ApiError && ["SESSION_REVOKED", "TOKEN_INVALID"].includes(error.code)) {
        clearSession(true);
      }
      throw error;
    }
  }

  async function enter(path: "/auth/login" | "/auth/register", body: unknown) {
    const tokens = await apiRequest<TokenPair>(path, { method: "POST", body });
    const user = await apiRequest<Me>("/auth/me", { accessToken: tokens.accessToken });
    saveTokens(tokens, user);
    updateSession({ accessToken: tokens.accessToken, user });
  }

  async function login(email: string, password: string) {
    await enter("/auth/login", { email, password });
  }

  async function register(teamName: string, email: string, password: string) {
    await enter("/auth/register", { teamName, email, password });
  }

  async function logout() {
    await withRefreshLock(async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (refreshToken) {
        await apiRequest<null>("/auth/logout", { method: "POST", body: { refreshToken } });
      }
      clearSession(true);
    });
  }

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<SessionMessage>) => {
      if (event.data.type === "logout") {
        clearSession(false);
      } else if (event.data.type === "tokens") {
        localStorage.setItem(REFRESH_KEY, event.data.refreshToken);
        const user = event.data.user ?? sessionRef.current?.user;
        if (user) updateSession({ accessToken: event.data.accessToken, user });
      }
    };
    if (localStorage.getItem(REFRESH_KEY)) {
      void refresh()
        .then((accessToken) => apiRequest<Me>("/auth/me", { accessToken }).then((user) => {
          updateSession({ accessToken, user });
        }))
        .catch(() => clearSession(true))
        .finally(() => setRestoring(false));
    }
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, restoring, login, register, logout, request }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider no está disponible.");
  return context;
}
