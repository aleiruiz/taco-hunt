import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Linking } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  retrySession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos restaurar tu sesión.";
}

async function restoreSessionFromUrl(url: string) {
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const fragment = url.split("#")[1] ?? "";
  const params = new URLSearchParams(`${query}&${fragment}`);
  const description = params.get("error_description");
  if (description) throw new Error(description);

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return;
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A stored session can outlive its account (e.g. deleted from another device). When the API
  // rejects it, try one refresh; if that also fails, drop it locally so the app browses as a
  // guest instead of repeating rejected requests.
  const accessToken = session?.access_token;
  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API}/me`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
        });
        if (cancelled || response.status !== 401) return;
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!cancelled && refreshError) await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Offline or API unavailable: keep the session; this check runs again next launch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const retrySession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      setSession(data.session);
    } catch (cause) {
      setError(messageFromError(cause));
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setError(null);
        setLoading(false);
      }
    });

    const handleUrl = async (url: string) => {
      try {
        await restoreSessionFromUrl(url);
      } catch (cause) {
        if (active) setError(messageFromError(cause));
      }
    };
    const subscription = Linking.addEventListener("url", ({ url }) => void handleUrl(url));

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await restoreSessionFromUrl(initialUrl);
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active) setSession(sessionData.session);
      } catch (cause) {
        if (active) {
          setSession(null);
          setError(messageFromError(cause));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      subscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      retrySession,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, error, retrySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
