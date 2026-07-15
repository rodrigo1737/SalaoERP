import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TenantStatusBanner } from '@/components/layout/TenantStatusBanner';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { SuperAdminDashboard } from '@/components/dashboard/SuperAdminDashboard';
import { Schedule } from '@/components/schedule/Schedule';
import { ClientsList } from '@/components/clients/ClientsList';
import { ProfessionalsList } from '@/components/professionals/ProfessionalsList';
import { ServicesList } from '@/components/services/ServicesList';
import { ServiceCommissionMatrix } from '@/components/services/ServiceCommissionMatrix';
import { CommissionReprocessing } from '@/components/commissions/CommissionReprocessing';
import { ProfessionalStatement } from '@/components/commissions/ProfessionalStatement';
import { ProductsList } from '@/components/products/ProductsList';
import { AestheticsModule } from '@/components/aesthetics/AestheticsModule';
import { CleaningModule } from '@/components/cleaning/CleaningModule';
import { Commissions } from '@/components/commissions/Commissions';
import { Cashier } from '@/components/cashier/Cashier';
import { CashHistory } from '@/components/cashier/CashHistory';
import { Reports } from '@/components/reports/Reports';
import { TenantsList } from '@/components/tenants/TenantsList';
import { Settings } from '@/components/settings/Settings';
import { DataProvider } from '@/context/DataContext';
import { StableDataProvider } from '@/context/StableDataContext';
import { StockProvider } from '@/context/StockContext';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { isCleaningControlTenant } from '@/lib/tenantSegments';
import {
  type AppPageId,
  type NavigationAccessContext,
  canAccessAppPage,
  getDefaultAppPage,
} from '@/lib/appNavigation';

import { SuppliersList } from '@/components/stock/SuppliersList';
import { PurchaseEntry } from '@/components/stock/PurchaseEntry';
import { StockMovements } from '@/components/stock/StockMovements';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const { userRole, isSuperAdmin, hasPermission, currentTenant, loading } = useAuth();
  const isCleaningTenant = isCleaningControlTenant(currentTenant);

  const navigationContext = useCallback<() => NavigationAccessContext>(() => ({
    isSuperAdmin,
    userRole,
    currentTenant,
    hasPermission,
  }), [currentTenant, hasPermission, isSuperAdmin, userRole]);

  const isValidAppPage = (targetPage?: string): targetPage is AppPageId => {
    if (!targetPage) return false;

    const validPages: AppPageId[] = [
      'dashboard',
      'agenda',
      'clients',
      'professionals',
      'services',
      'commission-matrix',
      'products',
      'aesthetics',
      'cleaning',
      'suppliers',
      'purchase',
      'stock-movements',
      'commissions',
      'commission-reprocessing',
      'professional-statement',
      'reports',
      'cashier',
      'financial-management',
      'settings',
      'super-dashboard',
      'tenants',
    ];

    return validPages.includes(targetPage as AppPageId);
  };

  // Redireciona para página padrão se nenhuma foi informada na URL
  useEffect(() => {
    if (loading) return;
    if (!page) {
      navigate(`/app/${getDefaultAppPage(navigationContext())}`, { replace: true });
    }
  }, [page, navigate, navigationContext, loading]);

  // Redireciona profissional que tentou acessar página de admin
  useEffect(() => {
    if (loading) return;
    if (!page || !isValidAppPage(page)) {
      navigate(`/app/${getDefaultAppPage(navigationContext())}`, { replace: true });
      return;
    }

    if (!canAccessAppPage(page, navigationContext())) {
      navigate(`/app/${getDefaultAppPage(navigationContext())}`, { replace: true });
    }
  }, [page, navigate, navigationContext, loading]);

  const currentPage = (isValidAppPage(page) ? page : getDefaultAppPage(navigationContext())) as AppPageId;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleNavigate = (targetPage: string) => {
    const resolvedPage = isCleaningTenant && targetPage === 'agenda' ? 'cleaning' : targetPage;
    navigate(`/app/${resolvedPage}`);
  };

  const renderPage = () => {
    if (isSuperAdmin) {
      if (currentPage === 'tenants') return <TenantsList />;
      return <SuperAdminDashboard onNavigate={handleNavigate} />;
    }

    switch (currentPage) {
      case 'dashboard':        return <Dashboard onNavigate={handleNavigate} />;
      case 'agenda':           return <Schedule />;
      case 'clients':          return <ClientsList />;
      case 'professionals':    return <ProfessionalsList />;
      case 'services':         return <ServicesList />;
      case 'commission-matrix': return <ServiceCommissionMatrix />;
      case 'products':         return <ProductsList />;
      case 'aesthetics':       return <AestheticsModule />;
      case 'cleaning':         return <CleaningModule />;
      case 'suppliers':        return <SuppliersList />;
      case 'purchase':         return <PurchaseEntry />;
      case 'stock-movements':  return <StockMovements />;
      case 'commissions':      return <Commissions />;
      case 'commission-reprocessing': return <CommissionReprocessing />;
      case 'professional-statement': return <ProfessionalStatement />;
      case 'reports':          return <Reports />;
      case 'cashier':          return <Cashier />;
      case 'financial-management': return <CashHistory />;
      case 'settings':         return <Settings />;
      default:
        return (
          <div className="p-8 flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Em Construção</h2>
              <p className="text-muted-foreground">Esta funcionalidade será implementada em breve.</p>
            </div>
          </div>
        );
    }
  };

  const appShell = (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />
      <main className="flex-1 min-h-screen overflow-x-hidden pl-4">
        <TenantStatusBanner />
        {renderPage()}
      </main>
    </div>
  );

  return (
    <TenantSettingsProvider>
      <DataProvider>
        <StableDataProvider>
          {isCleaningTenant ? (
            appShell
          ) : (
            <StockProvider>
              {appShell}
            </StockProvider>
          )}
        </StableDataProvider>
      </DataProvider>
    </TenantSettingsProvider>
  );
};

export default Index;
