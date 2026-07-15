import { hasCleaningModulePackage, isCleaningControlTenant } from '@/lib/tenantSegments';

export type UserRole = 'admin' | 'professional' | 'staff' | null;
export type AppPageId =
  | 'dashboard'
  | 'agenda'
  | 'clients'
  | 'professionals'
  | 'services'
  | 'commission-matrix'
  | 'products'
  | 'aesthetics'
  | 'cleaning'
  | 'suppliers'
  | 'purchase'
  | 'stock-movements'
  | 'commissions'
  | 'commission-reprocessing'
  | 'professional-statement'
  | 'reports'
  | 'cashier'
  | 'financial-management'
  | 'settings'
  | 'super-dashboard'
  | 'tenants';

export type SidebarTargetId = AppPageId | 'admin-access';
export type SidebarSectionId =
  | 'operation'
  | 'registrations'
  | 'financial'
  | 'inventory'
  | 'reports'
  | 'administration';

type TenantLike = {
  package_type?: string | null;
} | null;

export interface NavigationAccessContext {
  isSuperAdmin: boolean;
  userRole: UserRole;
  currentTenant: TenantLike;
  hasPermission: (permission: string) => boolean;
}

export interface SidebarSectionDefinition {
  id: SidebarSectionId;
  label: string;
  targets: SidebarTargetId[];
}

interface SidebarTargetDefinition {
  id: SidebarTargetId;
  label: string;
  appPageId?: AppPageId;
  path: string;
}

const REGULAR_TOP_TARGETS: AppPageId[] = ['dashboard', 'agenda'];
const CLEANING_TOP_TARGETS: AppPageId[] = ['dashboard', 'cleaning'];
const SUPER_ADMIN_TOP_TARGETS: AppPageId[] = ['super-dashboard', 'tenants'];

const SIDEBAR_SECTIONS: SidebarSectionDefinition[] = [
  { id: 'operation', label: 'Operação', targets: ['clients', 'aesthetics'] },
  { id: 'registrations', label: 'Cadastros', targets: ['professionals', 'services', 'products'] },
  { id: 'financial', label: 'Financeiro', targets: ['financial-management'] },
  { id: 'inventory', label: 'Estoque', targets: ['suppliers', 'purchase', 'stock-movements'] },
  { id: 'reports', label: 'Relatórios', targets: ['reports'] },
  { id: 'administration', label: 'Administração', targets: ['admin-access', 'settings'] },
];

const SIDEBAR_TARGETS: Record<SidebarTargetId, SidebarTargetDefinition> = {
  dashboard: { id: 'dashboard', appPageId: 'dashboard', label: 'Dashboard', path: '/app/dashboard' },
  agenda: { id: 'agenda', appPageId: 'agenda', label: 'Agenda', path: '/app/agenda' },
  clients: { id: 'clients', appPageId: 'clients', label: 'Clientes', path: '/app/clients' },
  professionals: { id: 'professionals', appPageId: 'professionals', label: 'Profissionais', path: '/app/professionals' },
  services: { id: 'services', appPageId: 'services', label: 'Serviços', path: '/app/services' },
  'commission-matrix': { id: 'commission-matrix', appPageId: 'commission-matrix', label: 'Habilitações e Comissões', path: '/app/commission-matrix' },
  products: { id: 'products', appPageId: 'products', label: 'Produtos', path: '/app/products' },
  aesthetics: { id: 'aesthetics', appPageId: 'aesthetics', label: 'Estética', path: '/app/aesthetics' },
  cleaning: { id: 'cleaning', appPageId: 'cleaning', label: 'Agenda de Limpeza', path: '/app/cleaning' },
  suppliers: { id: 'suppliers', appPageId: 'suppliers', label: 'Fornecedores', path: '/app/suppliers' },
  purchase: { id: 'purchase', appPageId: 'purchase', label: 'Entradas', path: '/app/purchase' },
  'stock-movements': { id: 'stock-movements', appPageId: 'stock-movements', label: 'Movimentações', path: '/app/stock-movements' },
  cashier: { id: 'cashier', appPageId: 'cashier', label: 'Caixa e Movimentações', path: '/app/cashier' },
  'financial-management': { id: 'financial-management', appPageId: 'financial-management', label: 'Central Financeira', path: '/app/financial-management' },
  commissions: { id: 'commissions', appPageId: 'commissions', label: 'Comissões, Repasses e Extratos', path: '/app/commissions' },
  'commission-reprocessing': { id: 'commission-reprocessing', appPageId: 'commission-reprocessing', label: 'Reprocessamento', path: '/app/commission-reprocessing' },
  'professional-statement': { id: 'professional-statement', appPageId: 'professional-statement', label: 'Extrato do Profissional', path: '/app/professional-statement' },
  reports: { id: 'reports', appPageId: 'reports', label: 'Relatórios', path: '/app/reports' },
  settings: { id: 'settings', appPageId: 'settings', label: 'Configurações', path: '/app/settings' },
  'super-dashboard': { id: 'super-dashboard', appPageId: 'super-dashboard', label: 'Painel B2B', path: '/app/super-dashboard' },
  tenants: { id: 'tenants', appPageId: 'tenants', label: 'Clientes B2B', path: '/app/tenants' },
  'admin-access': { id: 'admin-access', label: 'Equipe e Acessos', path: '/admin' },
};

