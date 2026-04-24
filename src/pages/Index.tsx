import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TenantStatusBanner } from '@/components/layout/TenantStatusBanner';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { SuperAdminDashboard } from '@/components/dashboard/SuperAdminDashboard';
import { Schedule } from '@/components/schedule/Schedule';
import { ClientsList } from '@/components/clients/ClientsList';
import { ProfessionalsList } from '@/components/professionals/ProfessionalsList';
import { ServicesList } from '@/components/services/ServicesList';
import { ProductsList } from '@/components/products/ProductsList';
import { Commissions } from '@/components/commissions/Commissions';
import { Cashier } from '@/components/cashier/Cashier';
import { Reports } from '@/components/reports/Reports';
import { TenantsList } from '@/components/tenants/TenantsList';
import { Settings } from '@/components/settings/Settings';
import { DataProvider } from '@/context/DataContext';
import { StableDataProvider } from '@/context/StableDataContext';
import { StockProvider } from '@/context/StockContext';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { useAuth } from '@/contexts/AuthContext';

import { SuppliersList } from '@/components/stock/SuppliersList';
import { PurchaseEntry } from '@/components/stock/PurchaseEntry';
import { StockMovements } from '@/components/stock/StockMovements';

// Páginas válidas por perfil
const ADMIN_PAGES = ['dashboard', 'agenda', 'clients', 'professionals', 'services', 'products',
  'suppliers', 'purchase', 'stock-movements', 'commissions', 'reports', 'cashier', 'settings'];
const PROFESSIONAL_PAGES = ['agenda', 'commissions', 'settings'];
const SUPER_ADMIN_PAGES = ['super-dashboard', 'tenants'];

const Index = () => {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const { userRole, isSuperAdmin } = useAuth();
  const isAdmin = userRole === 'admin';

  // Redireciona para página padrão se nenhuma foi informada na URL
  useEffect(() => {
    if (!page) {
      if (isSuperAdmin) navigate('/app/super-dashboard', { replace: true });
      else if (isAdmin) navigate('/app/dashboard', { replace: true });
      else navigate('/app/agenda', { replace: true });
    }
  }, [page, isSuperAdmin, isAdmin, navigate]);

  // Redireciona profissional que tentou acessar página de admin
  useEffect(() => {
    if (!isSuperAdmin && !isAdmin && page && !PROFESSIONAL_PAGES.includes(page)) {
      navigate('/app/agenda', { replace: true });
    }
    if (isSuperAdmin && page && !SUPER_ADMIN_PAGES.includes(page)) {
      navigate('/app/super-dashboard', { replace: true });
    }
  }, [page, isSuperAdmin, isAdmin, navigate]);

  const currentPage = page ?? (isSuperAdmin ? 'super-dashboard' : isAdmin ? 'dashboard' : 'agenda');

  const handleNavigate = (targetPage: string) => {
    navigate(`/app/${targetPage}`);
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
      case 'products':         return <ProductsList />;
      case 'suppliers':        return <SuppliersList />;
      case 'purchase':         return <PurchaseEntry />;
      case 'stock-movements':  return <StockMovements />;
      case 'commissions':      return <Commissions />;
      case 'reports':          return <Reports />;
      case 'cashier':          return <Cashier />;
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

  return (
    <TenantSettingsProvider>
      <DataProvider>
        <StableDataProvider>
        <StockProvider>
          <div className="flex min-h-screen w-full bg-background">
            <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />
            <main className="flex-1 min-h-screen overflow-x-hidden pl-4">
              <TenantStatusBanner />
              {renderPage()}
            </main>
          </div>
        </StockProvider>
        </StableDataProvider>
      </DataProvider>
    </TenantSettingsProvider>
  );
};

export default Index;
