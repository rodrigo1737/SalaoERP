import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
    photoUrl?: string | null
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  resendSignupConfirmation: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshClientAccount: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);

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

  const createClientAccountFromMetadata = useCallback(async (currentUser: User) => {
    const metadata = currentUser.user_metadata || {};
    const signupTenantId = metadata.client_signup_tenant_id || tenantId;
    const fullName = metadata.full_name;
    const phone = metadata.client_signup_phone;

    if (!signupTenantId || !fullName || !phone) return null;

    const existingAccount = await fetchClientAccount(currentUser.id);
    if (existingAccount) return existingAccount;

    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: String(fullName).trim(),
        phone: String(phone).trim(),
        email: currentUser.email,
        birth_date: metadata.client_signup_birth_date || null,
        tenant_id: signupTenantId,
        photo_url: metadata.client_signup_photo_url || null,
      })
      .select()
      .single();

    if (clientError) {
      console.error('Error creating client after email confirmation:', clientError);
      return null;
    }

    const { data: accountData, error: accountError } = await supabase
      .from('client_accounts')
      .insert({
        user_id: currentUser.id,
        client_id: clientData.id,
        tenant_id: signupTenantId,
        preferred_professional_id: metadata.client_signup_preferred_professional_id || null,
        terms_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (accountError) {
      console.error('Error creating client account after email confirmation:', accountError);
      return null;
    }

    const preferredServiceIds = Array.isArray(metadata.client_signup_preferred_service_ids)
      ? metadata.client_signup_preferred_service_ids
      : [];

    if (preferredServiceIds.length > 0) {
      await supabase
        .from('client_preferred_services')
        .insert(
          preferredServiceIds.map((serviceId: string) => ({
            client_account_id: accountData.id,
            service_id: serviceId,
          }))
        );
    }

    return accountData;
  }, [fetchClientAccount, tenantId]);

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
            let account = await fetchClientAccount(currentSession.user.id);
            if (!account && currentSession.user.email_confirmed_at) {
              account = await createClientAccountFromMetadata(currentSession.user);
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
          if (!account && currentSession.user.email_confirmed_at) {
            account = await createClientAccountFromMetadata(currentSession.user);
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
  }, [fetchClientAccount, createClientAccountFromMetadata]);

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
    photoUrl?: string | null
  ) => {
    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.href.replace(/\/cadastro.*$/, '/login'),
          data: {
            full_name: fullName.trim(),
            client_signup_tenant_id: signupTenantId,
            client_signup_phone: phone.trim(),
            client_signup_birth_date: birthDate,
            client_signup_preferred_professional_id: preferredProfessionalId || null,
            client_signup_preferred_service_ids: preferredServiceIds || [],
            client_signup_photo_url: photoUrl || null,
          },
        },
      });

      if (authError) {
        return { error: authError as Error };
      }

      if (!authData.user) {
        return { error: new Error('Erro ao criar usuário') };
      }

      if (!authData.session) {
        return { error: null, needsEmailConfirmation: true };
      }

      // Create client record
      const account = await createClientAccountFromMetadata(authData.user);
      if (!account) {
        return { error: new Error('Erro ao criar conta de cliente') };
      }

      return { error: null };
    } catch (error) {
      console.error('Error in signUp:', error);
      return { error: error as Error };
    }
  };

  const resendSignupConfirmation = async (email: string) => {
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