const isAdminUser = (ctx: NavigationAccessContext) => ctx.userRole === 'admin';

export const getSidebarTargetDefinition = (target: SidebarTargetId) => SIDEBAR_TARGETS[target];

export const canAccessSidebarTarget = (target: SidebarTargetId, ctx: NavigationAccessContext) => {
  if (target === 'admin-access') {
    return !ctx.isSuperAdmin && isAdminUser(ctx);
  }

  return canAccessAppPage(target, ctx);
};

export const canAccessAppPage = (page: AppPageId, ctx: NavigationAccessContext) => {
  if (ctx.isSuperAdmin) {
    return page === 'super-dashboard' || page === 'tenants';
  }

  const isCleaningTenant = isCleaningControlTenant(ctx.currentTenant);
  const admin = isAdminUser(ctx);
  const can = (permission: string) => ctx.hasPermission(permission);

  switch (page) {
    case 'dashboard':
      return admin;
    case 'agenda':
      return !isCleaningTenant && (admin || can('view_schedule') || can('edit_schedule'));
    case 'clients':
      return admin || can('view_clients');
    case 'professionals':
      return admin;
    case 'services':
    case 'commission-matrix':
    case 'products':
    case 'suppliers':
    case 'purchase':
    case 'stock-movements':
    case 'reports':
      return !isCleaningTenant && admin;
    case 'aesthetics': {
      const packageType = ctx.currentTenant?.package_type;
      return admin && (packageType === 'aesthetic_clinic' || packageType === 'business_erp');
    }
    case 'cleaning':
      return hasCleaningModulePackage(ctx.currentTenant) && (admin || can('view_schedule') || can('edit_schedule'));
    case 'cashier':
      return !isCleaningTenant && (admin || can('manage_cash_flow') || can('reverse_financial_entries'));
    case 'financial-management':
      return !isCleaningTenant && (
        admin
        || can('manage_cash_flow')
        || can('view_financial_history')
        || can('reverse_financial_entries')
        || can('view_commissions')
      );
    case 'commissions':
    case 'professional-statement':
      return !isCleaningTenant && (admin || can('view_commissions'));
    case 'commission-reprocessing':
      return !isCleaningTenant && (admin || can('reverse_financial_entries'));
    case 'settings':
      return true;
    case 'super-dashboard':
    case 'tenants':
      return false;
    default:
      return false;
  }
};

export const getDefaultAppPage = (ctx: NavigationAccessContext): AppPageId => {
  if (ctx.isSuperAdmin) return 'super-dashboard';
  if (isAdminUser(ctx)) return 'dashboard';
  if (canAccessAppPage('cleaning', ctx)) return 'cleaning';
  if (canAccessAppPage('agenda', ctx)) return 'agenda';
  if (canAccessAppPage('commissions', ctx)) return 'commissions';
  return 'settings';
};

export const getVisibleTopTargets = (ctx: NavigationAccessContext): SidebarTargetId[] => {
  if (ctx.isSuperAdmin) {
    return SUPER_ADMIN_TOP_TARGETS.filter((target) => canAccessAppPage(target, ctx));
  }

  const baseTargets = isCleaningControlTenant(ctx.currentTenant) ? CLEANING_TOP_TARGETS : REGULAR_TOP_TARGETS;
  return baseTargets.filter((target) => canAccessAppPage(target, ctx));
};

export const getVisibleSidebarSections = (ctx: NavigationAccessContext): SidebarSectionDefinition[] => {
  if (ctx.isSuperAdmin) return [];

  return SIDEBAR_SECTIONS
    .map((section) => ({
      ...section,
      targets: section.targets.filter((target) => canAccessSidebarTarget(target, ctx)),
    }))
    .filter((section) => section.targets.length > 0);
};
