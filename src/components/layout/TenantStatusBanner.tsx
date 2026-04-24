import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function TenantStatusBanner() {
  const { currentTenant, isSuperAdmin, refreshTenantStatus } = useAuth();

  // Refresh tenant status on mount to ensure we have the latest status
  useEffect(() => {
    if (!isSuperAdmin && currentTenant) {
      refreshTenantStatus();
    }
  }, []);

  // Super admins don't see tenant restrictions
  if (isSuperAdmin || !currentTenant) return null;

  if (currentTenant.status === 'blocked') {
    return (
      <Alert variant="destructive" className="mb-4 mx-4 mt-4">
        <Lock className="h-4 w-4" />
        <AlertTitle className="flex items-center justify-between">
          <span>Acesso Bloqueado</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refreshTenantStatus}
            className="h-6 px-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Verificar
          </Button>
        </AlertTitle>
        <AlertDescription>
          Sua conta está bloqueada. Entre em contato com o suporte para regularizar sua situação.
          Você pode visualizar os dados, mas não pode fazer alterações.
        </AlertDescription>
      </Alert>
    );
  }

  if (currentTenant.status === 'readonly') {
    return (
      <Alert className="mb-4 mx-4 mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200 flex items-center justify-between">
          <span>Modo Somente Leitura</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refreshTenantStatus}
            className="h-6 px-2 text-yellow-700 hover:text-yellow-800"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Verificar
          </Button>
        </AlertTitle>
        <AlertDescription className="text-yellow-700 dark:text-yellow-300">
          Sua assinatura está vencida. Você pode visualizar os dados, mas não pode fazer alterações.
          Entre em contato para renovar sua assinatura.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}