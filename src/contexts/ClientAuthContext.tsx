import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseErrorMessage } from '@/lib/supabaseErrors';

interface ClientAccount {
  id: string;
  client_id: string | null;
  tenant_id: string;
  preferred_professional_id: string | null;
  terms_accepted_at: string | null;
}

interface ClientAuthContextType {
  user: User | null;
  session: Session | null;
  clientAccount: ClientAccount | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string, 
    password: string, 
    fullName: string, 
    phone: string,
    birthDate: string | null,
    tenantId: string,
    preferredProfessionalId?: string,
    preferredServiceIds?: string[],
    photoFile?: File | null
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  resendSignupConfirmation: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshClientAccount: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);
const CLIENT_EMAIL_CONFIRMATION_ENABLED = (import.meta.env.VITE_CLIENT_EMAIL_CONFIRMATION_REQUIRED ?? 'true') !== 'false';

export const useClientAuth = () => {
  const context = useContext(ClientAuthContext);
  if (!context) {
    throw new Error('useClientAuth must be used within a ClientAuthProvider');
  }
  return context;
};

export const ClientAuthProvider: React.FC<{ children: React.ReactNode; tenantId?: string }> = ({ children, tenantId }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClientAccount = useCallback(async (userId: string) => {
    try {
      let query = supabase
        .from('client_accounts')
        .select('*')
        .eq('user_id', userId);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error fetching client account:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchClientAccount:', error);
      return null;
    }
  }, [tenantId]);

  const finalizeClientAccount = useCallback(async (
    currentUser: User,
    payload?: {
      tenantId?: string;
      fullName?: string;
      phone?: string;
      birthDate?: string | null;
      preferredProfessionalId?: string;
      preferredServiceIds?: string[];
      photoUrl?: string | null;
    },
  ) => {
    const existingAccount = await fetchClientAccount(currentUser.id);
    if (existingAccount && !payload) return existingAccount;

    const { data, error } = await supabase.functions.invoke('finalize-client-account', {
      body: payload ?? {},
    });

    if (error) {
      console.error('Error finalizing client account:', error);
      throw new Error(await getSupabaseErrorMessage(error, data, 'Erro ao finalizar conta do cliente'));
    }

    if (data?.account) {
      return data.account as ClientAccount;
    }

    return await fetchClientAccount(currentUser.id);
  }, [fetchClientAccount]);

  const uploadClientPhoto = useCallback(async (tenantIdForPhoto: string, userId: string, file: File) => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `${tenantIdForPhoto}/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('client-photos')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('client-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }, []);

  const refreshClientAccount = useCallback(async () => {
    if (user) {
      const account = await fetchClientAccount(user.id);
      setClientAccount(account);
    }
  }, [user, fetchClientAccount]);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Defer data fetching to avoid deadlocks
          setTimeout(async () => {
            const emailConfirmed = Boolean(currentSession.user.email_confirmed_at);
            let account = await fetchClientAccount(currentSession.user.id);
            if (!account && (!CLIENT_EMAIL_CONFIRMATION_ENABLED || emailConfirmed)) {
              try {
                account = await finalizeClientAccount(currentSession.user);
              } catch (error) {
                console.error('Error auto-finalizing client account after auth state change:', error);
              }
            }
            setClientAccount(account);
            setLoading(false);
          }, 0);
        } else {
          setClientAccount(null);
          setLoading(false);
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        fetchClientAccount(currentSession.user.id).then(async account => {
          const emailConfirmed = Boolean(currentSession.user.email_confirmed_at);
          if (!account && (!CLIENT_EMAIL_CONFIRMATION_ENABLED || emailConfirmed)) {
            try {
              account = await finalizeClientAccount(currentSession.user);
            } catch (error) {
              console.error('Error auto-finalizing initial client account:', error);
            }
          }
          setClientAccount(account);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchClientAccount, finalizeClientAccount]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    birthDate: string | null,
    signupTenantId: string,
    preferredProfessionalId?: string,
    preferredServiceIds?: string[],
    photoFile?: File | null
  ) => {
    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          ...(CLIENT_EMAIL_CONFIRMATION_ENABLED
            ? { emailRedirectTo: window.location.href.replace(/\/cadastro.*$/, '/login') }
            : {}),
          data: {
            full_name: fullName.trim(),
            client_signup_tenant_id: signupTenantId,
            client_signup_phone: phone.trim(),
            client_signup_birth_date: birthDate,
            client_signup_preferred_professional_id: preferredProfessionalId || null,
            client_signup_preferred_service_ids: preferredServiceIds || [],
            client_signup_photo_url: null,
          },
        },
      });

      if (authError) {
        return { error: authError as Error };
      }

      if (!authData.user) {
        return { error: new Error('Erro ao criar usuário') };
      }

      if (!authData.session && CLIENT_EMAIL_CONFIRMATION_ENABLED) {
        return { error: null, needsEmailConfirmation: true };
      }

      if (!authData.session) {
        return {
          error: new Error('Cadastro criado, mas nenhuma sessão foi iniciada automaticamente. Confirme seu email antes de continuar.'),
        };
      }

      let account = await finalizeClientAccount(authData.user, {
        tenantId: signupTenantId,
        fullName,
        phone,
        birthDate,
        preferredProfessionalId,
        preferredServiceIds,
        photoUrl: null,
      });

      if (!account) {
        return { error: new Error('Erro ao criar conta de cliente') };
      }

      if (photoFile) {
        const photoUrl = await uploadClientPhoto(signupTenantId, authData.user.id, photoFile);
        account = await finalizeClientAccount(authData.user, {
          tenantId: signupTenantId,
          fullName,
          phone,
          birthDate,
          preferredProfessionalId,
          preferredServiceIds,
          photoUrl,
        });
      }

      return { error: null };
    } catch (error) {
      console.error('Error in signUp:', error);
      return { error: error instanceof Error ? error : new Error('Erro ao criar conta') };
    }
  };

  const resendSignupConfirmation = async (email: string) => {
    if (!CLIENT_EMAIL_CONFIRMATION_ENABLED) {
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.href.replace(/\/(cadastro|login).*$/, '/login'),
        },
      });
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setClientAccount(null);
  };

  const value: ClientAuthContextType = {
    user,
    session,
    clientAccount,
    loading,
    signIn,
    signUp,
    resendSignupConfirmation,
    signOut,
    refreshClientAccount,
  };

  return (
    <ClientAuthContext.Provider value={value}>
      {children}
    </ClientAuthContext.Provider>
  );
};
