import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'professional' | null;
type TenantPackageType = 'salon' | 'aesthetic_clinic';

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

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  currentProfessional: Professional | null;
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string, userEmail: string) => {
    try {
      // Check if user is super admin
      const { data: superAdminData } = await supabase
        .from('super_admins')
        .select('id')
        .eq('email', userEmail)
        .maybeSingle();

      const isSuper = !!superAdminData;
      setIsSuperAdmin(isSuper);

      // Fetch user profile to get tenant_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      const profileTenantId = profileData?.tenant_id ?? null;

      if (profileTenantId) {
        setTenantId(profileTenantId);
        
        // Fetch tenant info including subscription_due_date
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, status, subscription_due_date, package_type')
          .eq('id', profileTenantId)
          .maybeSingle();

        if (tenantData) {
          // Check if subscription is expired and tenant is still 'active'
          let effectiveStatus = tenantData.status as 'active' | 'readonly' | 'blocked';
          
          if (tenantData.status === 'active' && tenantData.subscription_due_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(tenantData.subscription_due_date);
            dueDate.setHours(0, 0, 0, 0);
            
            // If subscription expired, treat as readonly
            if (dueDate < today) {
              effectiveStatus = 'readonly';
              console.log('Subscription expired, treating tenant as readonly');
            }
          }
          
          setCurrentTenant({
            id: tenantData.id,
            name: tenantData.name,
            status: effectiveStatus,
            package_type: (tenantData.package_type as TenantPackageType) || 'salon'
          });
        }
      } else {
        setTenantId(null);
        setCurrentTenant(null);
      }

      // Fetch user role
      let roleQuery = supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (profileTenantId) {
        roleQuery = roleQuery.eq('tenant_id', profileTenantId);
      } else if (!isSuper) {
        roleQuery = roleQuery.is('tenant_id', null);
      }

      const { data: roleData } = await roleQuery.maybeSingle();

      if (roleData) {
        setUserRole(roleData.role as UserRole);
      } else {
        setUserRole(null);
      }

      // Fetch permissions
      let permQuery = supabase
        .from('user_permissions')
        .select('permission')
        .eq('user_id', userId);

      if (profileTenantId) {
        permQuery = permQuery.eq('tenant_id', profileTenantId);
      } else if (!isSuper) {
        permQuery = permQuery.is('tenant_id', null);
      }

      const { data: permData } = await permQuery;

      if (permData) {
        setUserPermissions(permData.map(p => p.permission));
      }

      // Fetch professional linked to this user
      let profQuery = supabase
        .from('professionals')
        .select('id, name, nickname, has_schedule')
        .eq('user_id', userId);

      if (profileTenantId) {
        profQuery = profQuery.eq('tenant_id', profileTenantId);
      }

      const { data: profData } = await profQuery.maybeSingle();

      if (profData) {
        setCurrentProfessional(profData);
      } else {
        setCurrentProfessional(null);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

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
  }, []);

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
    if (!tenantId) return;
    
    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, name, status, subscription_due_date, package_type')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantData) {
        // Check if subscription is expired and tenant is still 'active'
        let effectiveStatus = tenantData.status as 'active' | 'readonly' | 'blocked';
        
        if (tenantData.status === 'active' && tenantData.subscription_due_date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dueDate = new Date(tenantData.subscription_due_date);
          dueDate.setHours(0, 0, 0, 0);
          
          // If subscription expired, treat as readonly
          if (dueDate < today) {
            effectiveStatus = 'readonly';
          }
        }
        
        setCurrentTenant({
          id: tenantData.id,
          name: tenantData.name,
          status: effectiveStatus,
          package_type: (tenantData.package_type as TenantPackageType) || 'salon'
        });
      }
    } catch (error) {
      console.error('Error refreshing tenant status:', error);
    }
  }, [tenantId]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      currentProfessional,
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
