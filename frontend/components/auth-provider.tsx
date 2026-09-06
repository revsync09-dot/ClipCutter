'use client';

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { sendPresenceHeartbeat } from '../lib/api';
import { supabase } from '../lib/supabase';
import { authCallbackUrl } from '../lib/api-config';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function syncMediaCookie(session: Session | null) {
  if (session?.access_token) {
    document.cookie = `clipforge_access_token=${encodeURIComponent(session.access_token)}; Path=/; SameSite=Lax; Max-Age=3600`;
  } else {
    document.cookie = 'clipforge_access_token=; Path=/; SameSite=Lax; Max-Age=0';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      syncMediaCookie(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      syncMediaCookie(nextSession);
      setLoading(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    const report = () => {
      if (document.visibilityState === 'hidden') return;
      const page = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      void sendPresenceHeartbeat(page).catch(() => undefined);
    };
    report();
    const timer = window.setInterval(report, 30_000);
    document.addEventListener('visibilitychange', report);
    window.addEventListener('focus', report);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('focus', report);
    };
  }, [session?.access_token]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authCallbackUrl() },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Das Konto konnte nicht erstellt werden. Bitte erneut versuchen.');
      if (!data.session && data.user.identities?.length === 0) {
        throw new Error('Für diese E-Mail existiert bereits ein Konto. Bitte anmelden oder eine Bestätigung erneut senden.');
      }
      return Boolean(data.session);
    },
    resendConfirmation: async (email) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authCallbackUrl() },
      });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  return context;
}
