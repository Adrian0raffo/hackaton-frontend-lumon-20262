import { createContext, useContext, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/api";

type LoginResponse = {
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

type Session = { accessToken: string; refreshToken: string; user: Me };

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  async function login(email: string, password: string) {
    const tokens = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    const user = await apiRequest<Me>("/auth/me", {
      accessToken: tokens.accessToken,
    });
    setSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    });
  }

  async function logout() {
    if (!session) return;
    await apiRequest<unknown>("/auth/logout", {
      method: "POST",
      body: { refreshToken: session.refreshToken },
    });
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider no está disponible.");
  return context;
}
