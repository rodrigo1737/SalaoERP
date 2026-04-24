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
  ) => Promise<{ error: Error | null }>;
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
      const { data, error } = await supabase
        .from('client_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching client account:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchClientAccount:', error);
      return null;
    }
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
            const account = await fetchClientAccount(currentSession.user.id);
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
        fetchClientAccount(currentSession.user.id).then(account => {
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
  }, [fetchClientAccount]);

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
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (authError) {
        return { error: authError as Error };
      }

      if (!authData.user) {
        return { error: new Error('Erro ao criar usuário') };
      }

      // Create client record
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          birth_date: birthDate,
          tenant_id: signupTenantId,
          photo_url: photoUrl || null,
        })
        .select()
        .single();

      if (clientError) {
        console.error('Error creating client:', clientError);
        return { error: new Error('Erro ao criar registro de cliente') };
      }

      // Create client account
      const { error: accountError } = await supabase
        .from('client_accounts')
        .insert({
          user_id: authData.user.id,
          client_id: clientData.id,
          tenant_id: signupTenantId,
          preferred_professional_id: preferredProfessionalId || null,
          terms_accepted_at: new Date().toISOString(),
        });

      if (accountError) {
        console.error('Error creating client account:', accountError);
        return { error: new Error('Erro ao criar conta de cliente') };
      }

      // Add preferred services if provided
      if (preferredServiceIds && preferredServiceIds.length > 0) {
        const { data: accountData } = await supabase
          .from('client_accounts')
          .select('id')
          .eq('user_id', authData.user.id)
          .single();

        if (accountData) {
          await supabase
            .from('client_preferred_services')
            .insert(
              preferredServiceIds.map(serviceId => ({
                client_account_id: accountData.id,
                service_id: serviceId,
              }))
            );
        }
      }

      return { error: null };
    } catch (error) {
      console.error('Error in signUp:', error);
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
    signOut,
    refreshClientAccount,
  };

  return (
    <ClientAuthContext.Provider value={value}>
      {children}
    </ClientAuthContext.Provider>
  );
};
