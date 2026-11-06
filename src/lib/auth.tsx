// ponytail: native Supabase GoTrue Auth listener; zero external auth libraries
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, captchaToken?: string) => Promise<{
    error: Error | null;
    needsEmailConfirmation: boolean;
  }>;
  resetPassword: (email: string, captchaToken?: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  passwordRecovery: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, needsEmailConfirmation: false }),
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  clearPasswordRecovery: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session && new URLSearchParams(window.location.search).get('password-reset') === '1') {
        setPasswordRecovery(true);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, captchaToken?: string) => {
    if (!supabase) return { error: new Error('Supabase client not initialized') };
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (email: string, password: string, captchaToken?: string) => {
    if (!supabase) return { error: new Error('Supabase client not initialized'), needsEmailConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    return {
      error: error ? new Error(error.message) : null,
      needsEmailConfirmation: !error && !data.session,
    };
  };

  const resetPassword = async (email: string, captchaToken?: string) => {
    if (!supabase) return { error: new Error('Supabase client not initialized') };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?password-reset=1`,
      captchaToken,
    });
    return { error: error ? new Error(error.message) : null };
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return { error: new Error('Supabase client not initialized') };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
  };

  const clearPasswordRecovery = () => setPasswordRecovery(false);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      passwordRecovery,
      signIn,
      signUp,
      resetPassword,
      updatePassword,
      clearPasswordRecovery,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
