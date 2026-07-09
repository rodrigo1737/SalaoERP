import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'professional' | 'staff' | null;
type TenantPackageType = 'salon' | 'aesthetic_clinic' | 'cleaning_control' | 'business_erp';

interface Professional {
  id: string;
  name: string;
  nickname: string;
  has_schedule: boolean;
}

interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'readonly' | 'blocked';
  package_type: TenantPackageType;
}

interface AccessContextRow {
  tenant_id: string | null;
  is_owner: boolean | null;
  is_super_admin: boolean | null;
  profile_email: string | null;
  full_name: string | null;
  tenant_name: string | null;
  tenant_status: string | null;
  subscription_due_date: string | null;
  package_type: string | null;
  roles: string[] | null;
  permissions: string[] | null;
  professional_id: string | null;
  professional_name: string | null;
  professional_nickname: string | null;
  professional_has_schedule: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  currentProfessional: Professional | null;
  isOwner: boolean;
  isSuperAdmin: boolean;
  currentTenant: Tenant | null;
  tenantId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  canModify: () => boolean;
  refreshTenantStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [currentProfessional, setCurrentProfessional] = useState<Professional | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveTenantStatus = useCallback((tenantStatus: string | null, subscriptionDueDate: string | null) => {
    let effectiveStatus = (tenantStatus as 'active' | 'readonly' | 'blocked' | null) ?? null;

    if (effectiveStatus === 'active' && subscriptionDueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(subscriptionDueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        effectiveStatus = 'readonly';
      }
    }

    return effectiveStatus;
  }, []);

  const applyAccessContext = useCallback((accessContext: AccessContextRow | null) => {
    const nextTenantId = accessContext?.tenant_id ?? null;
    const roles = accessContext?.roles ?? [];
    const permissions = accessContext?.permissions ?? [];
    const packageType = (accessContext?.package_type as TenantPackageType | null) ?? 'salon';
    const effectiveStatus = resolveTenantStatus(accessContext?.tenant_status ?? null, accessContext?.subscription_due_date ?? null);

    setTenantId(nextTenantId);
    setIsOwner(Boolean(accessContext?.is_owner));
    setIsSuperAdmin(Boolean(accessContext?.is_super_admin));
    setUserPermissions(permissions);

    if (roles.includes('admin')) {
      setUserRole('admin');
    } else if (roles.includes('professional')) {
      setUserRole('professional');
    } else if (roles.includes('staff')) {
      setUserRole('staff');
    } else {
      setUserRole(null);
    }

    if (nextTenantId && accessContext?.tenant_name && effectiveStatus) {
      setCurrentTenant({
        id: nextTenantId,
        name: accessContext.tenant_name,
        status: effectiveStatus,
        package_type: packageType,
      });
    } else {
      setCurrentTenant(null);
    }

    if (accessContext?.professional_id && accessContext?.professional_name) {
      setCurrentProfessional({
        id: accessContext.professional_id,
        name: accessContext.professional_name,
        nickname: accessContext.professional_nickname || accessContext.professional_name,
        has_schedule: Boolean(accessContext.professional_has_schedule),
      });
    } else {
      setCurrentProfessional(null);
    }
  }, [resolveTenantStatus]);

  const fetchUserData = useCallback(async (_userId: string, _userEmail: string) => {
    try {
      const { data, error } = await supabase.rpc('get_my_access_context');
      if (error) {
        console.error('Error fetching access context:', error);
        throw error;
      }

      const accessContext = (Array.isArray(data) ? data[0] : data) as AccessContextRow | null;

      if (!accessContext) {
        setTenantId(null);
        setCurrentTenant(null);
        setUserRole(null);
        setUserPermissions([]);
        setCurrentProfessional(null);
        setIsOwner(false);
        setIsSuperAdmin(false);
        return;
      }

      applyAccessContext(accessContext);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setTenantId(null);
      setCurrentTenant(null);
      setUserRole(null);
      setUserPermissions([]);
      setCurrentProfessional(null);
      setIsOwner(false);
      setIsSuperAdmin(false);
    }
  }, [applyAccessContext]);

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener FIRST - NO async callback to prevent deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        // Only synchronous state updates here
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setLoading(true);
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(() => {
            if (isMounted) {
              fetchUserData(session.user.id, session.user.email || '').then(() => {
                if (isMounted) {
                  setLoading(false);
                }
              });
            }
          }, 0);
        } else {
          setUserRole(null);
          setUserPermissions([]);
          setCurrentProfessional(null);
          setIsOwner(false);
          setIsSuperAdmin(false);
          setCurrentTenant(null);
          setTenantId(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setLoading(true);
        fetchUserData(session.user.id, session.user.email || '').then(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // Always clear local state, even if signOut fails
      setUser(null);
      setSession(null);
      setUserRole(null);
      setUserPermissions([]);
      setCurrentProfessional(null);
      setIsOwner(false);
      setIsSuperAdmin(false);
      setCurrentTenant(null);
      setTenantId(null);
    }
  };

  const hasPermission = (permission: string): boolean => {
    // Super admin and admin have all permissions
    if (isSuperAdmin || userRole === 'admin') return true;
    return userPermissions.includes(permission);
  };

  const canModify = (): boolean => {
    // Super admin can always modify
    if (isSuperAdmin) return true;
    // If no tenant, can't modify
    if (!currentTenant) return false;
    // Only active tenants can modify
    return currentTenant.status === 'active';
  };

  const refreshTenantStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_access_context');
      if (error) throw error;

      const accessContext = (Array.isArray(data) ? data[0] : data) as AccessContextRow | null;
      if (accessContext) applyAccessContext(accessContext);
    } catch (error) {
      console.error('Error refreshing tenant status:', error);
    }
  }, [applyAccessContext]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      currentProfessional,
      isOwner,
      isSuperAdmin,
      currentTenant,
      tenantId,
      loading,
      signIn,
      signUp,
      signOut,
      hasPermission,
      canModify,
      refreshTenantStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
